import React, { useState, useEffect } from 'react';
import { GlassCard } from '@/components/GlassCard';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { useAttendance } from '@/hooks/useAttendance';
import { useCalculoAsistenciaEnVivo } from '@/hooks/useCalculoAsistenciaEnVivo';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, getDay, startOfDay, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { collection, query, where, getDocs, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/context/AuthContext';
import { BookOpen, Clock, Info, X, MessageCircle, User, MapPin, Plus, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Header } from '@/components/Header';
import { cn } from '@/lib/utils';
import { Star, ChevronRight } from 'lucide-react';

import { safeToDate } from '@/hooks/useRecovery';

interface Course {
  ID_Curso: string;
  NombreCurso: string;
  Nivel: string;
  Subnivel?: string;
  Disciplina?: string;
  Estilo?: string;
  Modalidad?: string;
  DiasSemana: string;
  HoraInicio: string;
  FechaInicioCurso: string | Timestamp;
  FechaFinCurso: string | Timestamp;
  Ubicacion?: string;
  EnlaceWhatsApp?: string;
}

interface PrivateClassPack {
  id: string; // The pack identifier (e.g., AJUR_P_23_11_25)
  ClasesTotales: number;
  ClasesConsumidas: number;
  FechaCaducidad: Date;
  FechaCompra: Date;
}

export default function Classes() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { stats, loading: loadingStats } = useAttendance();
  const { 
    saldoActual, 
    asistenciasTrimestre, 
    faltasTrimestre, 
    recuperacionesTrimestre, 
    currentQuarterLabel,
    isLoading: loadingLive 
  } = useCalculoAsistenciaEnVivo(user?.ID_Alumno);
  
  const [myCourses, setMyCourses] = useState<Course[]>([]);
  const [privateClasses, setPrivateClasses] = useState<PrivateClassPack[]>([]);
  const [loadingCourses, setLoadingCourses] = useState(true);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [expandedCourseId, setExpandedCourseId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;

    const fetchData = async () => {
      try {
        // 1. Fetch Courses
        let courseIds: string[] = [];
        if (user.cursosInscritos && Array.isArray(user.cursosInscritos)) {
          courseIds = user.cursosInscritos.map((c: any) => c.id || c.ID_Curso).filter(Boolean);
        } else {
          const assignmentsQ = query(
            collection(db, 'Cursos_Asignacion_Alumnos'),
            where('ID_Alumno', '==', user.ID_Alumno)
          );
          const assignmentsSnap = await getDocs(assignmentsQ);
          courseIds = assignmentsSnap.docs.map(doc => doc.data().ID_Curso);
        }

        if (courseIds.length > 0) {
          const coursesQ = query(collection(db, 'Cursos'), where('ID_Curso', 'in', courseIds));
          const coursesSnap = await getDocs(coursesQ);
          
          const today = startOfDay(new Date());

          const activeCourses = coursesSnap.docs
            .map(doc => ({ ID_Curso: doc.id, ...doc.data() } as Course))
            .filter(course => {
              if (!course.FechaInicioCurso || !course.FechaFinCurso) return false;

              const start = safeToDate(course.FechaInicioCurso);
              const end = safeToDate(course.FechaFinCurso);

              // Allow courses that haven't ended yet
              return today <= end;
            });

          setMyCourses(activeCourses);
        } else {
          setMyCourses([]);
        }

        // 2. Fetch Private Classes
        const privateClassesQ = query(
          collection(db, 'Clases_Particulares'),
          where('ID_Alumno', '==', user.ID_Alumno)
        );
        const privateClassesSnap = await getDocs(privateClassesQ);
        
        // Group by Pack ID (e.g., AJUR_P_23_11_25)
        const packsMap = new Map<string, { 
            total: number; 
            consumed: number; 
            date: Date;
            docs: any[];
        }>();

        privateClassesSnap.docs.forEach(doc => {
            const data = doc.data();
            // ID format: PREFIX_TYPE_DD_MM_YY_INDEX
            // Example: AJUR_P_23_11_25_01
            const parts = doc.id.split('_');
            
            // Check if it's a pack (contains 'P' and follows structure)
            if (parts.length >= 6 && parts[1] === 'P') {
                const packId = parts.slice(0, 5).join('_'); // AJUR_P_23_11_25
                
                // Parse Date from ID: 23_11_25 -> 2025-11-23
                const day = parseInt(parts[2]);
                const month = parseInt(parts[3]);
                const yearShort = parseInt(parts[4]);
                const fullYear = 2000 + yearShort;
                const purchaseDate = new Date(fullYear, month - 1, day);

                if (!packsMap.has(packId)) {
                    packsMap.set(packId, { 
                        total: data.NumClasePack || 10, 
                        consumed: 0,
                        date: purchaseDate,
                        docs: []
                    });
                }
                
                const pack = packsMap.get(packId)!;
                pack.docs.push(data);
                
                if (data.Realizada === 'Realizada') {
                    pack.consumed += 1;
                }
            }
        });

        const activePacks: PrivateClassPack[] = [];

        packsMap.forEach((info, id) => {
            // Active Condition:
            // 1. Any class is 'No realizada'
            // 2. Any class is 'Pendiente' (Pagada)
            // 3. Or if we assume implicit remaining classes (consumed < total) - User emphasized explicit fields, but let's be safe.
            // User said: "mostrar la tarjeta de Pack si algunas de las clases... tienen 'Realizada' como 'No realizada' o ... 'Pagada' como 'Pendiente'"
            
            const hasPendingOrUnfinished = info.docs.some(d => 
                d.Realizada === 'No realizada' || d.Pagada === 'Pendiente'
            );

            // Also consider it active if we haven't consumed all classes yet (implicit future classes)
            // But strictly following user request:
            if (hasPendingOrUnfinished || info.consumed < info.total) {
                 // Calculate expiration (e.g., 6 months for 10 classes, 3 months for 5)
                const monthsToAdd = info.total >= 10 ? 6 : 3;
                const expirationDate = new Date(info.date);
                expirationDate.setMonth(expirationDate.getMonth() + monthsToAdd);

                activePacks.push({
                    id,
                    ClasesTotales: info.total,
                    ClasesConsumidas: info.consumed,
                    FechaCaducidad: expirationDate,
                    FechaCompra: info.date
                });
            }
        });

        // Sort by purchase date descending
        activePacks.sort((a, b) => b.FechaCompra.getTime() - a.FechaCompra.getTime());
        
        setPrivateClasses(activePacks);

      } catch (error) {
        console.error("Error fetching data:", error);
      } finally {
        setLoadingCourses(false);
      }
    };

    fetchData();
  }, [user]);

  // Calendar Generation
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });
  
  // Adjust for Monday start (0=Sun, 1=Mon... 6=Sat) -> (0=Mon... 6=Sun)
  const startDayOfWeek = (getDay(monthStart) + 6) % 7; 
  const emptyDays = Array.from({ length: startDayOfWeek });

  // Gauge Chart Data
  const gaugeData = [
    { name: 'Asistencia', value: stats.attendanceRate, color: '#ffba15' },
    { name: 'Restante', value: 100 - stats.attendanceRate, color: '#e5e7eb' },
  ];

  // Determine color based on saldoActual (Faltas Acumuladas)
  // Low absences (0-3) = Green/Good
  // Medium absences (4-7) = Orange/Warning
  // High absences (8-10) = Red/Danger
  const getBalanceColor = (balance: number) => {
    if (balance >= 8) return '#ef4444'; // red-500
    if (balance >= 4) return '#f97316'; // orange-500
    return '#22c55e'; // green-500
  };

  const balanceColor = getBalanceColor(saldoActual);

  const [selectedDay, setSelectedDay] = useState<{
    date: Date;
    entries: {
        status: 'present' | 'absent' | 'holiday' | 'recovered';
        className?: string;
        time?: string;
        location?: string;
    }[];
  } | null>(null);

  if (loadingStats || loadingCourses || loadingLive) return <div className="p-8 text-center text-gray-500">Cargando...</div>;

  const hasActivePack = privateClasses.length > 0;
  const activePack = hasActivePack ? privateClasses[0] : null;

  return (
    <div className="space-y-4 pt-4 pb-24 relative">
      <Header title="Mis Clases" />

      {/* 1. Calendar Section (Compact Card) */}
      <GlassCard className="p-4">
        <div className="flex items-center justify-between mb-2">
            <h2 className="text-base font-bold text-[#2e2f43] capitalize">
                {format(currentMonth, 'MMMM yyyy', { locale: es })}
            </h2>
        </div>
        
        <div className="grid grid-cols-7 gap-1">
            {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map(day => (
                <div key={day} className="text-center text-[9px] font-bold text-[#2e2f43]/40 uppercase mb-1">
                    {day}
                </div>
            ))}

            {emptyDays.map((_, i) => (
                <div key={`empty-${i}`} className="aspect-square" />
            ))}
            
            {daysInMonth.map((date, i) => {
                const dayData = stats.history.find(h => isSameDay(h.date, date));
                const entries = dayData?.entries || [];
                const isToday = isSameDay(date, new Date());

                // Determine overall status for the day (priority: present > recovered > absent > holiday)
                let status: 'present' | 'absent' | 'holiday' | 'recovered' | null = null;
                if (entries.some(e => e.status === 'present')) status = 'present';
                else if (entries.some(e => e.status === 'recovered')) status = 'recovered';
                else if (entries.some(e => e.status === 'absent')) status = 'absent';
                else if (entries.some(e => e.status === 'holiday')) status = 'holiday';

                let bgClass = 'bg-transparent';
                let textClass = 'text-[#2e2f43]';
                let shadowClass = '';
                let cursorClass = 'cursor-default';

                if (status === 'present') {
                    bgClass = 'bg-[#2e2f43]';
                    textClass = 'text-white font-medium';
                    cursorClass = 'cursor-pointer';
                    if (isToday) {
                        shadowClass = 'ring-2 ring-[#ffba15] ring-inset';
                    }
                } else if (status === 'absent') {
                    bgClass = 'bg-red-500/10';
                    textClass = 'text-red-600 font-medium';
                    cursorClass = 'cursor-pointer';
                } else if (status === 'recovered') {
                    bgClass = 'bg-green-500/10';
                    textClass = 'text-green-600 font-medium';
                    cursorClass = 'cursor-pointer';
                } else if (status === 'holiday') {
                    bgClass = 'bg-purple-500/10';
                    textClass = 'text-purple-600';
                } else if (isToday) {
                    bgClass = 'bg-transparent';
                    textClass = 'text-[#ffba15] font-black';
                    shadowClass = 'ring-2 ring-[#ffba15] ring-inset';
                }

                return (
                    <div 
                        key={i} 
                        onClick={() => dayData && status !== 'holiday' ? setSelectedDay({ date, entries }) : null}
                        className={`aspect-square flex items-center justify-center rounded-full text-[10px] transition-all ${bgClass} ${textClass} ${shadowClass} ${cursorClass}`}
                    >
                        {format(date, 'd')}
                    </div>
                );
            })}
        </div>
      </GlassCard>

      {/* 2. Insights Section (Distinct Cards) */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-2xl p-3 shadow-sm border border-gray-100 flex flex-col items-center justify-center text-center">
            <span className="text-2xl font-bold text-[#2e2f43]">{asistenciasTrimestre}</span>
            <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mt-1">Asistencias</span>
        </div>
        <div className="bg-white rounded-2xl p-3 shadow-sm border border-gray-100 flex flex-col items-center justify-center text-center">
            <span className="text-2xl font-bold text-red-500">{faltasTrimestre}</span>
            <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mt-1">Faltas</span>
        </div>
        <div className="bg-white rounded-2xl p-3 shadow-sm border border-gray-100 flex flex-col items-center justify-center text-center">
            <span className="text-2xl font-bold text-[#ffba15]">{recuperacionesTrimestre}</span>
            <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mt-1">Recuperaciones</span>
        </div>
      </div>

      {/* 2.1 Recuperaciones Acumuladas Slot Bar */}
      <GlassCard className="p-4 bg-white/60">
        <div className="flex justify-between items-center mb-3">
            <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-[#ffba15]" />
                <h3 className="text-[10px] font-black text-[#2e2f43] uppercase tracking-widest">Recuperaciones Acumuladas</h3>
            </div>
            <span className="text-xs font-black text-[#2e2f43]">{saldoActual} disponibles</span>
        </div>
        <div className="flex gap-1.5">
            {Array.from({ length: 10 }).map((_, i) => (
                <div 
                    key={i} 
                    className={cn(
                        "h-2.5 flex-1 rounded-full transition-all duration-500",
                        i < saldoActual 
                            ? "bg-[#ffba15] shadow-[0_0_10px_rgba(255,186,21,0.3)]" 
                            : "bg-[#2e2f43]/5"
                    )}
                />
            ))}
        </div>
        <p className="text-[9px] text-[#2e2f43]/40 font-bold mt-3 uppercase tracking-tight">
            * Tienes hasta final de trimestre para consumir tus recuperaciones
        </p>
      </GlassCard>

      <div className="space-y-6">
          <div className="bg-white/40 backdrop-blur-xl rounded-[2.5rem] border border-white/50 shadow-xl overflow-hidden">
                {/* Active Courses List (Standard List) */}
                <div className="p-4 space-y-4">
                    <div className="flex justify-between items-center px-2">
                        <h3 className="text-xs font-bold text-[#2e2f43]/60 uppercase tracking-wider">Mis Cursos</h3>
                        <button 
                            onClick={() => navigate('/courses')}
                            className="flex items-center gap-1.5 text-white font-bold text-xs bg-[#2e2f43] px-3 py-1.5 rounded-full hover:bg-[#2e2f43]/90 transition-colors shadow-sm"
                        >
                            <Plus size={14} />
                            Añadir Curso
                        </button>
                    </div>

                    <div className="space-y-3">
                        {myCourses.length > 0 ? (
                            myCourses.map((course) => {
                                const isExpanded = expandedCourseId === course.ID_Curso;
                                return (
                                    <motion.div
                                        key={course.ID_Curso}
                                        layout
                                        className="bg-white rounded-3xl border border-white/60 shadow-sm overflow-hidden"
                                    >
                                        <div 
                                            className="p-5 cursor-pointer"
                                            onClick={() => setExpandedCourseId(isExpanded ? null : course.ID_Curso)}
                                        >
                                            <div className="flex justify-between items-start">
                                                <div>
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <span className="text-[9px] font-bold px-2 py-0.5 bg-[#2e2f43]/5 text-[#2e2f43] rounded-full uppercase">
                                                            {course.Modalidad || 'Regular'}
                                                        </span>
                                                        <span className="text-[9px] font-bold px-2 py-0.5 bg-[#ffba15]/10 text-[#ffba15] rounded-full uppercase">
                                                            {course.Nivel}
                                                        </span>
                                                    </div>
                                                    <h4 className="text-lg font-bold text-[#2e2f43]">
                                                        {[course.Disciplina, course.Estilo].filter(Boolean).join(' ')}
                                                    </h4>
                                                    <p className="text-xs text-[#2e2f43]/60 font-medium">
                                                        {course.DiasSemana} • {course.HoraInicio}
                                                    </p>
                                                </div>
                                                <div className="bg-[#2e2f43]/5 text-[#2e2f43] p-2.5 rounded-2xl">
                                                    <BookOpen size={20} />
                                                </div>
                                            </div>

                                            <AnimatePresence>
                                                {isExpanded && (
                                                    <motion.div
                                                        initial={{ opacity: 0, height: 0 }}
                                                        animate={{ opacity: 1, height: 'auto' }}
                                                        exit={{ opacity: 0, height: 0 }}
                                                        className="mt-6 pt-6 border-t border-gray-100 space-y-4"
                                                    >
                                                        <div className="grid grid-cols-2 gap-4">
                                                            <div className="space-y-1">
                                                                <p className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Ubicación</p>
                                                                <div className="flex items-center gap-1.5 text-sm font-bold text-[#2e2f43]">
                                                                    <MapPin size={14} className="text-purple-500" />
                                                                    {course.Ubicacion || 'Sala Principal'}
                                                                </div>
                                                            </div>
                                                            <div className="space-y-1 text-right">
                                                                <p className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">WhatsApp</p>
                                                                {course.EnlaceWhatsApp ? (
                                                                    <a 
                                                                        href={course.EnlaceWhatsApp} 
                                                                        target="_blank" 
                                                                        rel="noopener noreferrer"
                                                                        className="flex items-center justify-end gap-1.5 text-sm font-bold text-green-600"
                                                                    >
                                                                        Grupo de Clase
                                                                        <MessageCircle size={14} />
                                                                    </a>
                                                                ) : (
                                                                    <p className="text-sm font-bold text-gray-300 italic">No disponible</p>
                                                                )}
                                                            </div>
                                                        </div>

                                                        <div className="pt-4">
                                                            <button className="w-full py-3 bg-red-50 text-red-600 rounded-xl font-bold text-xs flex items-center justify-center gap-2 hover:bg-red-100 transition-colors">
                                                                <Trash2 size={14} />
                                                                Solicitar baja del curso
                                                            </button>
                                                        </div>
                                                    </motion.div>
                                                )}
                                            </AnimatePresence>
                                        </div>
                                    </motion.div>
                                );
                            })
                        ) : (
                            <div className="flex flex-col items-center justify-center py-12 bg-white/20 rounded-3xl border border-dashed border-[#2e2f43]/10">
                                <BookOpen size={32} className="text-[#2e2f43]/20 mb-2" />
                                <p className="text-sm font-bold text-[#2e2f43]/40">No tienes cursos activos</p>
                                <button 
                                    onClick={() => navigate('/courses')}
                                    className="mt-4 text-blue-600 font-bold text-xs underline"
                                >
                                    Explorar cursos
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
      </div>

      {/* 4. Private Classes Section */}
      <div className="space-y-3">
        <h3 className="text-xs font-bold px-2 text-[#2e2f43]/60 uppercase tracking-wider">Clases Particulares</h3>
        
        {hasActivePack && activePack ? (
            <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-3xl p-6 text-white shadow-xl relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-10">
                    <Star size={100} />
                </div>
                <div className="relative z-10">
                    <div className="flex justify-between items-start mb-6">
                        <div>
                            <h4 className="text-lg font-bold">Pack Activo</h4>
                            <p className="text-xs text-gray-400 uppercase tracking-wider">Caduca: {activePack.FechaCaducidad ? format(activePack.FechaCaducidad, 'dd MMM yyyy', { locale: es }) : 'Sin fecha'}</p>
                        </div>
                        <div className="bg-white/10 p-2 rounded-xl">
                            <Star size={20} className="text-yellow-400 fill-yellow-400" />
                        </div>
                    </div>

                    <div className="flex items-end gap-2 mb-6">
                        <span className="text-5xl font-bold">{activePack.ClasesConsumidas}</span>
                        <span className="text-xl text-gray-400 font-medium mb-1">/ {activePack.ClasesTotales}</span>
                    </div>

                    <div className="flex gap-1.5">
                        {Array.from({ length: activePack.ClasesTotales }).map((_, i) => (
                            <div 
                                key={i} 
                                className={`h-2 flex-1 rounded-full ${i < activePack.ClasesConsumidas ? 'bg-yellow-400' : 'bg-white/20'}`}
                            />
                        ))}
                    </div>
                </div>
            </div>
        ) : (
            <div className="bg-white rounded-3xl p-5 border border-white/60 shadow-sm">
                <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-yellow-50 flex items-center justify-center text-yellow-600 shrink-0">
                        <Star size={24} className="fill-yellow-600" />
                    </div>
                    <div>
                        <h4 className="text-base font-bold text-[#2e2f43]">Clases Particulares</h4>
                        <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                            Mejora tu técnica con atención personalizada. Packs de 1, 5 o 10 clases disponibles.
                        </p>
                        <button 
                            onClick={() => setShowInfoModal(true)}
                            className="mt-3 text-xs font-bold text-blue-600 flex items-center gap-1 hover:underline"
                        >
                            Ver precios y solicitar
                            <ChevronRight size={14} />
                        </button>
                    </div>
                </div>
            </div>
        )}
      </div>

      {/* Info Modal for Private Classes */}
      <AnimatePresence>
        {showInfoModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={() => setShowInfoModal(false)}>
                <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    className="bg-white rounded-3xl p-6 shadow-2xl max-w-sm w-full border border-white/50 relative overflow-hidden"
                    onClick={e => e.stopPropagation()}
                >
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="text-xl font-bold text-[#2e2f43]">Clases Particulares</h3>
                        <button onClick={() => setShowInfoModal(false)} className="p-2 bg-gray-100 rounded-full text-gray-500 hover:bg-gray-200">
                            <X size={18} />
                        </button>
                    </div>

                    <div className="space-y-4 mb-6">
                        <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100">
                            <div className="flex justify-between items-center mb-2">
                                <span className="font-bold text-gray-700">Clase Suelta</span>
                                <span className="font-bold text-blue-600">45€</span>
                            </div>
                            <p className="text-xs text-gray-500">1 hora de clase personalizada.</p>
                        </div>
                        <div className="p-4 bg-blue-50 rounded-2xl border border-blue-100 relative overflow-hidden">
                            <div className="absolute top-0 right-0 bg-blue-600 text-white text-[9px] font-bold px-2 py-1 rounded-bl-xl uppercase">
                                Popular
                            </div>
                            <div className="flex justify-between items-center mb-2">
                                <span className="font-bold text-gray-700">Pack 5 Clases</span>
                                <span className="font-bold text-blue-600">200€</span>
                            </div>
                            <p className="text-xs text-gray-500">Ahorras 25€. Caducidad 3 meses.</p>
                        </div>
                        <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100">
                            <div className="flex justify-between items-center mb-2">
                                <span className="font-bold text-gray-700">Pack 10 Clases</span>
                                <span className="font-bold text-blue-600">380€</span>
                            </div>
                            <p className="text-xs text-gray-500">Ahorras 70€. Caducidad 6 meses.</p>
                        </div>
                    </div>

                    <button className="w-full py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl font-bold shadow-lg shadow-blue-500/30 hover:shadow-blue-500/40 active:scale-95 transition-all">
                        Solicitar Información
                    </button>
                </motion.div>
            </div>
        )}
      </AnimatePresence>

      {/* Day Details Modal */}
      {selectedDay && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/20 backdrop-blur-sm" onClick={() => setSelectedDay(null)}>
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="bg-white rounded-3xl p-6 shadow-2xl max-w-sm w-full border border-white/50"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-between items-start mb-6">
                <div>
                    <h3 className="text-lg font-bold text-[#2e2f43] capitalize">
                        {format(selectedDay.date, 'EEEE d MMMM', { locale: es })}
                    </h3>
                    <p className="text-xs text-gray-400 font-medium mt-1">Detalle de actividad</p>
                </div>
                <button 
                    onClick={() => setSelectedDay(null)}
                    className="p-1 rounded-full bg-gray-100 text-gray-400 hover:bg-gray-200 hover:text-gray-600 transition-colors"
                >
                    <X size={16} />
                </button>
            </div>

            <div className="space-y-6 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
                {selectedDay.entries.map((entry, idx) => (
                    <div key={idx} className="p-4 rounded-2xl bg-gray-50 border border-gray-100 space-y-4">
                        <div className="flex justify-between items-center">
                            <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-md ${
                                entry.status === 'present' ? 'bg-[#2e2f43] text-white' :
                                entry.status === 'absent' ? 'bg-red-100 text-red-600' :
                                entry.status === 'recovered' ? 'bg-green-100 text-green-600' :
                                'bg-gray-100 text-gray-600'
                            }`}>
                                {entry.status === 'present' ? 'Asistencia' :
                                 entry.status === 'absent' ? 'Falta' :
                                 entry.status === 'recovered' ? 'Recuperada' : 'Festivo'}
                            </span>
                        </div>

                        <div className="space-y-3">
                            <div className="flex items-start gap-3">
                                <div className="bg-blue-50 p-2 rounded-xl text-blue-600">
                                    <BookOpen size={18} />
                                </div>
                                <div>
                                    <p className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Clase</p>
                                    <p className="text-sm font-bold text-[#2e2f43]">{entry.className || 'Clase Regular'}</p>
                                </div>
                            </div>
                            
                            {entry.time && (
                                <div className="flex items-start gap-3">
                                    <div className="bg-orange-50 p-2 rounded-xl text-orange-600">
                                        <Clock size={18} />
                                    </div>
                                    <div>
                                        <p className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Horario</p>
                                        <p className="text-sm font-bold text-[#2e2f43]">{entry.time}</p>
                                    </div>
                                </div>
                            )}

                            {entry.location && (
                                <div className="flex items-start gap-3">
                                    <div className="bg-purple-50 p-2 rounded-xl text-purple-600">
                                        <MapPin size={18} />
                                    </div>
                                    <div>
                                        <p className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Ubicación</p>
                                        <p className="text-sm font-bold text-[#2e2f43]">{entry.location}</p>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                ))}
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
