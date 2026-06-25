import { useState } from 'react';
import { GlassCard } from '@/components/GlassCard';
import { useAuth } from '@/context/AuthContext';
import { useAttendance } from '@/hooks/useAttendance';
import { Calendar, Clock, MapPin, CheckCircle, X, ChevronRight, ChevronLeft, AlertCircle, PartyPopper, QrCode, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format, differenceInHours } from 'date-fns';
import { es } from 'date-fns/locale';
import { BattlepassWidget } from '@/components/BattlepassWidget';
import { addDoc, collection, Timestamp, doc, updateDoc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Header } from '@/components/Header';
import { Scanner } from '@yudiel/react-qr-scanner';

export default function Dashboard() {
  const { user } = useAuth();
  const { stats, upcomingClasses, events, loading } = useAttendance();
  const [markingAttendance, setMarkingAttendance] = useState(false);
  const [attendanceSuccess, setAttendanceSuccess] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [scanResult, setScanResult] = useState<{
    status: 'success' | 'error' | 'processing';
    message: string;
    courseName?: string;
  } | null>(null);

  const handleScanRecovery = async (result: any) => {
    if (!result || !result.length) return;
    const rawValue = result[0].rawValue;
    
    let classId = rawValue;
    try {
        const parsed = JSON.parse(rawValue);
        if (parsed.classId) classId = parsed.classId;
    } catch(e) {}
    
    if (!classId) {
        setScanResult({
            status: 'error',
            message: 'Código QR no válido o vacío.'
        });
        setShowScanner(false);
        return;
    }

    setShowScanner(false);
    setScanResult({
        status: 'processing',
        message: 'Verificando tus tickets de recuperación de forma segura...'
    });
    
    try {
        if (!user) {
            throw new Error("No hay un usuario autenticado.");
        }

        // --- RECO DOC ---
        const classRef = doc(db, 'Clases', classId);
        const classSnap = await getDoc(classRef);
        if (!classSnap.exists()) {
            throw new Error("La clase no existe en el sistema.");
        }
        const classData = classSnap.data();

        // --- COURSE DOC ---
        if (!classData.ID_Curso) {
            throw new Error("La clase no tiene un curso asociado.");
        }
        const courseRef = doc(db, 'Cursos', classData.ID_Curso);
        const courseSnap = await getDoc(courseRef);
        if (!courseSnap.exists()) {
            throw new Error("El curso asociado a esta clase no existe.");
        }
        const courseData = courseSnap.data();
        const courseName = courseData.NombreCurso || `${courseData.Disciplina || ''} ${courseData.Estilo || ''}`.trim() || "Clase sin nombre";

        // --- RULE 1: Bolsa check ---
        const tickets = user.bolsaRecuperaciones || [];
        const unusedTickets = tickets.filter((t: any) => t.usado === false);
        if (unusedTickets.length === 0) {
            throw new Error("No tienes ningún ticket de recuperación disponible en tu bolsa (usado = false).");
        }

        // --- RULE 2: Match Disciplina, Estilo, Modalidad, Nivel ---
        const matchField = (val1: any, val2: any) => {
            const s1 = val1 ? String(val1).trim().toLowerCase() : "";
            const s2 = val2 ? String(val2).trim().toLowerCase() : "";
            return s1 === s2;
        };

        const matchingTicket = unusedTickets.find((t: any) => {
            const dMatch = matchField(t.disciplina || t.Disciplina, courseData.Disciplina);
            const eMatch = matchField(t.estilo || t.Estilo, courseData.Estilo);
            const mMatch = matchField(t.modalidad || t.Modalidad, courseData.Modalidad);
            const nMatch = matchField(t.nivel || t.Nivel, courseData.Nivel);
            return dMatch && eMatch && mMatch && nMatch;
        });

        if (!matchingTicket) {
            throw new Error(
                `No tienes ningún ticket compatible en tu bolsa. Esta clase requiere:\n` +
                `• Disciplina: ${courseData.Disciplina || 'Cualquiera'}\n` +
                `• Estilo: ${courseData.Estilo || 'Ninguno'}\n` +
                `• Modalidad: ${courseData.Modalidad || 'Cualquiera'}\n` +
                `• Nivel: ${courseData.Nivel || 'Cualquiera'}`
            );
        }

        // --- RULE 3: Not already enrolled in coursesInscritos ---
        const getCursosInscritosArray = (cursosInscritos: any): any[] => {
            if (!cursosInscritos) return [];
            if (Array.isArray(cursosInscritos)) return cursosInscritos;
            if (typeof cursosInscritos === 'object') {
                const keys = Object.keys(cursosInscritos).sort((a, b) => {
                    const numA = Number(a);
                    const numB = Number(b);
                    if (isNaN(numA) || isNaN(numB)) {
                        return a.localeCompare(b);
                    }
                    return numA - numB;
                });
                return keys.map(k => cursosInscritos[k]).filter(item => item && typeof item === 'object');
            }
            return [];
        };

        const enrolledCursos = getCursosInscritosArray(user.cursosInscritos);
        const enrolledIds = enrolledCursos.map((c: any) => c.id || c.ID_Curso).filter(Boolean);
        if (enrolledIds.includes(classData.ID_Curso)) {
            throw new Error("No puedes recuperar una clase de un curso en el que ya estás inscrito.");
        }

        // --- PROCESS RECOVERY ---
        let recos = classData.registro_recuperaciones_en_vivo || [];
        if (!Array.isArray(recos)) {
            recos = Object.entries(recos).map(([id, val]) => ({
                idAlumno: id,
                Asistencia: val,
                AppMarcacion: "Migrated"
            }));
        }
        
        recos = recos.filter((r: any) => r.idAlumno !== user.ID_Alumno);
        recos.push({
            idAlumno: user.ID_Alumno,
            Asistencia: true,
            AppMarcacion: "Mi Mambo"
        });

        // 1. Update Class document
        await updateDoc(classRef, {
            registro_recuperaciones_en_vivo: recos
        });

        // 2. Consume/Mark ticket as used in Alumno document
        const alumnoRef = doc(db, 'Alumnos', user.ID_Alumno);
        const updatedBolsa = tickets.map((t: any) => {
            if (t.idAsistencia === matchingTicket.idAsistencia) {
                return { ...t, usado: true };
            }
            return t;
        });
        await updateDoc(alumnoRef, {
            bolsaRecuperaciones: updatedBolsa
        });

        // Success!
        setScanResult({
            status: 'success',
            message: 'Tu asistencia por recuperación ha sido registrada de forma segura.',
            courseName: courseName
        });

    } catch (err: any) {
        console.error("Error recovering class:", err);
        setScanResult({
            status: 'error',
            message: err.message || "Ha ocurrido un error inesperado al procesar la recuperación."
        });
    }
  };

  const handleMarkAttendanceLive = async (classId: string, status: boolean) => {
    if (!user) return;
    setMarkingAttendance(true);
    try {
      // Update Class document with in-vivo attendance
      const classRef = doc(db, 'Clases', classId);
      const classSnap = await getDoc(classRef);
      
      if (classSnap.exists()) {
          const classData = classSnap.data();
          let currentRegistro = classData.registro_en_vivo || [];
          if (!Array.isArray(currentRegistro)) {
              currentRegistro = Object.entries(currentRegistro).map(([id, val]) => ({ 
                  idAlumno: id, 
                  Asistencia: val, 
                  AppMarcacion: "Migrated",
                  observacion_app: "Migrated legacy object"
              }));
          }

          // Remove old entry for this student if it exists
          currentRegistro = currentRegistro.filter((r: any) => r.idAlumno !== user.ID_Alumno);
          
          // Add new entry
          currentRegistro.push({
              idAlumno: user.ID_Alumno,
              Asistencia: status,
              AppMarcacion: "Mi Mambo",
              observacion_app: "Marcada desde Mi Mambo = true"
          });

          await updateDoc(classRef, {
            registro_en_vivo: currentRegistro
          });
      }

      setAttendanceSuccess(true);
      setTimeout(() => {
        setAttendanceSuccess(false);
        // Ideally trigger a refresh of useAttendance here
        window.location.reload(); 
      }, 1500);
    } catch (error) {
      console.error("Error marking attendance:", error);
    } finally {
      setMarkingAttendance(false);
    }
  };

  return (
    <div className="space-y-6 pt-0 pb-24" style={{ paddingTop: '0px' }}>
      <Header 
        showGreeting={true} 
        rightElement={
            <button 
                onClick={() => setShowScanner(true)}
                className="text-gray-600 hover:text-[#2e2f43] transition-all p-1"
                title="Escanear QR para recuperar clase"
            >
                <QrCode size={24} />
            </button>
        }
      />

      {/* Battlepass Widget */}
      <BattlepassWidget />

      {/* Upcoming Classes Slider */}
      <div className="space-y-3">
        <h3 className="text-xs font-bold px-2 text-[#2e2f43]/60 uppercase tracking-wider">Próximas Clases</h3>
        
        {loading ? (
            <div className="px-4"><div className="h-48 w-full bg-[#2e2f43]/5 rounded-[2.5rem] animate-pulse"></div></div>
        ) : upcomingClasses && upcomingClasses.length > 0 ? (
            <div className="flex overflow-x-auto snap-x snap-mandatory hide-scrollbar gap-4 px-4 pb-4 -mx-4" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                {upcomingClasses.map((cls) => {
                    const hoursUntilClass = differenceInHours(cls.startTime, new Date());
                    const canMarkAttendance = true; // Permitting always if not closed: cls.asistenciaCerrada === false
                    const isClosed = cls.asistenciaCerrada;
                    
                    return (
                        <div key={cls.id} className="min-w-[90%] snap-center shrink-0 relative group">
                            <div className="absolute inset-0 bg-[#2e2f43] rounded-[2.5rem] blur-2xl opacity-5 transition-opacity" />
                            <GlassCard className="relative overflow-hidden border-white/40 bg-white/40 backdrop-blur-2xl rounded-[2.5rem] p-6 shadow-xl h-full flex flex-col justify-between">
                                <div className="absolute top-0 right-0 -mt-8 -mr-8 w-32 h-32 bg-[#2e2f43]/5 rounded-full blur-3xl" />
                                
                                <div>
                                    <div className="flex justify-between items-start mb-4">
                                        <div className="space-y-1">
                                            <span className="px-3 py-1 bg-[#2e2f43]/5 text-[#2e2f43] text-[10px] font-black rounded-full uppercase tracking-[0.2em]">
                                                {format(cls.startTime, 'EEEE', { locale: es })}
                                            </span>
                                            <div className="pt-2">
                                                <h2 className="text-2xl font-black text-[#2e2f43] tracking-tighter leading-none line-clamp-2">
                                                    {cls.courseName}
                                                </h2>
                                                <div className="flex items-center gap-2 mt-2 flex-wrap">
                                                    <p className="text-[#2e2f43]/60 font-bold text-[10px] uppercase tracking-wider">
                                                        {cls.level}
                                                    </p>
                                                    {cls.rol && (
                                                        <span className={`text-[9px] font-extrabold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                                                            cls.rol.toLowerCase() === 'leader' 
                                                            ? 'bg-blue-50 text-blue-600 border border-blue-100/30' 
                                                            : 'bg-pink-50 text-pink-600 border border-pink-100/30'
                                                        }`}>
                                                            {cls.rol === 'leader' ? 'Leader' : 'Follower'}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="bg-[#2e2f43] p-3 rounded-2xl shadow-lg shadow-[#2e2f43]/20 shrink-0">
                                            <Calendar className="text-white" size={20} />
                                        </div>
                                    </div>
                                    
                                    <div className="grid grid-cols-2 gap-3 mt-4 mb-4">
                                        <div className="bg-white/50 p-3 rounded-xl border border-white/60 shadow-sm">
                                            <div className="flex items-center gap-1.5 mb-1">
                                                <Clock size={12} className="text-[#2e2f43]/40" />
                                                <span className="text-[9px] font-black text-[#2e2f43]/40 uppercase tracking-widest">Horario</span>
                                            </div>
                                            <p className="font-black text-[#2e2f43] capitalize text-xs">
                                                {format(cls.startTime, "HH:mm", { locale: es })}
                                            </p>
                                        </div>
                                        <div className="bg-white/50 p-3 rounded-xl border border-white/60 shadow-sm">
                                            <div className="flex items-center gap-1.5 mb-1">
                                                <MapPin size={12} className="text-[#2e2f43]/40" />
                                                <span className="text-[9px] font-black text-[#2e2f43]/40 uppercase tracking-widest">Ubicación</span>
                                            </div>
                                            <p className="font-black text-[#2e2f43] text-xs truncate">{cls.location}</p>
                                        </div>
                                    </div>
                                </div>

                                <div>
                                    {isClosed ? (
                                        <div className="w-full py-3 rounded-xl font-bold text-[10px] uppercase tracking-[0.2em] bg-gray-100 text-gray-400 text-center border border-gray-200">
                                            Asistencia Cerrada
                                        </div>
                                    ) : cls.attendanceMarked ? (
                                        <div className="w-full py-3 rounded-xl font-bold text-[10px] uppercase tracking-[0.2em] bg-green-50 text-green-600 text-center border border-green-100 flex items-center justify-center gap-2">
                                            <CheckCircle size={14} /> Marcada
                                        </div>
                                    ) : (
                                        <div className="grid grid-cols-2 gap-2 mt-auto">
                                            <button
                                                onClick={() => handleMarkAttendanceLive(cls.id, false)}
                                                disabled={markingAttendance}
                                                className="w-full py-3 rounded-xl font-black text-[10px] uppercase tracking-[0.2em] transition-all bg-red-50 text-red-600 hover:bg-red-100 active:scale-95 border border-red-100 flex items-center justify-center gap-1.5 disabled:opacity-50"
                                            >
                                                <X size={14} /> Faltaré
                                            </button>
                                            <button
                                                onClick={() => handleMarkAttendanceLive(cls.id, true)}
                                                disabled={markingAttendance}
                                                className="w-full py-3 rounded-xl font-black text-[10px] uppercase tracking-[0.2em] transition-all bg-[#2e2f43] text-white shadow-lg shadow-[#2e2f43]/20 hover:shadow-[#2e2f43]/30 active:scale-95 flex items-center justify-center gap-1.5 disabled:opacity-50"
                                            >
                                                <CheckCircle size={14} /> Asistiré
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </GlassCard>
                        </div>
                    );
                })}
            </div>
        ) : (
            <div className="px-4">
                <GlassCard className="p-8 text-center bg-white/40 border-white/40">
                    <p className="text-sm text-[#2e2f43]/40 font-bold">
                        No tienes clases programadas esta semana.
                    </p>
                </GlassCard>
            </div>
        )}
      </div>

      {/* Next Event Banner */}
      {events.length > 0 && (
        <div className="px-2">
          <div className="relative w-full h-40 rounded-2xl overflow-hidden shadow-lg">
            <img 
              src={events[0].image || "https://images.unsplash.com/photo-1545128485-c400e7702796?w=800&q=80"} 
              alt={events[0].title}
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent flex flex-col justify-end p-4">
              <span className="text-xs font-bold text-yellow-400 uppercase tracking-wider mb-1">
                Próximo Evento
              </span>
              <h3 className="text-xl font-bold text-white leading-tight">{events[0].title}</h3>
              <div className="flex items-center text-gray-200 text-xs mt-2">
                <Calendar size={14} className="mr-1.5" />
                <span className="capitalize">
                  {format(events[0].date, "EEEE d 'de' MMMM", { locale: es })}
                </span>
                <span className="mx-2">•</span>
                <Clock size={14} className="mr-1.5" />
                <span>{format(events[0].date, "HH:mm")}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Recent Activity or News */}
      <h3 className="text-lg font-semibold px-2 mt-8">Novedades</h3>
      <div className="space-y-4">
        {loading ? (
          <div className="p-4 text-center text-gray-400">Cargando novedades...</div>
        ) : events.length > 0 ? (
          events.map((event, i) => (
            <motion.div
              key={event.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.1 }}
              className="flex items-center p-4 bg-white/40 backdrop-blur-md rounded-2xl border border-white/50 shadow-sm"
            >
              <div className="w-12 h-12 rounded-xl bg-purple-100 flex items-center justify-center text-purple-600 mr-4 shrink-0">
                <PartyPopper size={20} />
              </div>
              <div>
                <h4 className="font-semibold text-gray-800">{event.title}</h4>
                <p className="text-xs text-gray-500 capitalize">
                  {format(event.date, "EEEE d 'de' MMMM • HH:mm", { locale: es })}
                </p>
              </div>
            </motion.div>
          ))
        ) : (
          <div className="flex flex-col items-center justify-center p-6 bg-white/40 rounded-2xl border border-white/50 text-gray-500">
            <AlertCircle size={24} className="mb-2 opacity-50" />
            <p className="text-sm">No hay novedades recientes</p>
          </div>
        )}
      </div>

      <AnimatePresence>
        {showScanner && (
          <motion.div 
            key="scanner-modal"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-white rounded-3xl p-6 shadow-2xl max-w-sm w-full border border-white/50 relative overflow-hidden flex flex-col items-center"
            >
              <button 
                onClick={() => setShowScanner(false)}
                className="absolute top-4 right-4 p-2 bg-gray-100 rounded-full text-gray-500 hover:bg-gray-200 transition-colors z-10"
              >
                <X size={20} />
              </button>
              
              <div className="text-center mb-6 mt-4">
                <div className="w-12 h-12 bg-purple-100 text-purple-600 rounded-full flex items-center justify-center mx-auto mb-3">
                  <QrCode size={24} />
                </div>
                <h3 className="text-xl font-bold text-gray-800">Escanear QR</h3>
                <p className="text-sm text-gray-500 mt-1">
                  Escanea el código QR de la clase para marcar tu recuperación.
                </p>
              </div>

              <div className="w-full aspect-square bg-black rounded-2xl overflow-hidden shadow-inner relative">
                 <Scanner 
                    onScan={handleScanRecovery} 
                    formats={['qr_code']}
                    components={{
                        audio: false,
                        zoom: false
                    }}
                    styles={{
                        container: { width: '100%', height: '100%' }
                    }}
                 />
              </div>
            </motion.div>
          </motion.div>
        )}

        {scanResult && (
          <motion.div
            key="scan-result-modal"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className={`fixed inset-0 z-[200] flex flex-col items-center justify-between p-6 text-white text-center ${
              scanResult.status === 'success' 
                ? 'bg-gradient-to-br from-emerald-500 via-green-600 to-teal-800' 
                : scanResult.status === 'processing'
                ? 'bg-gradient-to-br from-[#1e1f2f] via-[#2e2f43] to-[#40415d]'
                : 'bg-gradient-to-br from-rose-500 via-red-600 to-red-800'
            }`}
          >
            {/* Top spacing */}
            <div className="h-12" />

            {/* Central Content */}
            <div className="max-w-md w-full px-4 flex flex-col items-center">
              <motion.div
                initial={{ scale: 0.5, rotate: -10 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: "spring", damping: 15 }}
                className="w-24 h-24 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center mb-8 border border-white/30 shadow-lg"
              >
                {scanResult.status === 'success' ? (
                  <CheckCircle size={48} className="text-white animate-pulse" />
                ) : scanResult.status === 'processing' ? (
                  <Loader2 size={48} className="text-white animate-spin" />
                ) : (
                  <AlertCircle size={48} className="text-white" />
                )}
              </motion.div>

              <motion.h2 
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.1 }}
                className="text-3xl font-black tracking-tight mb-4"
              >
                {scanResult.status === 'success' 
                  ? '¡Recuperación Exitosa!' 
                  : scanResult.status === 'processing'
                  ? 'Procesando...'
                  : 'Error de Recuperación'}
              </motion.h2>

              {scanResult.courseName && (
                <motion.div 
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.15 }}
                  className="bg-white/10 backdrop-blur-sm rounded-2xl py-3 px-6 mb-6 border border-white/15"
                >
                  <p className="text-xs uppercase tracking-wider text-white/70 font-semibold mb-1">Clase Recuperada</p>
                  <p className="text-lg font-bold">{scanResult.courseName}</p>
                </motion.div>
              )}

              <motion.p 
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.2 }}
                className="text-base text-white/90 font-medium leading-relaxed max-w-sm whitespace-pre-line"
              >
                {scanResult.message}
              </motion.p>
            </div>

            {/* Action Button at bottom */}
            <motion.div 
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="w-full max-w-xs mb-12"
            >
              {scanResult.status !== 'processing' ? (
                <button
                  onClick={() => {
                    const isSuccess = scanResult.status === 'success';
                    setScanResult(null);
                    if (isSuccess) {
                      window.location.reload();
                    }
                  }}
                  className={`w-full py-4 px-6 rounded-2xl font-bold text-lg shadow-xl hover:scale-105 active:scale-95 transition-all ${
                    scanResult.status === 'success'
                      ? 'bg-white text-emerald-700 hover:bg-emerald-50'
                      : 'bg-white text-rose-700 hover:bg-rose-50'
                  }`}
                >
                  {scanResult.status === 'success' ? 'Entendido' : 'Cerrar'}
                </button>
              ) : (
                <div className="h-[60px] flex flex-col items-center justify-center gap-2">
                  <span className="text-sm text-white/60 font-semibold animate-pulse">Por favor, espera un momento...</span>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
