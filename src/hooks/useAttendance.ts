import { useState, useEffect } from 'react';
import { collection, query, where, getDocs, Timestamp, orderBy, limit, documentId } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/context/AuthContext';
import { startOfDay, isSameDay, parseISO, getDay, addDays, setHours, setMinutes, isAfter, format, startOfWeek, endOfWeek } from 'date-fns';
import { es } from 'date-fns/locale';
import { safeToDate } from './useRecovery';

interface AttendanceStats {
  totalAbsences: number;
  maxAbsences: number;
  recoveryBalance: number;
  attendanceRate: number;
  history: { 
    date: Date; 
    entries: HistoryEntry[];
  }[];
}

interface HistoryEntry {
    status: 'present' | 'absent' | 'holiday' | 'recovered';
    className?: string;
    time?: string;
    location?: string;
}

export interface NextClass {
  id: string;
  courseName: string;
  level: string;
  startTime: Date;
  endTime: Date;
  location: string;
  attendanceMarked: boolean;
  rol?: string | null;
  asistenciaCerrada?: boolean;
  attendanceStatus?: 'present' | 'absent' | 'none';
  estadoAsignacion?: string | null;
}

interface Event {
  id: string;
  title: string;
  date: Date;
  type: string;
  image?: string | null;
}

interface ClassData {
  id: string;
  ID_Curso: string;
  FechaClase: string | Timestamp;
  HoraInicio: string;
  HoraFin?: string;
  Anulacion?: boolean | string;
  [key: string]: any;
}

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

