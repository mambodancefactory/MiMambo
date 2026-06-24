import { useState } from 'react';
import { GlassCard } from '@/components/GlassCard';
import { useAuth } from '@/context/AuthContext';
import { useAttendance } from '@/hooks/useAttendance';
import { Calendar, Clock, MapPin, PartyPopper, AlertCircle, CheckCircle, X, Bell } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format, differenceInHours } from 'date-fns';
import { es } from 'date-fns/locale';
import { BattlepassWidget } from '@/components/BattlepassWidget';
import { addDoc, collection, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Header } from '@/components/Header';

export default function Dashboard() {
  const { user } = useAuth();
  const { stats, nextClass, events, loading } = useAttendance();
  const [showAttendanceModal, setShowAttendanceModal] = useState(false);
  const [markingAttendance, setMarkingAttendance] = useState(false);
  const [attendanceSuccess, setAttendanceSuccess] = useState(false);

  const hoursUntilClass = nextClass ? differenceInHours(nextClass.startTime, new Date()) : 999;
  const canMarkAttendance = hoursUntilClass <= 3;

  const handleMarkAttendance = async () => {
    if (!user || !nextClass) return;

    setMarkingAttendance(true);
    try {
      await addDoc(collection(db, 'Asistencia_Clases_Regulares'), {
        ID_Alumno: user.ID_Alumno,
        ID_Clase: nextClass.id,
        Timestamp_Entrada: Timestamp.now(),
        Metodo_Entrada: 'App',
        Estado: 'Presente'
      });
      setAttendanceSuccess(true);
      setTimeout(() => {
        setShowAttendanceModal(false);
        setAttendanceSuccess(false);
        // Ideally trigger a refresh of useAttendance here
        window.location.reload(); // Simple refresh for now
      }, 2000);
    } catch (error) {
      console.error("Error marking attendance:", error);
    } finally {
      setMarkingAttendance(false);
    }
  };

  return (
    <div className="space-y-6 pt-8 pb-24">
      <Header showGreeting={true} />

      {/* Battlepass Widget */}
      <BattlepassWidget />

      {/* Next Class Card */}
      <div className="relative group">
        <div className="absolute inset-0 bg-[#2e2f43] rounded-[2.5rem] blur-2xl opacity-5 group-hover:opacity-10 transition-opacity" />
        <GlassCard className="relative overflow-hidden border-white/40 bg-white/40 backdrop-blur-2xl rounded-[2.5rem] p-8 shadow-xl">
          <div className="absolute top-0 right-0 -mt-8 -mr-8 w-32 h-32 bg-[#2e2f43]/5 rounded-full blur-3xl" />
          
          <div className="flex justify-between items-start mb-6">
            <div className="space-y-1">
              <span className="px-3 py-1 bg-[#2e2f43]/5 text-[#2e2f43] text-[10px] font-black rounded-full uppercase tracking-[0.2em]">
                Próxima Clase
              </span>
              {loading ? (
                <div className="h-10 w-48 bg-[#2e2f43]/5 rounded-xl animate-pulse mt-3"></div>
              ) : nextClass ? (
                <div className="pt-2">
                  <h2 className="text-3xl font-black text-[#2e2f43] tracking-tighter leading-none">
                    {nextClass.courseName}
                  </h2>
                  <p className="text-[#2e2f43]/60 font-bold text-sm uppercase tracking-wider mt-1">
                    {nextClass.level}
                  </p>
                </div>
              ) : (
                <h2 className="text-xl font-black mt-3 text-[#2e2f43]">Sin clases próximas</h2>
              )}
            </div>
            <div className="bg-[#2e2f43] p-4 rounded-2xl shadow-lg shadow-[#2e2f43]/20">
              <Calendar className="text-white" size={24} />
            </div>
          </div>
          
          {nextClass ? (
            <div className="space-y-4 mt-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-white/50 p-4 rounded-2xl border border-white/60 shadow-sm">
                  <div className="flex items-center gap-2 mb-1">
                    <Clock size={14} className="text-[#2e2f43]/40" />
                    <span className="text-[10px] font-black text-[#2e2f43]/40 uppercase tracking-widest">Horario</span>
                  </div>
                  <p className="font-black text-[#2e2f43] capitalize text-sm">
                    {format(nextClass.startTime, "EEEE, HH:mm", { locale: es })}
                  </p>
                </div>
                <div className="bg-white/50 p-4 rounded-2xl border border-white/60 shadow-sm">
                  <div className="flex items-center gap-2 mb-1">
                    <MapPin size={14} className="text-[#2e2f43]/40" />
                    <span className="text-[10px] font-black text-[#2e2f43]/40 uppercase tracking-widest">Ubicación</span>
                  </div>
                  <p className="font-black text-[#2e2f43] text-sm">{nextClass.location}</p>
                </div>
              </div>

              {!nextClass.attendanceMarked && (
                <button
                  onClick={() => setShowAttendanceModal(true)}
                  disabled={!canMarkAttendance}
                  className={`w-full py-4 rounded-2xl font-black text-xs uppercase tracking-[0.2em] transition-all ${
                    canMarkAttendance
                      ? 'bg-[#2e2f43] text-white shadow-xl shadow-[#2e2f43]/20 hover:shadow-[#2e2f43]/30 active:scale-95'
                      : 'bg-[#2e2f43]/5 text-[#2e2f43]/30 cursor-not-allowed border border-[#2e2f43]/10'
                  }`}
                >
                  {canMarkAttendance ? 'Marcar asistencia' : `Disponible en ${hoursUntilClass}h`}
                </button>
              )}
            </div>
          ) : (
            <p className="text-sm text-[#2e2f43]/40 font-bold mt-4">
              No tienes clases programadas para los próximos 7 días.
            </p>
          )}
        </GlassCard>
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
      {/* Attendance Modal */}
      <AnimatePresence>
        {showAttendanceModal && nextClass && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={() => setShowAttendanceModal(false)}>
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-white rounded-3xl p-6 shadow-2xl max-w-xs w-full border border-white/50 relative overflow-hidden"
              onClick={e => e.stopPropagation()}
            >
              {attendanceSuccess ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <div className="w-16 h-16 bg-green-100 text-green-500 rounded-full flex items-center justify-center mb-4">
                    <CheckCircle size={32} />
                  </div>
                  <h3 className="text-xl font-bold text-gray-800 mb-2">¡Asistencia Marcada!</h3>
                  <p className="text-sm text-gray-500">Que disfrutes de la clase</p>
                </div>
              ) : (
                <>
                  <div className="text-center mb-6">
                    <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-3">
                      <MapPin size={24} />
                    </div>
                    <h3 className="text-xl font-bold text-gray-800">Confirmar Asistencia</h3>
                    <p className="text-sm text-gray-500 mt-1">
                      ¿Estás en <strong>{nextClass.location}</strong> para la clase de <strong>{nextClass.courseName}</strong>?
                    </p>
                  </div>

                  <div className="space-y-3">
                    <button
                      onClick={handleMarkAttendance}
                      disabled={markingAttendance}
                      className="w-full py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl font-bold shadow-lg shadow-blue-500/30 hover:shadow-blue-500/40 active:scale-95 transition-all disabled:opacity-70 disabled:cursor-not-allowed flex justify-center items-center"
                    >
                      {markingAttendance ? (
                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      ) : (
                        'Sí, estoy aquí'
                      )}
                    </button>
                    <button
                      onClick={() => setShowAttendanceModal(false)}
                      disabled={markingAttendance}
                      className="w-full py-3 bg-gray-100 text-gray-600 rounded-xl font-bold hover:bg-gray-200 transition-colors"
                    >
                      Cancelar
                    </button>
                  </div>
                </>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
