import { useState, useEffect } from 'react';
import { Plus, Check, X, AlertTriangle, Loader2, Info, Clock } from 'lucide-react';
import { collection, getDocs, addDoc, setDoc, doc, serverTimestamp, Timestamp, query, where, orderBy, limit } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/context/AuthContext';
import { startOfDay, isBefore, parseISO } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';

interface Course {
  ID_Curso: string;
  NombreCurso: string;
  Disciplina: string;
  Estilo: string;
  Nivel: string;
  Subnivel?: string;
  Modalidad?: string;
  DiaSemana: number; // 1=Sun, 2=Mon, ...
  HoraInicio: string;
  FechaInicioCurso: string | Timestamp;
  FechaFinCurso: string | Timestamp;
}

const WEEKDAYS = [
  { label: 'Lunes', short: 'Lun', value: 2 },
  { label: 'Martes', short: 'Mar', value: 3 },
  { label: 'Miércoles', short: 'Mié', value: 4 },
  { label: 'Jueves', short: 'Jue', value: 5 },
  { label: 'Viernes', short: 'Vie', value: 6 },
];

export default function Courses() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [filteredCourses, setFilteredCourses] = useState<Course[]>([]);
  const [enrolledCourseIds, setEnrolledCourseIds] = useState<Set<string>>(new Set());
  const [pendingCourseIds, setPendingCourseIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [selectedDayValue, setSelectedDayValue] = useState<number>(2); // Default Monday
  const { user } = useAuth();

  // Modal State
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [currentFee, setCurrentFee] = useState<number>(0);
  const [enrolledCoursesList, setEnrolledCoursesList] = useState<Course[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    // Set default selected day to current day of week if it's Mon-Fri
    const todayDay = new Date().getDay() + 1; // 1-7
    if (todayDay >= 2 && todayDay <= 6) {
        setSelectedDayValue(todayDay);
    } else {
        setSelectedDayValue(2); // Monday
    }

    const fetchCourses = async () => {
      try {
        // 1. Fetch Courses
        const querySnapshot = await getDocs(collection(db, 'Cursos'));
        const todayDate = startOfDay(new Date());

        const coursesData = querySnapshot.docs.map(doc => ({
          ID_Curso: doc.id,
          ...doc.data()
        })) as Course[];

        // Filter active or future courses
        const activeCourses = coursesData.filter(course => {
          if (!course.FechaFinCurso) return true;
          
          let end = new Date();
          
          if (course.FechaFinCurso instanceof Timestamp) {
            end = course.FechaFinCurso.toDate();
          } else {
             let dateStr = String(course.FechaFinCurso);
             if (dateStr.includes('/')) dateStr = dateStr.replace(/\//g, '-');
             
             if (!dateStr.startsWith('20')) {
                const parts = dateStr.split('-');
                if (parts.length === 3 && parts[2].length === 4) {
                   dateStr = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
                }
             }
             
             const parsed = parseISO(dateStr);
             if (!isNaN(parsed.getTime())) {
                end = parsed;
             } else {
                return true; 
             }
          }
          
          return !isBefore(startOfDay(end), todayDate); 
        });

        setCourses(activeCourses);

        // 2. Fetch Enrolled Courses, Pending Requests & Fee Info
        if (user) {
            // Enrolled Courses
            const assignmentsQ = query(
                collection(db, 'Cursos_Asignacion_Alumnos'),
                where('ID_Alumno', '==', user.ID_Alumno)
            );
            const assignmentsSnap = await getDocs(assignmentsQ);
            const enrolledIds = new Set(assignmentsSnap.docs.map(doc => doc.data().ID_Curso));
            setEnrolledCourseIds(enrolledIds);

            // Pending Requests
            const pendingQ = query(
                collection(db, 'Solicitudes_Cursos_Adicionales'),
                where('ID_Alumno', '==', user.ID_Alumno),
                where('Estado', '==', 'Pendiente')
            );
            const pendingSnap = await getDocs(pendingQ);
            const pendingIds = new Set(pendingSnap.docs.map(doc => doc.data().ID_Curso));
            setPendingCourseIds(pendingIds);

            // Latest Fee
            const feesQ = query(
                collection(db, 'PagosCuotas'),
                where('ID_Alumno', '==', user.ID_Alumno),
                orderBy('FechaDePago', 'desc'),
                limit(1)
            );
            // Note: orderBy requires index. If it fails, we fallback to client-side sort or just take any.
            // For safety in this environment without guaranteed indexes, let's fetch recent ones.
            // Actually, let's try a safe approach: fetch all (usually small number per user) and sort in memory.
            const allFeesQ = query(
                collection(db, 'PagosCuotas'),
                where('ID_Alumno', '==', user.ID_Alumno)
            );
            const allFeesSnap = await getDocs(allFeesQ);
            const fees = allFeesSnap.docs.map(doc => doc.data());
            
            if (fees.length > 0) {
                // Sort by date desc
                fees.sort((a, b) => {
                    const dateA = a.FechaDePago ? new Date(a.FechaDePago).getTime() : 0;
                    const dateB = b.FechaDePago ? new Date(b.FechaDePago).getTime() : 0;
                    return dateB - dateA;
                });
                // Take the most recent one that looks like a monthly fee
                const latestFee = fees[0];
                setCurrentFee(latestFee.Total || latestFee.Cuota || 0);
            }
        }

      } catch (error) {
        console.error("Error fetching courses:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchCourses();
  }, [user]);

  useEffect(() => {
    if (selectedDayValue) {
      const filtered = courses.filter(course => {
        return course.DiaSemana === selectedDayValue;
      });
      
      // Sort by time
      filtered.sort((a, b) => a.HoraInicio.localeCompare(b.HoraInicio));
      
      setFilteredCourses(filtered);
    }
  }, [selectedDayValue, courses]);

  const openRequestModal = (course: Course) => {
      setSelectedCourse(course);
      
      // Prepare list of currently enrolled courses details
      const current = courses.filter(c => enrolledCourseIds.has(c.ID_Curso));
      setEnrolledCoursesList(current);
      
      setShowConfirmModal(true);
  };

  const confirmRequest = async () => {
    if (!user || !selectedCourse) return;
    
    setIsSubmitting(true);
    try {
      const requestId = `${user.ID_Alumno}_${selectedCourse.ID_Curso}`;
      await setDoc(doc(db, 'Solicitudes_Cursos_Adicionales', requestId), {
        ID_Alumno: user.ID_Alumno,
        ID_Curso: selectedCourse.ID_Curso,
        NombreCurso: selectedCourse.NombreCurso || `${selectedCourse.Disciplina} ${selectedCourse.Estilo}`,
        FechaSolicitud: serverTimestamp(),
        Estado: 'Pendiente'
      });
      
      // Update local state to reflect the new pending request immediately
      setPendingCourseIds(prev => new Set(prev).add(selectedCourse.ID_Curso));

      alert('Solicitud enviada correctamente');
      setShowConfirmModal(false);
    } catch (error) {
      console.error("Error requesting course:", error);
      alert('Error al enviar la solicitud');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) return <div className="p-8 text-center text-gray-500">Cargando cursos...</div>;

  return (
    <div className="space-y-6 pt-8 pb-24 relative">
      <h1 className="text-2xl font-bold px-2 text-[#2e2f43]">Cursos Disponibles</h1>

      {/* Day Selector - Generic Mon-Fri */}
      <div className="flex space-x-4 overflow-x-auto py-2 px-4 scrollbar-hide -mx-4">
        {WEEKDAYS.map((day) => {
          const isSelected = selectedDayValue === day.value;
          return (
            <button
              key={day.value}
              onClick={() => setSelectedDayValue(day.value)}
              className={`flex-shrink-0 flex flex-col items-center justify-center w-14 h-14 rounded-full transition-all duration-300 ${
                isSelected
                  ? 'bg-[#2e2f43] text-white shadow-lg scale-110'
                  : 'bg-transparent text-[#2e2f43]/60 hover:bg-gray-100'
              }`}
            >
              <span className="text-sm font-medium capitalize">{day.short}</span>
              {isSelected && <div className="w-1 h-1 bg-[#ffba15] rounded-full mt-1 shadow-[0_0_5px_#ffba15]" />}
            </button>
          );
        })}
      </div>

      {/* Timeline */}
      <div className="px-2 relative">
        {/* Vertical Line */}
        <div className="absolute left-[29px] top-0 bottom-0 w-[2px] bg-[#2e2f43]/10" />

        <div className="space-y-8">
          {filteredCourses.map((course) => {
            const isEnrolled = enrolledCourseIds.has(course.ID_Curso);
            const isPending = pendingCourseIds.has(course.ID_Curso);

            return (
              <div key={course.ID_Curso} className="relative pl-12">
                {/* Timeline Dot */}
                <div className={`absolute left-0 top-6 w-4 h-4 rounded-full border-2 z-10 transition-colors duration-300 ${
                    isEnrolled 
                        ? 'border-[#ffba15] bg-[#ffba15] shadow-[0_0_10px_#ffba15]' 
                        : isPending
                            ? 'border-gray-400 bg-gray-400'
                            : 'border-[#2e2f43]/30 bg-gray-50'
                }`}>
                </div>

                {/* Card - Liquid Glass Style */}
                <div className={`rounded-3xl p-6 shadow-sm relative overflow-hidden transition-all duration-300 backdrop-blur-md ${
                    isEnrolled 
                        ? 'bg-gradient-to-br from-white/95 to-[#ffba15]/10 border-2 border-[#ffba15] shadow-[0_8px_30px_-10px_rgba(255,186,21,0.4)]' 
                        : 'bg-white/60 border border-white/50'
                }`}>
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h3 className="text-xl font-bold mb-1 text-[#2e2f43]">
                            {[course.Disciplina, course.Estilo].filter(Boolean).join(' ')}
                        </h3>
                        <p className="text-sm text-[#2e2f43]/70">
                            {[
                                course.Modalidad,
                                [course.Nivel, course.Subnivel].filter(Boolean).join(' - ')
                            ].filter(Boolean).join(' • ')}
                        </p>
                      </div>
                      <span className={`text-lg font-bold ${isEnrolled ? 'text-[#ffba15] drop-shadow-sm' : 'text-[#2e2f43]'}`}>
                        {course.HoraInicio}
                      </span>
                    </div>

                    <div className="flex items-center justify-end mt-4">
                        {isEnrolled ? (
                            <div className="flex items-center text-[#2e2f43] text-sm font-bold px-4 py-2 bg-[#ffba15] rounded-xl shadow-md">
                                <Check size={16} className="mr-2" />
                                Inscrito
                            </div>
                        ) : isPending ? (
                            <div className="flex items-center text-gray-500 text-sm font-bold px-4 py-2 bg-gray-100 rounded-xl border border-gray-200">
                                <Clock size={16} className="mr-2" />
                                Solicitud Pendiente
                            </div>
                        ) : (
                            <button 
                                onClick={() => openRequestModal(course)}
                                className="flex items-center text-white text-sm font-medium px-4 py-2 bg-[#2e2f43] hover:bg-[#2e2f43]/90 rounded-xl transition-colors shadow-md"
                            >
                                <Plus size={16} className="mr-2" />
                                Solicitar Plaza
                            </button>
                        )}
                    </div>
                </div>
              </div>
            );
          })}
          
          {filteredCourses.length === 0 && (
             <div className="pl-12 py-8 text-[#2e2f43]/50 text-sm">
                No hay cursos disponibles para este día.
             </div>
          )}
        </div>
      </div>

      {/* Confirmation Modal */}
      <AnimatePresence>
        {showConfirmModal && selectedCourse && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={() => setShowConfirmModal(false)}>
                <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    className="bg-white rounded-3xl p-6 shadow-2xl max-w-sm w-full border border-white/50 relative overflow-hidden"
                    onClick={e => e.stopPropagation()}
                >
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="text-xl font-bold text-[#2e2f43]">Confirmar Solicitud</h3>
                        <button onClick={() => setShowConfirmModal(false)} className="p-2 bg-gray-100 rounded-full text-gray-500 hover:bg-gray-200">
                            <X size={18} />
                        </button>
                    </div>

                    <div className="space-y-6">
                        {/* 1. Highlighted New Course Info */}
                        <div className="bg-[#2e2f43] rounded-2xl p-4 text-white shadow-lg relative overflow-hidden">
                            <div className="absolute top-0 right-0 w-16 h-16 bg-[#ffba15] opacity-10 rounded-full -mr-8 -mt-8 blur-xl"></div>
                            <h4 className="text-[10px] font-bold text-white/60 uppercase tracking-wider mb-2">Solicitando Plaza en:</h4>
                            <div className="flex justify-between items-start">
                                <div>
                                    <h3 className="text-lg font-bold">
                                        {[selectedCourse.Disciplina, selectedCourse.Estilo].filter(Boolean).join(' ')}
                                    </h3>
                                    <p className="text-sm text-white/80">
                                        {[
                                            selectedCourse.Modalidad,
                                            [selectedCourse.Nivel, selectedCourse.Subnivel].filter(Boolean).join(' - ')
                                        ].filter(Boolean).join(' • ')}
                                    </p>
                                </div>
                                <div className="text-right">
                                    <span className="text-2xl font-bold text-[#ffba15]">{selectedCourse.HoraInicio}</span>
                                    <p className="text-xs text-white/60 capitalize">{WEEKDAYS.find(w => w.value === selectedCourse.DiaSemana)?.label}</p>
                                </div>
                            </div>
                        </div>

                        {/* 2. Current Courses List */}
                        <div>
                            <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Tus Cursos Actuales</h4>
                            {enrolledCoursesList.length > 0 ? (
                                <div className="space-y-2 max-h-32 overflow-y-auto pr-1 custom-scrollbar">
                                    {enrolledCoursesList.map(c => (
                                        <div key={c.ID_Curso} className="bg-gray-50 border border-gray-100 p-3 rounded-xl flex justify-between items-center">
                                            <div>
                                                <p className="text-xs font-bold text-[#2e2f43]">{[c.Disciplina, c.Estilo].filter(Boolean).join(' ')}</p>
                                                <p className="text-[10px] text-gray-400">{c.Nivel}</p>
                                            </div>
                                            <span className="text-xs font-mono text-gray-500">{WEEKDAYS.find(w => w.value === c.DiaSemana)?.short} {c.HoraInicio}</span>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-sm text-gray-400 italic bg-gray-50 p-3 rounded-xl border border-gray-100">No tienes cursos asignados actualmente.</p>
                            )}
                        </div>

                        {/* 3. Warning */}
                        <div className="bg-yellow-50 border border-yellow-100 rounded-2xl p-3 flex gap-3 items-start">
                            <AlertTriangle className="text-yellow-600 shrink-0 mt-0.5" size={18} />
                            <p className="text-xs text-yellow-800 leading-relaxed">
                                <span className="font-bold block mb-0.5">Advertencia</span>
                                Sujeto a aprobación. Tu cuota se actualizará automáticamente.
                            </p>
                        </div>

                        {/* 4. Visual Fee Summary */}
                        <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100">
                            <div className="flex items-center justify-between text-sm mb-2">
                                <span className="text-gray-500">Cuota Actual</span>
                                <span className="font-medium text-[#2e2f43]">{currentFee.toFixed(2)} €</span>
                            </div>
                            <div className="flex items-center justify-between text-sm mb-2 text-[#ffba15]">
                                <span className="flex items-center"><Plus size={12} className="mr-1"/> Curso Adicional</span>
                                <span className="font-bold">+25.00 €</span>
                            </div>
                            <div className="h-px bg-gray-200 my-2"></div>
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Nueva Cuota Estimada</span>
                                <span className="text-xl font-bold text-[#2e2f43]">{(currentFee + 25).toFixed(2)} €</span>
                            </div>
                        </div>

                        {/* 5. Actions */}
                        <div className="flex gap-3 pt-2">
                            <button 
                                onClick={() => setShowConfirmModal(false)}
                                className="flex-1 py-3 bg-gray-100 text-gray-600 rounded-xl font-bold hover:bg-gray-200 transition-colors"
                            >
                                Cancelar
                            </button>
                            <button 
                                onClick={confirmRequest}
                                disabled={isSubmitting}
                                className="flex-1 py-3 bg-[#2e2f43] text-white rounded-xl font-bold shadow-lg shadow-gray-500/30 hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-2"
                            >
                                {isSubmitting ? (
                                    <>
                                        <Loader2 size={18} className="animate-spin" />
                                        Enviando...
                                    </>
                                ) : (
                                    'Confirmar'
                                )}
                            </button>
                        </div>
                    </div>
                </motion.div>
            </div>
        )}
      </AnimatePresence>
    </div>
  );
}