export function useAttendance() {
  const { user } = useAuth();
  const [stats, setStats] = useState<AttendanceStats>({
    totalAbsences: 0,
    maxAbsences: 10,
    recoveryBalance: 10,
    attendanceRate: 100,
    history: []
  });
  const [nextClass, setNextClass] = useState<NextClass | null>(null);
  const [upcomingClasses, setUpcomingClasses] = useState<NextClass[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    const fetchData = async () => {
      try {
        // 1. Fetch Assignments (with fallback to legacy collection)
        let assignments: any[] = [];
        let courseIds: string[] = [];
        const cursosInscritosArray = getCursosInscritosArray(user.cursosInscritos);
        if (cursosInscritosArray.length > 0) {
            assignments = cursosInscritosArray.map((c: any) => {
                let date = new Date(0);
                const fa = c.fechaAsignacion || c.FechaAsignacion;
                if (fa) {
                    if (fa instanceof Timestamp) date = fa.toDate();
                    else if (typeof fa === 'string') date = parseISO(fa);
                }
                return {
                    ID_Curso: c.id || c.ID_Curso,
                    FechaAsignacion: date
                };
            });
            courseIds = assignments.map(a => a.ID_Curso).filter(Boolean);
        } else {
            const assignmentsQ = query(
              collection(db, 'Cursos_Asignacion_Alumnos'),
              where('ID_Alumno', '==', user.ID_Alumno)
            );
            const assignmentsSnap = await getDocs(assignmentsQ);
            assignments = assignmentsSnap.docs.map(d => {
                const data = d.data();
                let date = new Date(0);
                if (data.FechaAsignacion instanceof Timestamp) date = data.FechaAsignacion.toDate();
                else if (typeof data.FechaAsignacion === 'string') date = parseISO(data.FechaAsignacion);
                return {
                    ID_Curso: data.ID_Curso,
                    FechaAsignacion: date
                };
            });
            courseIds = assignments.map(a => a.ID_Curso);
        }

        // 2. Fetch Courses details
        let courses: Record<string, any> = {};
        if (courseIds.length > 0) {
          const coursesQ = query(collection(db, 'Cursos'), where(documentId(), 'in', courseIds));
          const coursesSnap = await getDocs(coursesQ);
          courses = coursesSnap.docs.reduce((acc, doc) => {
            acc[doc.id] = doc.data();
            return acc;
          }, {} as Record<string, any>);
        }

        // 3. Fetch Holidays
        const holidaysSnap = await getDocs(collection(db, 'Dias Festivos'));
        const holidays = holidaysSnap.docs.map(d => {
            const data = d.data();
            if (typeof data.FechaFestivo === 'string') {
                return data.FechaFestivo.split('T')[0];
            } else if (data.FechaFestivo instanceof Timestamp) {
                return format(data.FechaFestivo.toDate(), 'yyyy-MM-dd');
            }
            return '';
        }).filter(Boolean);

        // 4. Fetch Attendance Records for fallback
        const attendanceQ = query(
          collection(db, 'Asistencia_Clases_Regulares'),
          where('ID_Alumno', '==', user.ID_Alumno)
        );
        const attendanceSnap = await getDocs(attendanceQ);
        
        // 5. Fetch Recoveries for fallback
        const recoveriesQ = query(
          collection(db, 'Asistencia_Recuperaciones'),
          where('ID_Alumno', '==', user.ID_Alumno)
        );
        const recoveriesSnap = await getDocs(recoveriesQ);
        
        const recoveryDates: string[] = [];
        recoveriesSnap.docs.forEach(doc => {
            const data = doc.data();
            let dateStr = '';
            if (data.Timestamp_Asistencia instanceof Timestamp) {
                dateStr = format(data.Timestamp_Asistencia.toDate(), 'yyyy-MM-dd');
            } else if (typeof data.Timestamp_Asistencia === 'string') {
                dateStr = data.Timestamp_Asistencia.split('T')[0];
            }
            if (dateStr) recoveryDates.push(dateStr);
        });

        // 6. Fetch Events
        try {
          const eventsQ = query(collection(db, 'Eventos'));
          const eventsSnap = await getDocs(eventsQ);
          
          const fetchedEvents = eventsSnap.docs.map(doc => {
            const data = doc.data();
            let date = new Date();
            
            if (data.FechaInicioEvento) {
                if (data.FechaInicioEvento instanceof Timestamp) {
                    date = data.FechaInicioEvento.toDate();
                } else if (typeof data.FechaInicioEvento === 'string') {
                    let dateStr = data.FechaInicioEvento;
                    if (dateStr.includes('/')) dateStr = dateStr.replace(/\//g, '-');
                    
                    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
                        let timeStr = data.HoraInicioEvento || "00:00";
                        date = parseISO(`${dateStr}T${timeStr}`);
                    }
                }
            }
            
            return {
              id: doc.id,
              title: data.NombreEvento || 'Evento',
              date: date,
              type: data.TipoEvento || 'General',
              image: data.CartelEvento || null
            };
          })
          .filter(e => isAfter(e.date, new Date()))
          .sort((a, b) => a.date.getTime() - b.date.getTime())
          .slice(0, 3);

          setEvents(fetchedEvents);
        } catch (e) {
          console.log("Events error", e);
        }

        // --- CALCULATION LOGIC ---
        const SEASON_START = new Date('2025-09-01');
        
        let totalClasses = 0;
        let rawAbsences = 0;
        let recoveryCount = 0;
        const historyMap = new Map<string, HistoryEntry[]>();
        const today = startOfDay(new Date());
        const now = new Date();
        const todayStr = format(now, 'yyyy-MM-dd');
        const currentTimeStr = format(now, 'HH:mm');

        let nextClassData: NextClass | null = null;

        if (courseIds.length > 0) {
            const classesQ = query(
              collection(db, 'Clases'),
              where('ID_Curso', 'in', courseIds)
            );
            const classesSnap = await getDocs(classesQ);

            const allClasses = classesSnap.docs.map(doc => {
                const data = doc.data() as ClassData;
                let dateStr = '';
                
                if (data.FechaClase instanceof Timestamp) {
                    dateStr = format(data.FechaClase.toDate(), 'yyyy-MM-dd');
                } else if (typeof data.FechaClase === 'string') {
                    dateStr = data.FechaClase;
                } else {
                    return null;
                }

                if (dateStr.includes('/')) dateStr = dateStr.replace(/\//g, '-');
                
                if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
                     const parts = dateStr.split('-');
                     if (parts.length === 3) {
                          if (parts[2].length === 4) {
                              dateStr = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
                          }
                     }
                }

                return {
                    ...data,
                    id: doc.id,
                    _normalizedDate: dateStr,
                    _normalizedTime: (data.HoraInicio || "00:00").padStart(5, '0')
                };
            }).filter(Boolean) as any[];

            // 1. History Calculation (Past Classes)
            const pastClasses = allClasses.filter(c => {
                if (c.Anulacion === true || c.Anulacion === 'true') return false;
                if (c._normalizedDate < format(SEASON_START, 'yyyy-MM-dd')) return false;
                if (c._normalizedDate > todayStr) return false;
                if (c._normalizedDate === todayStr && c._normalizedTime > currentTimeStr) return false;
                return true;
            });

            pastClasses.forEach(cls => {
                const idAlumno = user.ID_Alumno;

                if (holidays.includes(cls._normalizedDate)) {
                    historyMap.set(cls._normalizedDate, [{ status: 'holiday' }]);
                    return;
                }

                const registro_en_vivo = cls.registro_en_vivo || [];
                const registro_recuperaciones_en_vivo = cls.registro_recuperaciones_en_vivo || [];

                let hasAttendanceRecord = false;
                let hasRecoveryRecord = false;
                let attended = false;
                let missed = false;

                if (Array.isArray(registro_en_vivo)) {
                    const record = registro_en_vivo.find((r: any) => r.idAlumno === idAlumno);
                    if (record) {
                        hasAttendanceRecord = true;
                        attended = record.Asistencia === true;
                        missed = record.Asistencia === false;
                    }
                } else {
                    hasAttendanceRecord = Object.prototype.hasOwnProperty.call(registro_en_vivo, idAlumno);
                    if (hasAttendanceRecord) {
                        attended = registro_en_vivo[idAlumno] === true;
                        missed = registro_en_vivo[idAlumno] === false;
                    }
                }

                if (Array.isArray(registro_recuperaciones_en_vivo)) {
                    hasRecoveryRecord = registro_recuperaciones_en_vivo.some((r: any) => r.idAlumno === idAlumno && r.Asistencia === true);
                } else {
                    hasRecoveryRecord = registro_recuperaciones_en_vivo[idAlumno] === true;
                }

                // If no in-vivo record, check if student was assigned to this course on class date
                const assignment = assignments.find(a => a.ID_Curso === cls.ID_Curso);
                const assignmentDateStr = assignment ? format(assignment.FechaAsignacion, 'yyyy-MM-dd') : '9999-12-31';

                // Skip classes before assignment unless they explicitly have an in-vivo record
                if (!hasAttendanceRecord && !hasRecoveryRecord && cls._normalizedDate < assignmentDateStr) {
                    return;
                }

                totalClasses++;

                let recovered = false;

                if (!hasAttendanceRecord) {
                    // Fallback to legacy
                    attended = attendanceSnap.docs.some(d => {
                        const data = d.data();
                        if (data.ID_Clase && data.ID_Clase === cls.id) return true;
                        
                        let entryDateStr = '';
                        if (data.Timestamp_Entrada instanceof Timestamp) {
                            entryDateStr = format(data.Timestamp_Entrada.toDate(), 'yyyy-MM-dd');
                        } else if (typeof data.Timestamp_Entrada === 'string') {
                            entryDateStr = data.Timestamp_Entrada.split('T')[0];
                        }
                        return entryDateStr === cls._normalizedDate && data.ID_Curso === cls.ID_Curso;
                    });
                    missed = !attended;
                }

                if (hasRecoveryRecord) {
                    recovered = true;
                } else {
                    // Fallback to legacy
                    recovered = recoveryDates.includes(cls._normalizedDate);
                }

                const course = courses[cls.ID_Curso];
                const className = course ? [course.Disciplina, course.Estilo].filter(Boolean).join(' ') : 'Clase';
                const location = course?.Ubicacion || 'Sala Principal';

                let status: 'present' | 'absent' | 'recovered' = 'present';
                if (recovered) {
                    status = 'recovered';
                    recoveryCount++;
                } else if (missed) {
                    status = 'absent';
                    rawAbsences++;
                } else if (attended) {
                    status = 'present';
                }

                const entry: HistoryEntry = {
                    status,
                    className,
                    time: cls.HoraInicio,
                    location
                };

                const existing = historyMap.get(cls._normalizedDate) || [];
                historyMap.set(cls._normalizedDate, [...existing, entry]);
            });

            // 2. Next Class and Upcoming Classes Calculation
            const startOfCurrentWeek = format(startOfWeek(today, { weekStartsOn: 1 }), 'yyyy-MM-dd');
            const endOfCurrentWeek = format(endOfWeek(today, { weekStartsOn: 1 }), 'yyyy-MM-dd');

            const futureClasses = allClasses
                .filter(c => {
                    if (c.Anulacion === true || c.Anulacion === 'true') return false;
                    if (c._normalizedDate < todayStr) return false;
                    if (c._normalizedDate === todayStr && c._normalizedTime < currentTimeStr) return false;
                    return true;
                })
                .sort((a, b) => {
                    if (a._normalizedDate !== b._normalizedDate) return a._normalizedDate.localeCompare(b._normalizedDate);
                    return a._normalizedTime.localeCompare(b._normalizedTime);
                });

            const weekClasses = allClasses
                .filter(c => {
                    if (c.Anulacion === true || c.Anulacion === 'true') return false;
                    if (c._normalizedDate < startOfCurrentWeek || c._normalizedDate > endOfCurrentWeek) return false;
                    return true;
                })
                .sort((a, b) => {
                    if (a._normalizedDate !== b._normalizedDate) return a._normalizedDate.localeCompare(b._normalizedDate);
                    return a._normalizedTime.localeCompare(b._normalizedTime);
                });

            const processClass = (next: any): NextClass | null => {
                const course = courses[next.ID_Curso];
                
                if (course && next._normalizedDate && next._normalizedTime) {
                    const [year, month, day] = next._normalizedDate.split('-').map(Number);
                    const [startH, startM] = next._normalizedTime.split(':').map(Number);
                    
                    let endH = 21, endM = 30;
                    if (next.HoraFin && typeof next.HoraFin === 'string') {
                        const parts = next.HoraFin.split(':');
                        if (parts.length === 2) {
                            [endH, endM] = parts.map(Number);
                        }
                    }
                    
                    let attendanceStatus: 'present' | 'absent' | 'none' = 'none';
                    const reg = next.registro_en_vivo;
                    if (reg) {
                        if (Array.isArray(reg)) {
                            const found = reg.find((r: any) => r.idAlumno === user.ID_Alumno);
                            if (found) {
                                attendanceStatus = found.Asistencia === true ? 'present' : 'absent';
                            }
                        } else if (typeof reg === 'object') {
                            if (Object.prototype.hasOwnProperty.call(reg, user.ID_Alumno)) {
                                attendanceStatus = reg[user.ID_Alumno] === true ? 'present' : 'absent';
                            }
                        }
                    }

                    const recoReg = next.registro_recuperaciones_en_vivo;
                    if (recoReg && attendanceStatus === 'none') {
                        if (Array.isArray(recoReg)) {
                            const found = recoReg.some((r: any) => r.idAlumno === user.ID_Alumno && r.Asistencia === true);
                            if (found) {
                                attendanceStatus = 'present';
                            }
                        } else if (typeof recoReg === 'object') {
                            if (recoReg[user.ID_Alumno] === true) {
                                attendanceStatus = 'present';
                            }
                        }
                    }

                    if (attendanceStatus === 'none' && attendanceSnap.docs.some(d => d.data().ID_Clase === next.id)) {
                        attendanceStatus = 'present';
                    }

                    const attendanceMarked = attendanceStatus === 'present';

                    const cursosInscritosArr = getCursosInscritosArray(user.cursosInscritos);
                    const inscrito = cursosInscritosArr.find((c: any) => (c.id || c.ID_Curso) === next.ID_Curso);
                    const rol = inscrito?.rol || inscrito?.Rol || null;
                    const estadoAsignacion = inscrito?.EstadoAsignacion || inscrito?.estadoAsignacion || null;

                    return {
                        id: next.id,
                        courseName: [course.Disciplina, course.Estilo].filter(Boolean).join(' '),
                        level: [course.Nivel, course.Subnivel].filter(Boolean).join(' '),
                        startTime: new Date(year, month - 1, day, startH, startM),
                        endTime: new Date(year, month - 1, day, endH, endM),
                        location: course.Ubicacion || 'Sala Principal',
                        attendanceMarked: attendanceMarked,
                        rol: rol,
                        asistenciaCerrada: next.AsistenciaCerrada === true || next.AsistenciaCerrada === 'true',
                        attendanceStatus: attendanceStatus,
                        estadoAsignacion: estadoAsignacion
                    };
                }
                return null;
            };

            if (futureClasses.length > 0) {
                nextClassData = processClass(futureClasses[0]);
            }

            const upcomingClassesData = weekClasses.map(processClass).filter(Boolean) as NextClass[];
            setUpcomingClasses(upcomingClassesData);
        }

        // Apply "Leaky Bucket" / Recovery Logic
        // Prefer metricasAsistencia if defined on user document as per "consultas rápidas"
        const metricas = user.metricasAsistencia || user.metricas_asistencia || {};
        
        const finalAbsences = metricas.faltasMes ?? metricas.faltas ?? metricas.falta ?? Math.max(0, rawAbsences - recoveryCount);
        const maxAbsences = 10;
        
        const activeTicketsCount = user.bolsaRecuperaciones?.filter((t: any) => 
            t.usado === false && (t.caducidad ? safeToDate(t.caducidad) >= today : true)
        ).length ?? 0;
        
        const hp = metricas.saldoActual ?? metricas.saldo ?? metricas.saldoRecuperaciones ?? activeTicketsCount;

        setNextClass(nextClassData);
        setStats({
          totalAbsences: finalAbsences,
          maxAbsences: maxAbsences,
          recoveryBalance: hp,
          attendanceRate: totalClasses > 0 ? Math.round(((totalClasses - finalAbsences) / totalClasses) * 100) : 100,
          history: Array.from(historyMap.entries()).map(([d, entries]) => ({ 
              date: new Date(d), 
              entries: entries
          }))
        });

      } catch (error) {
        console.error("Error calculating attendance:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [user]);

  return { stats, nextClass, upcomingClasses, events, loading };
}
