import { useState, useEffect } from 'react';
import { collection, query, where, getDocs, Timestamp, orderBy, limit } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/context/AuthContext';
import { startOfDay, isSameDay, parseISO, getDay, addDays, setHours, setMinutes, isAfter, format } from 'date-fns';
import { es } from 'date-fns/locale';

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

interface NextClass {
  id: string;
  courseName: string;
  level: string;
  startTime: Date;
  endTime: Date;
  location: string;
  attendanceMarked: boolean;
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
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    const fetchData = async () => {
      try {
        // 1. Fetch Assignments
        const assignmentsQ = query(
          collection(db, 'Cursos_Asignacion_Alumnos'),
          where('ID_Alumno', '==', user.ID_Alumno)
        );
        const assignmentsSnap = await getDocs(assignmentsQ);
        const assignments = assignmentsSnap.docs.map(d => d.data());
        const courseIds = assignments.map(a => a.ID_Curso);

        // 2. Fetch Courses details
        let courses: Record<string, any> = {};
        if (courseIds.length > 0) {
          const coursesQ = query(collection(db, 'Cursos'), where('ID_Curso', 'in', courseIds));
          const coursesSnap = await getDocs(coursesQ);
          courses = coursesSnap.docs.reduce((acc, doc) => {
            acc[doc.data().ID_Curso] = doc.data();
            return acc;
          }, {} as Record<string, any>);
        }

        // 3. Fetch Holidays
        const holidaysSnap = await getDocs(collection(db, 'Dias Festivos'));
        const holidays = holidaysSnap.docs.map(d => {
            const data = d.data();
            // Handle ISO string "2025-01-01T08:00:00.000Z"
            if (typeof data.FechaFestivo === 'string') {
                return data.FechaFestivo.split('T')[0];
            }
            return '';
        }).filter(Boolean);

        // 4. Fetch Attendance Records (Presents)
        const attendanceQ = query(
          collection(db, 'Asistencia_Clases_Regulares'),
          where('ID_Alumno', '==', user.ID_Alumno)
        );
        const attendanceSnap = await getDocs(attendanceQ);
        
        // 5. Fetch Recoveries
        const recoveriesQ = query(
          collection(db, 'Asistencia_Recuperaciones'),
          where('ID_Alumno', '==', user.ID_Alumno)
        );
        const recoveriesSnap = await getDocs(recoveriesQ);
        const recoveryCount = recoveriesSnap.size;
        
        // Store recovery dates
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
                    // Handle YYYY-MM-DD
                    let dateStr = data.FechaInicioEvento;
                    if (dateStr.includes('/')) dateStr = dateStr.replace(/\//g, '-');
                    
                    // Basic YYYY-MM-DD check
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
        // DATE LIMIT: Start of the current season (September 1, 2025)
        // This prevents calculating absences for previous years
        const SEASON_START = new Date('2025-09-01');
        
        let totalClasses = 0;
        let rawAbsences = 0;
        const historyMap = new Map<string, HistoryEntry[]>();
        const today = startOfDay(new Date());
        const now = new Date();
        const todayStr = format(now, 'yyyy-MM-dd');
        const currentTimeStr = format(now, 'HH:mm');

        // Fetch ALL classes for enrolled courses
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

                // Normalize to YYYY-MM-DD
                if (dateStr.includes('/')) dateStr = dateStr.replace(/\//g, '-');
                
                // Ensure YYYY-MM-DD format
                if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
                     // Try to fix DD-MM-YYYY if needed, or just fail safely
                     const parts = dateStr.split('-');
                     if (parts.length === 3) {
                         // If year is last (DD-MM-YYYY)
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
                
                // Filter out classes before the season start
                if (c._normalizedDate < format(SEASON_START, 'yyyy-MM-dd')) return false;

                if (c._normalizedDate > todayStr) return false;
                if (c._normalizedDate === todayStr && c._normalizedTime > currentTimeStr) return false;
                return true;
            });

            pastClasses.forEach(cls => {
                // Check if student was enrolled at this time
                // (Simplified: assuming enrolled for all past classes of the course)
                
                if (holidays.includes(cls._normalizedDate)) {
                    historyMap.set(cls._normalizedDate, [{ status: 'holiday' }]);
                    return;
                }

                totalClasses++;

                // Check attendance
                const attended = attendanceSnap.docs.some(d => {
                    const data = d.data();
                    
                    // 1. Try ID Match (Exact)
                    if (data.ID_Clase && data.ID_Clase === cls.id) return true;
                    
                    // 2. Try Date + Course Match (Fallback)
                    let entryDateStr = '';
                    if (data.Timestamp_Entrada instanceof Timestamp) {
                        entryDateStr = format(data.Timestamp_Entrada.toDate(), 'yyyy-MM-dd');
                    } else if (typeof data.Timestamp_Entrada === 'string') {
                        // Handle "2026-02-03"
                        entryDateStr = data.Timestamp_Entrada;
                        if (entryDateStr.includes('/')) entryDateStr = entryDateStr.replace(/\//g, '-');
                    }

                    return entryDateStr === cls._normalizedDate && data.ID_Curso === cls.ID_Curso;
                });

                const course = courses[cls.ID_Curso];
                const className = course ? [course.Disciplina, course.Estilo].filter(Boolean).join(' ') : 'Clase';
                const location = course?.Ubicacion || 'Sala Principal';

                const entry: HistoryEntry = attended ? { 
                    status: 'present',
                    className,
                    time: cls.HoraInicio,
                    location
                } : { 
                    status: 'absent',
                    className,
                    time: cls.HoraInicio,
                    location
                };

                if (!attended) rawAbsences++;

                const existing = historyMap.get(cls._normalizedDate) || [];
                historyMap.set(cls._normalizedDate, [...existing, entry]);
            });

            // 2. Next Class Calculation
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

            if (futureClasses.length > 0) {
                const next = futureClasses[0];
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
                    
                    const attendanceMarked = attendanceSnap.docs.some(d => d.data().ID_Clase === next.id);

                    nextClassData = {
                        id: next.id,
                        courseName: [course.Disciplina, course.Estilo].filter(Boolean).join(' '),
                        level: [course.Modalidad, [course.Nivel, course.Subnivel].filter(Boolean).join(' - ')].filter(Boolean).join(' • '),
                        startTime: new Date(year, month - 1, day, startH, startM),
                        endTime: new Date(year, month - 1, day, endH, endM),
                        location: course.Ubicacion || 'Sala Principal',
                        attendanceMarked: attendanceMarked
                    };
                }
            }
        }

        // 3. Add Recoveries to History
        recoveryDates.forEach(date => {
            const existing = historyMap.get(date) || [];
            const hasPresence = existing.some(e => e.status === 'present');
            
            if (!hasPresence) {
                const recoveryEntry: HistoryEntry = { 
                    status: 'recovered',
                    className: existing[0]?.className || 'Clase Recuperada',
                    time: existing[0]?.time,
                    location: existing[0]?.location
                };
                historyMap.set(date, [...existing, recoveryEntry]);
            }
        });

        // Apply "Leaky Bucket" / Recovery Logic
        const netAbsences = Math.max(0, rawAbsences - recoveryCount);
        const maxAbsences = 10;
        const hp = Math.max(0, maxAbsences - netAbsences);

        setNextClass(nextClassData);
        setStats({
          totalAbsences: netAbsences,
          maxAbsences: maxAbsences,
          recoveryBalance: hp,
          attendanceRate: totalClasses > 0 ? Math.round(((totalClasses - netAbsences) / totalClasses) * 100) : 100,
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

  return { stats, nextClass, events, loading };
}
