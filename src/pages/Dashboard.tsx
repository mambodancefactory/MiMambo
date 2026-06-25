import { useState } from 'react';
import { GlassCard } from '@/components/GlassCard';
import { useAuth } from '@/context/AuthContext';
import { useAttendance } from '@/hooks/useAttendance';
import { Calendar, Clock, MapPin, CheckCircle, X, ChevronRight, ChevronLeft, AlertCircle, PartyPopper, QrCode, Loader2, Camera, Info } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format, differenceInHours } from 'date-fns';
import { es } from 'date-fns/locale';
import { BattlepassWidget } from '@/components/BattlepassWidget';
import { addDoc, collection, Timestamp, doc, updateDoc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Header } from '@/components/Header';
import { Scanner } from '@yudiel/react-qr-scanner';
import { useCalculoAsistenciaEnVivo } from '@/hooks/useCalculoAsistenciaEnVivo';
import { cn } from '@/lib/utils';
import { safeToDate } from '@/hooks/useRecovery';

export default function Dashboard() {
  const { user } = useAuth();
  const { stats, upcomingClasses, events, loading } = useAttendance();
  const { saldoActual } = useCalculoAsistenciaEnVivo(user?.ID_Alumno);
  const activeTickets = (user?.bolsaRecuperaciones || []).filter((t: any) => 
    t.usado === false && safeToDate(t.caducidad) >= new Date()
  );
  const [markingAttendance, setMarkingAttendance] = useState(false);
  const [attendanceSuccess, setAttendanceSuccess] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [scanResult, setScanResult] = useState<{
    status: 'success' | 'error' | 'processing';
    message: string;
    courseName?: string;
  } | null>(null);
  const [selectedTicket, setSelectedTicket] = useState<any | null>(null);
  const [showEmptySlotInfo, setShowEmptySlotInfo] = useState<boolean>(false);
  const [showRequirements, setShowRequirements] = useState<boolean>(false);

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
      />

      {/* 1 - Upcoming Classes Slider */}
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

      {/* 2 - Recuperaciones Acumuladas */}
      <div className="w-full">
        <GlassCard className="p-5 bg-white/40 border-white/40 rounded-[2.5rem] shadow-xl relative overflow-hidden">
          <div className="flex justify-between items-center mb-3">
              <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-[#ffba15]" />
                  <h3 className="text-xs font-black text-[#2e2f43] uppercase tracking-widest">Recuperaciones Acumuladas</h3>
              </div>
              <button 
                onClick={() => setShowScanner(true)}
                className="p-3 bg-[#2e2f43] hover:bg-[#2e2f43]/90 text-[#ffba15] rounded-full shadow-lg hover:scale-105 active:scale-95 transition-all flex items-center justify-center shrink-0"
                title="Escanear QR para recuperar"
              >
                <Camera size={18} />
              </button>
          </div>
          <div className="flex gap-1.5 my-4">
              {Array.from({ length: 8 }).map((_, i) => {
                  const ticket = activeTickets[i];
                  const isFilled = !!ticket;
                  return (
                      <button 
                          key={i} 
                          onClick={() => {
                              if (isFilled) {
                                  setSelectedTicket(ticket);
                              } else {
                                  setShowEmptySlotInfo(true);
                              }
                          }}
                          className={cn(
                              "h-3 flex-1 rounded-full transition-all duration-300 outline-none",
                              isFilled 
                                  ? "bg-[#ffba15] shadow-[0_0_10px_rgba(255,186,21,0.3)] hover:scale-110" 
                                  : "bg-[#2e2f43]/5 hover:bg-[#2e2f43]/10"
                          )}
                          title={isFilled ? `Ver ticket de ${ticket.disciplina || ticket.Disciplina}` : "Ranura vacía"}
                      />
                  );
              })}
          </div>
          <div className="flex items-center justify-between mt-4 pt-4 border-t border-[#2e2f43]/5">
            <span className="text-[10px] text-[#2e2f43]/60 font-extrabold uppercase tracking-widest">
              {activeTickets.length} de 8 slots ocupados
            </span>
            <button
              onClick={() => setShowRequirements(true)}
              className="flex items-center gap-1.5 py-1.5 px-3 bg-[#2e2f43]/5 hover:bg-[#2e2f43]/10 text-[#2e2f43] rounded-full text-[10px] font-black uppercase tracking-wider transition-all"
            >
              <Info size={12} />
              Requisitos
            </button>
          </div>
        </GlassCard>
      </div>

      {/* 3 - Battlepass Rank Card */}
      <BattlepassWidget />

      {/* 4 - Apartado Novedades */}

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

        {/* Selected Ticket Info Modal */}
        {selectedTicket && (
          <motion.div
            key="ticket-details-modal"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[160] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-[2.5rem] p-6 max-w-sm w-full shadow-2xl border border-gray-100 flex flex-col relative overflow-hidden"
            >
              {/* Decorative top strip */}
              <div className="absolute top-0 inset-x-0 h-3 bg-[#ffba15]" />
              
              <button 
                onClick={() => setSelectedTicket(null)}
                className="absolute top-4 right-4 p-1.5 bg-gray-50 hover:bg-gray-100 rounded-full text-[#2e2f43]/40 hover:text-[#2e2f43] transition-colors"
              >
                <X size={18} />
              </button>

              <div className="flex items-center gap-3 mt-2 mb-4">
                <div className="w-10 h-10 rounded-2xl bg-amber-50 flex items-center justify-center text-[#ffba15]">
                  <CheckCircle size={22} />
                </div>
                <div>
                  <span className="text-[10px] font-black uppercase text-amber-500 tracking-widest">Bolsa de Recuperaciones</span>
                  <h4 className="text-lg font-black text-[#2e2f43] leading-none">Ticket de Recuperación</h4>
                </div>
              </div>

              <div className="space-y-3 my-2">
                <div className="flex justify-between items-center py-2 border-b border-gray-50">
                  <span className="text-xs text-gray-400 font-bold uppercase tracking-wider">Disciplina</span>
                  <span className="text-xs font-black text-[#2e2f43]">{selectedTicket.disciplina || selectedTicket.Disciplina || 'Cualquiera'}</span>
                </div>
                {(selectedTicket.estilo || selectedTicket.Estilo) && (
                  <div className="flex justify-between items-center py-2 border-b border-gray-50">
                    <span className="text-xs text-gray-400 font-bold uppercase tracking-wider">Estilo</span>
                    <span className="text-xs font-black text-[#2e2f43]">{selectedTicket.estilo || selectedTicket.Estilo}</span>
                  </div>
                )}
                <div className="flex justify-between items-center py-2 border-b border-gray-50">
                  <span className="text-xs text-gray-400 font-bold uppercase tracking-wider">Modalidad</span>
                  <span className="text-xs font-black text-[#2e2f43]">{selectedTicket.modalidad || selectedTicket.Modalidad || 'Cualquiera'}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-gray-50">
                  <span className="text-xs text-gray-400 font-bold uppercase tracking-wider">Nivel</span>
                  <span className="text-xs font-black text-[#2e2f43]">{selectedTicket.nivel || selectedTicket.Nivel || 'Cualquiera'}</span>
                </div>
                {selectedTicket.fechaFalta && (
                  <div className="flex justify-between items-center py-2 border-b border-gray-50">
                    <span className="text-xs text-gray-400 font-bold uppercase tracking-wider">Fecha de Falta</span>
                    <span className="text-xs font-black text-[#2e2f43] capitalize">
                      {format(safeToDate(selectedTicket.fechaFalta), "d 'de' MMMM, yyyy", { locale: es })}
                    </span>
                  </div>
                )}
                {selectedTicket.caducidad && (
                  <div className="flex justify-between items-center py-2 border-b border-gray-50">
                    <span className="text-xs text-gray-400 font-bold uppercase tracking-wider">Caducidad</span>
                    <span className="text-xs font-black text-rose-500 capitalize">
                      {format(safeToDate(selectedTicket.caducidad), "d 'de' MMMM, yyyy", { locale: es })}
                    </span>
                  </div>
                )}
              </div>

              <button
                onClick={() => setSelectedTicket(null)}
                className="w-full mt-4 py-3 bg-[#2e2f43] hover:bg-[#2e2f43]/90 text-white rounded-2xl font-bold text-sm tracking-wide transition-colors shadow-lg"
              >
                Cerrar
              </button>
            </motion.div>
          </motion.div>
        )}

        {/* Empty Slot Info Modal */}
        {showEmptySlotInfo && (
          <motion.div
            key="empty-slot-modal"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[160] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-[2.5rem] p-6 max-w-sm w-full shadow-2xl border border-gray-100 flex flex-col relative overflow-hidden"
            >
              <button 
                onClick={() => setShowEmptySlotInfo(false)}
                className="absolute top-4 right-4 p-1.5 bg-gray-50 hover:bg-gray-100 rounded-full text-[#2e2f43]/40 hover:text-[#2e2f43] transition-colors"
              >
                <X size={18} />
              </button>

              <div className="flex flex-col items-center text-center mt-4 mb-4">
                <div className="w-16 h-16 rounded-full bg-gray-50 border border-dashed border-gray-200 flex items-center justify-center text-gray-400 mb-4">
                  <div className="w-8 h-3 rounded-full bg-gray-200" />
                </div>
                <h4 className="text-xl font-black text-[#2e2f43] leading-none mb-2">Ranura de Bolsa Vacía</h4>
                <p className="text-sm text-gray-500 leading-relaxed font-medium">
                  Esta ranura está lista para almacenar una recuperación acumulada.
                </p>
              </div>

              <div className="bg-gray-50 rounded-2xl p-4 text-xs text-gray-500 leading-relaxed font-bold border border-gray-100 mb-4 text-center">
                Se completará automáticamente si faltas a una clase oficial y notificas tu ausencia con antelación (mínimo 12 horas antes).
              </div>

              <button
                onClick={() => setShowEmptySlotInfo(false)}
                className="w-full py-3 bg-[#2e2f43] hover:bg-[#2e2f43]/90 text-white rounded-2xl font-bold text-sm tracking-wide transition-colors"
              >
                Entendido
              </button>
            </motion.div>
          </motion.div>
        )}

        {/* Requirements Sheet */}
        {showRequirements && (
          <div className="fixed inset-0 z-[150] flex flex-col">
            {/* Backdrop */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowRequirements(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-md"
            />
            {/* Sheet */}
            <motion.div 
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: "spring", damping: 25, stiffness: 220 }}
              className="absolute inset-x-0 bottom-0 top-16 bg-white rounded-t-[3rem] shadow-2xl flex flex-col overflow-hidden"
            >
              {/* Header */}
              <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50 sticky top-0 z-10">
                <div>
                  <span className="text-xs font-black text-amber-500 uppercase tracking-widest">Normas del Centro</span>
                  <h3 className="text-2xl font-black text-[#2e2f43] tracking-tight">Normativa de Recuperación</h3>
                </div>
                <button 
                  onClick={() => setShowRequirements(false)}
                  className="p-2.5 bg-[#2e2f43]/5 text-[#2e2f43] hover:bg-[#2e2f43]/10 rounded-full transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Content Scroll */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                <p className="text-sm text-gray-500 font-medium leading-relaxed">
                  Para garantizar la calidad de las clases de baile y el control de aforo, las recuperaciones de asistencia se rigen por los siguientes requisitos estrictos:
                </p>

                <div className="space-y-4">
                  {/* Rule 1 */}
                  <div className="flex gap-4 items-start p-4 bg-gray-50 rounded-2xl border border-gray-100">
                    <div className="w-8 h-8 rounded-xl bg-amber-500 flex items-center justify-center text-white font-bold text-sm shrink-0">
                      1
                    </div>
                    <div className="space-y-1">
                      <h4 className="text-sm font-black text-[#2e2f43]">Tickets Disponibles en Bolsa</h4>
                      <p className="text-xs text-gray-500 leading-relaxed font-medium">
                        Debes disponer de un ticket de recuperación válido y no consumido en tu bolsa (las ranuras amarillas de tu dashboard). Los tickets se generan al faltar de forma justificada a tu clase oficial.
                      </p>
                    </div>
                  </div>

                  {/* Rule 2 */}
                  <div className="flex gap-4 items-start p-4 bg-gray-50 rounded-2xl border border-gray-100">
                    <div className="w-8 h-8 rounded-xl bg-amber-500 flex items-center justify-center text-white font-bold text-sm shrink-0">
                      2
                    </div>
                    <div className="space-y-1">
                      <h4 className="text-sm font-black text-[#2e2f43]">Compatibilidad Estricta de Nivel y Estilo</h4>
                      <p className="text-xs text-gray-500 leading-relaxed font-medium">
                        La clase de destino a la que deseas asistir para recuperar debe coincidir exactamente en **Disciplina, Estilo, y Modalidad**. El nivel de la clase debe ser **igual o inferior** al nivel que tienes asignado en tu ticket original.
                      </p>
                    </div>
                  </div>

                  {/* Rule 3 */}
                  <div className="flex gap-4 items-start p-4 bg-gray-50 rounded-2xl border border-gray-100">
                    <div className="w-8 h-8 rounded-xl bg-amber-500 flex items-center justify-center text-white font-bold text-sm shrink-0">
                      3
                    </div>
                    <div className="space-y-1">
                      <h4 className="text-sm font-black text-[#2e2f43]">No Estar Inscrito en el Curso Destino</h4>
                      <p className="text-xs text-gray-500 leading-relaxed font-medium">
                        Por motivos de control, no puedes utilizar un ticket de recuperación para asistir a una clase de un curso al que ya estás inscrito de forma oficial.
                      </p>
                    </div>
                  </div>

                  {/* Rule 4 */}
                  <div className="flex gap-4 items-start p-4 bg-gray-50 rounded-2xl border border-gray-100">
                    <div className="w-8 h-8 rounded-xl bg-amber-500 flex items-center justify-center text-white font-bold text-sm shrink-0">
                      4
                    </div>
                    <div className="space-y-1">
                      <h4 className="text-sm font-black text-[#2e2f43]">Fecha de Caducidad y Plazos</h4>
                      <p className="text-xs text-gray-500 leading-relaxed font-medium">
                        Todos los tickets de recuperación tienen una fecha de caducidad. Por norma general del centro, deben consumirse antes de que finalice el trimestre escolar actual. ¡Consúmelos pronto!
                      </p>
                    </div>
                  </div>

                  {/* Rule 5 */}
                  <div className="flex gap-4 items-start p-4 bg-gray-50 rounded-2xl border border-gray-100">
                    <div className="w-8 h-8 rounded-xl bg-amber-500 flex items-center justify-center text-white font-bold text-sm shrink-0">
                      5
                    </div>
                    <div className="space-y-1">
                      <h4 className="text-sm font-black text-[#2e2f43]">Registro por QR en Recepción</h4>
                      <p className="text-xs text-gray-500 leading-relaxed font-medium">
                        Para canjear tu ticket y entrar a la clase, pulsa el botón de la cámara, enciende la cámara de tu móvil y escanea el código QR que se muestra en la pantalla de la app Kiosk de Recepción al entrar.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="pt-4 pb-8">
                  <button
                    onClick={() => setShowRequirements(false)}
                    className="w-full py-4 bg-[#2e2f43] hover:bg-[#2e2f43]/90 text-white rounded-2xl font-bold text-base transition-colors shadow-lg"
                  >
                    Entendido, cerrar normativa
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
