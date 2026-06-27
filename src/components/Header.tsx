import React, { useState, useEffect } from 'react';
import { Bell, X, Check, UserPlus, Users, Settings, BookOpen, Calendar, MapPin, Info, ShieldCheck, MessageSquare, Image as ImageIcon, Lock, ChevronRight, Clock, Trash2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { collection, query, where, onSnapshot, updateDoc, doc, getDoc, Timestamp, deleteDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';

// Helper to format any date/timestamp for display
const formatNotificationDate = (ts: any) => {
  if (!ts) return '';
  try {
    let date: Date;
    if (ts instanceof Timestamp) {
      date = ts.toDate();
    } else if (ts.seconds) {
      date = new Date(ts.seconds * 1000);
    } else {
      date = new Date(ts);
    }
    
    if (isNaN(date.getTime())) return '';
    
    return formatDistanceToNow(date, { addSuffix: true, locale: es });
  } catch (e) {
    return '';
  }
};

interface HeaderProps {
  title?: string;
  showGreeting?: boolean;
  rightElement?: React.ReactNode;
}

interface Notification {
  id: string;
  type: 'vinculacion' | 'curso' | 'estado' | 'baja' | 'comunicacion';
  status: 'Pendiente' | 'Aceptada' | 'Rechazada' | 'Completada';
  data: any;
  senderName?: string;
  senderPhoto?: string;
  courseDetails?: any;
  timestamp?: any;
}

export function Header({ title, showGreeting = false, rightElement }: HeaderProps) {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);

  useEffect(() => {
    if (!user) return;

    const fetchAllNotifications = async () => {
      const qVinculacionIn = query(collection(db, 'Solicitudes_Vinculacion'), where('ID_Destino', '==', user.ID_Alumno));
      const qVinculacionOut = query(collection(db, 'Solicitudes_Vinculacion'), where('ID_Solicitante', '==', user.ID_Alumno));
      const qCursos = query(collection(db, 'Solicitudes_Cursos_Adicionales'), where('ID_Alumno', '==', user.ID_Alumno));
      const qEstado = query(collection(db, 'Solicitudes_Cambio_Estado'), where('ID_Alumno', '==', user.ID_Alumno));

      const unsubscribes: (() => void)[] = [];

      const processSnapshot = async (snapshot: any, type: Notification['type']) => {
        const notifs: Notification[] = [];
        for (const docSnap of snapshot.docs) {
          const data = docSnap.data();
          let senderName = '';
          let senderPhoto = '';
          let courseDetails = null;

          if (type === 'vinculacion') {
            const otherId = data.ID_Solicitante === user.ID_Alumno ? data.ID_Destino : data.ID_Solicitante;
            try {
              const otherRef = doc(db, 'Alumnos', otherId);
              const otherSnap = await getDoc(otherRef);
              if (otherSnap.exists()) {
                const oData = otherSnap.data();
                senderName = oData.Nombre;
                senderPhoto = oData.Foto_Alumno;
              }
            } catch (e) {
              senderName = data.ID_Solicitante === user.ID_Alumno ? data.Email_Destino : data.Email_Solicitante;
            }
          }

          if (type === 'curso' && data.ID_Curso) {
            try {
              const courseRef = doc(db, 'Cursos', data.ID_Curso);
              const courseSnap = await getDoc(courseRef);
              if (courseSnap.exists()) {
                courseDetails = courseSnap.data();
              }
            } catch (e) {
              console.error("Error fetching course details", e);
            }
          }

          notifs.push({
            id: docSnap.id,
            type,
            status: data.EstadoSolicitud || data.Estado || 'Pendiente',
            data,
            senderName,
            senderPhoto,
            courseDetails,
            timestamp: data.FechaSolicitud || data.Fecha || data.timestamp
          });
        }
        return notifs;
      };

      const unsub1 = onSnapshot(qVinculacionIn, async (snap) => {
        const items = await processSnapshot(snap, 'vinculacion');
        updateNotifs(items, 'vinculacion_in');
      });
      const unsub2 = onSnapshot(qVinculacionOut, async (snap) => {
        const items = await processSnapshot(snap, 'vinculacion');
        updateNotifs(items, 'vinculacion_out');
      });
      const unsub3 = onSnapshot(qCursos, async (snap) => {
        const items = await processSnapshot(snap, 'curso');
        updateNotifs(items, 'curso');
      });
      const unsub4 = onSnapshot(qEstado, async (snap) => {
        const items = await processSnapshot(snap, 'estado');
        updateNotifs(items, 'estado');
      });

      unsubscribes.push(unsub1, unsub2, unsub3, unsub4);
      return () => unsubscribes.forEach(unsub => unsub());
    };

    const updateNotifs = (newItems: Notification[], sourceKey: string) => {
      setNotifications(prev => {
        const otherItems = prev.filter(n => {
            if (sourceKey === 'vinculacion_in') return !(n.type === 'vinculacion' && n.data.ID_Destino === user.ID_Alumno);
            if (sourceKey === 'vinculacion_out') return !(n.type === 'vinculacion' && n.data.ID_Solicitante === user.ID_Alumno);
            if (sourceKey === 'curso') return n.type !== 'curso';
            if (sourceKey === 'estado') return n.type !== 'estado' && n.type !== 'baja';
            if (sourceKey === 'baja') return n.type !== 'baja';
            return true;
        });
        const combined = [...otherItems, ...newItems];
        return combined.sort((a, b) => {
            const timeA = a.timestamp?.seconds || (a.timestamp instanceof Date ? a.timestamp.getTime() / 1000 : (a.timestamp ? new Date(a.timestamp).getTime() / 1000 : 0));
            const timeB = b.timestamp?.seconds || (b.timestamp instanceof Date ? b.timestamp.getTime() / 1000 : (b.timestamp ? new Date(b.timestamp).getTime() / 1000 : 0));
            return (timeB || 0) - (timeA || 0);
        });
      });
    };
    fetchAllNotifications();
  }, [user]);

  useEffect(() => {
    if (showNotifications && user && notifications.length > 0) {
      const markAsRead = async () => {
        const unreadNotifs = notifications.filter(n => n.data?.leidoAlumno === false);
        for (const notif of unreadNotifs) {
          try {
            let colName = '';
            if (notif.type === 'vinculacion') {
              colName = 'Solicitudes_Vinculacion';
            } else if (notif.type === 'curso') {
              colName = 'Solicitudes_Cursos_Adicionales';
            } else if (notif.type === 'estado') {
              colName = 'Solicitudes_Cambio_Estado';
            }
            if (colName) {
              const docRef = doc(db, colName, notif.id);
              await updateDoc(docRef, { leidoAlumno: true });
            }
          } catch (e) {
            console.error("Error marking notification as read:", e);
          }
        }
      };
      markAsRead();
    }
  }, [showNotifications, notifications, user]);

  const handleResponse = async (notificationId: string, accept: boolean) => {
    try {
      const notifRef = doc(db, 'Solicitudes_Vinculacion', notificationId);
      await updateDoc(notifRef, { Estado: accept ? 'Aceptada' : 'Rechazada' });
    } catch (error) {
      console.error("Error updating request:", error);
      alert("Error al procesar la solicitud");
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Pendiente': return 'bg-yellow-100 text-yellow-700';
      case 'Aceptada':
      case 'Completada': return 'bg-green-100 text-green-700';
      case 'Rechazada': return 'bg-red-100 text-red-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  const getIcon = (type: Notification['type']) => {
    switch (type) {
      case 'vinculacion': return <Users size={18} />;
      case 'curso': return <BookOpen size={18} />;
      case 'estado': return <Settings size={18} />;
      case 'baja': return <X size={18} />;
      default: return <Bell size={18} />;
    }
  };

  const handleDeleteNotification = async (notif: Notification) => {
    try {
        if (notif.type === 'vinculacion') {
            await deleteDoc(doc(db, 'Vinculaciones', notif.id));
        } else {
            await deleteDoc(doc(db, 'Notificaciones', notif.id));
        }
    } catch (error) {
        console.error("Error deleting notification", error);
    }
  };

  const getTitle = (notif: Notification) => {
    switch (notif.type) {
      case 'vinculacion': 
        return notif.data.ID_Solicitante === user?.ID_Alumno 
            ? 'Vincular Perfil (Enviada)' 
            : 'Vincular Perfil (Recibida)';
      case 'curso': return 'Curso Adicional';
      case 'estado': return 'Cambio de Estado';
      case 'baja': return 'Baja Definitiva';
      default: return 'Notificación';
    }
  };

  const pendingCount = notifications.filter(n => 
    n.data?.leidoAlumno === false || 
    (n.type === 'vinculacion' && n.data?.ID_Destino === user?.ID_Alumno && n.status === 'Pendiente' && n.data?.leidoAlumno !== true)
  ).length;

  return (
    <>
      <header 
        className="sticky top-0 z-[100] bg-white/70 backdrop-blur-md pb-3 px-6 -mx-4 mb-6 flex justify-between items-center"
        style={{ paddingTop: 'max(1.25rem, env(safe-area-inset-top))' }}
      >
        <div>
          {showGreeting ? (
            <>
              <h1 className="text-2xl font-bold text-gray-800">Hola, {user?.Nombre ? user.Nombre.split(' ')[0] : 'Alumno'} 👋</h1>
              <p className="text-sm text-gray-500">¿Listo para bailar?</p>
            </>
          ) : (
            <h1 className="text-2xl font-bold text-[#2e2f43]">{title}</h1>
          )}
        </div>
        <div className="flex items-center gap-3">
          {rightElement}
          <div className="relative flex items-center justify-center">
            <button 
                onClick={() => setShowNotifications(true)}
                className="text-gray-600 hover:text-[#2e2f43] transition-all p-1"
            >
              <Bell size={24} />
            </button>
            {pendingCount > 0 && (
              <div className="absolute top-0 right-0 w-4 h-4 bg-red-500 border border-white rounded-full flex items-center justify-center text-[9px] text-white font-bold translate-x-1/4 -translate-y-1/4">
                {pendingCount}
              </div>
            )}
          </div>
          {/* User Profile Button */}
          <button 
            onClick={() => window.location.href = '/profile'}
            className="w-10 h-10 rounded-full overflow-hidden border-2 border-[#2e2f43] shadow-sm hover:opacity-80 transition-all ml-1"
          >
            <img 
              src={user?.Foto_Alumno || `https://ui-avatars.com/api/?name=${user?.Nombre || 'User'}&background=2e2f43&color=fff`} 
              alt="Perfil" 
              className="w-full h-full object-cover"
            />
          </button>
        </div>
      </header>

      {/* Notifications Modal */}
      <AnimatePresence>
        {showNotifications && (
            <div className="fixed inset-0 z-[110] flex justify-end pointer-events-none">
                <motion.div 
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className="absolute inset-0 bg-black/20 backdrop-blur-sm pointer-events-auto"
                    onClick={() => setShowNotifications(false)}
                />

                <motion.div
                    initial={{ x: '100%', opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: '100%', opacity: 0 }}
                    className="w-full max-w-sm bg-white rounded-3xl shadow-2xl overflow-hidden pointer-events-auto absolute top-[70px] right-4 flex flex-col max-h-[80vh] border border-gray-100"
                >
                    <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                        <h3 className="font-bold text-gray-800">Notificaciones y Solicitudes</h3>
                        <button onClick={() => setShowNotifications(false)} className="p-1 rounded-full hover:bg-gray-200 text-gray-500">
                            <X size={20} />
                        </button>
                    </div>

                    <div className="p-4 overflow-y-auto space-y-4 flex-grow">
                        {notifications.length === 0 ? (
                            <div className="text-center py-12 text-gray-400">
                                <Bell size={48} className="mx-auto mb-4 opacity-10" />
                                <p className="text-sm font-medium">No tienes notificaciones</p>
                            </div>
                        ) : (
                            notifications.map(notif => (
                                <div key={notif.id} className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm hover:border-gray-200 transition-all group">
                                    <div className="flex items-start gap-3 mb-3 relative">
                                        <div className={cn(
                                            "p-2 rounded-xl shrink-0",
                                            notif.type === 'vinculacion' ? "bg-blue-50 text-blue-600" :
                                            notif.type === 'curso' ? "bg-purple-50 text-purple-600" :
                                            notif.type === 'estado' ? "bg-orange-50 text-orange-600" :
                                            "bg-gray-50 text-gray-600"
                                        )}>
                                            {getIcon(notif.type)}
                                        </div>
                                        <div className="flex-grow pr-6">
                                            <div className="flex justify-between items-start mb-1">
                                                <p className="text-sm font-black text-[#2e2f43] leading-tight">
                                                    {getTitle(notif)}
                                                </p>
                                                <span className={cn(
                                                    "text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider shrink-0 ml-2",
                                                    getStatusColor(notif.status)
                                                )}>
                                                    {notif.status}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-1.5 opacity-40">
                                                <Clock size={10} />
                                                <p className="text-[10px] font-bold">
                                                    {formatNotificationDate(notif.timestamp)}
                                                </p>
                                            </div>
                                        </div>
                                        
                                        {/* Delete Button */}
                                        {notif.status !== 'Pendiente' && (
                                            <button 
                                                onClick={() => handleDeleteNotification(notif)}
                                                className="absolute -top-2 -right-2 p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-full transition-all opacity-0 group-hover:opacity-100 sm:opacity-100"
                                                title="Eliminar notificación"
                                            >
                                                <X size={16} />
                                            </button>
                                        )}
                                    </div>

                                    {/* Detailed Cards */}
                                    {notif.type === 'vinculacion' && (
                                        <div className="bg-gray-50 rounded-xl p-3 flex items-center gap-3 border border-gray-100">
                                            <img 
                                                src={notif.senderPhoto || `https://ui-avatars.com/api/?name=${notif.senderName}&background=random`} 
                                                className="w-10 h-10 rounded-full object-cover border border-white shadow-sm"
                                                alt="User"
                                            />
                                            <div>
                                                <p className="text-xs font-bold text-[#2e2f43]">{notif.senderName}</p>
                                                <p className="text-[10px] text-gray-500">
                                                    {notif.data.ID_Solicitante === user?.ID_Alumno ? 'Solicitado' : 'Solicitante'}
                                                </p>
                                            </div>
                                        </div>
                                    )}

                                    {notif.type === 'curso' && notif.courseDetails && (
                                        <div className="bg-purple-50/50 rounded-xl p-3 border border-purple-100">
                                            <div className="flex justify-between items-start">
                                                <div>
                                                    <p className="text-xs font-bold text-[#2e2f43]">{notif.courseDetails.NombreCurso}</p>
                                                    <p className="text-[10px] text-purple-600 font-bold uppercase tracking-tight mt-0.5">
                                                        {notif.courseDetails.Disciplina} • {notif.courseDetails.Nivel}
                                                    </p>
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-[10px] font-bold text-gray-500">{notif.courseDetails.HoraInicio}</p>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {notif.type === 'estado' && (
                                        <div className="bg-orange-50/50 rounded-xl p-3 border border-orange-100 flex items-center justify-between">
                                            <div className="text-center flex-1">
                                                <p className="text-[9px] font-bold text-gray-400 uppercase mb-1">Actual</p>
                                                <span className="text-xs font-bold text-gray-600">{notif.data.EstadoActual || user?.Estado}</span>
                                            </div>
                                            <ChevronRight size={14} className="text-orange-300 mx-2" />
                                            <div className="text-center flex-1">
                                                <p className="text-[9px] font-bold text-orange-400 uppercase mb-1">Solicitado</p>
                                                <span className="text-xs font-bold text-gray-600">
                                                    {notif.data.EstadoSolicitado}
                                                </span>
                                            </div>
                                        </div>
                                    )}

                                    {notif.data.ObservacionesRechazo && (
                                        <div className="mt-3 bg-[#2e2f43]/5 border border-[#2e2f43]/10 rounded-xl p-3">
                                            <p className="text-[10px] font-black uppercase tracking-wider text-[#2e2f43]/60 mb-0.5">
                                                Respuesta de Mambo
                                            </p>
                                            <p className="text-xs font-semibold text-[#2e2f43] leading-relaxed">
                                                {notif.data.ObservacionesRechazo}
                                            </p>
                                        </div>
                                    )}

                                    {notif.type === 'vinculacion' && notif.data.ID_Destino === user?.ID_Alumno && notif.status === 'Pendiente' && (
                                        <div className="flex gap-2 mt-4">
                                            <button 
                                                onClick={() => handleResponse(notif.id, true)}
                                                className="flex-1 py-2.5 bg-[#2e2f43] text-white rounded-xl hover:bg-[#2e2f43]/90 flex items-center justify-center transition-all shadow-sm"
                                            >
                                                <Check size={18} />
                                            </button>
                                            <button 
                                                onClick={() => handleResponse(notif.id, false)}
                                                className="flex-1 py-2.5 bg-red-50 text-red-600 rounded-xl hover:bg-red-100 flex items-center justify-center transition-all border border-red-100"
                                            >
                                                <X size={18} />
                                            </button>
                                        </div>
                                    )}
                                </div>
                            ))
                        )}
                    </div>
                </motion.div>
            </div>
        )}
      </AnimatePresence>
    </>
  );
}
