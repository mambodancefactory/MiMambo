import { useState, useEffect } from 'react';
import { collection, query, where, getDocs, doc, getDoc, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { startOfMonth, subMonths, format, startOfDay, isBefore, parseISO, startOfQuarter, endOfQuarter } from 'date-fns';

interface AttendanceResult {
  saldoActual: number;
  faltasMes: number;
  recuperacionesMes: number;
  // Quarterly Stats
  asistenciasTrimestre: number;
  faltasTrimestre: number;
  recuperacionesTrimestre: number;
  currentQuarterLabel: string; // e.g., "Enero - Marzo"
  isLoading: boolean;
  error: string | null;
}

export function useCalculoAsistenciaEnVivo(idAlumno: string | undefined): AttendanceResult {
  const [result, setResult] = useState<AttendanceResult>({
    saldoActual: 0,
    faltasMes: 0,
    recuperacionesMes: 0,
    asistenciasTrimestre: 0,
    faltasTrimestre: 0,
    recuperacionesTrimestre: 0,
    currentQuarterLabel: '',
    isLoading: true,
    error: null,
  });

  useEffect(() => {
    if (!idAlumno) {
      setResult(prev => ({ ...prev, isLoading: false }));
      return;
    }

    const calculateAttendance = async () => {
      try {
        setResult(prev => ({ ...prev, isLoading: true, error: null }));

        const today = startOfDay(new Date());
        const startOfCurrentMonth = startOfMonth(today);
        const startOfCurrentQuarter = startOfQuarter(today);
        const endOfCurrentQuarter = endOfQuarter(today);
        
        const prevMonth = subMonths(today, 1);
        const prevMonthId = format(prevMonth, 'yyyy-MM');
        
        const todayStr = format(today, 'yyyy-MM-dd');
        const startMonthStr = format(startOfCurrentMonth, 'yyyy-MM-dd');
        const startQuarterStr = format(startOfCurrentQuarter, 'yyyy-MM-dd');

        // Quarter Label
        const startMonthName = format(startOfCurrentQuarter, 'MMMM');
        const endMonthName = format(endOfCurrentQuarter, 'MMMM');
        const quarterLabel = `${startMonthName} - ${endMonthName}`;

        // 1. Obtener Saldo Histórico (del mes anterior para el cálculo del saldo actual)
        let saldoHistorico = 0;
        try {
          const historyDocRef = doc(db, 'Log_Asistencia_Calculada', `${idAlumno}_${prevMonthId}`);
          const historySnap = await getDoc(historyDocRef);
          if (historySnap.exists()) {
            saldoHistorico = historySnap.data().Saldo_Faltas_Historico || 0;
          }
        } catch (err) {
          console.warn('Error fetching historical balance:', err);
        }

        // 2. Obtener Configuración Global (Kickoff)
        let fechaKickoff: Date | null = null;
        try {
          const configDocRef = doc(db, 'Configuracion_Global', 'Parametros');
          const configSnap = await getDoc(configDocRef);
          if (configSnap.exists()) {
            const data = configSnap.data();
            if (data.Fecha_Kickoff_Sistema) {
               if (data.Fecha_Kickoff_Sistema instanceof Timestamp) {
                   fechaKickoff = data.Fecha_Kickoff_Sistema.toDate();
               } else if (typeof data.Fecha_Kickoff_Sistema === 'string') {
                   fechaKickoff = parseISO(data.Fecha_Kickoff_Sistema);
               }
            }
          }
        } catch (err) {
            console.warn('Error fetching kickoff date:', err);
        }

        // 3. Obtener Asignaciones de Cursos
        const assignmentsQ = query(
          collection(db, 'Cursos_Asignacion_Alumnos'),
          where('ID_Alumno', '==', idAlumno)
        );
        const assignmentsSnap = await getDocs(assignmentsQ);
        const assignments = assignmentsSnap.docs.map(d => {
            const data = d.data();
            let date = new Date(0); 
            if (data.FechaAsignacion) {
                if (data.FechaAsignacion instanceof Timestamp) {
                    date = data.FechaAsignacion.toDate();
                } else if (typeof data.FechaAsignacion === 'string') {
                     let dStr = data.FechaAsignacion;
                     if (dStr.includes('/')) {
                         const parts = dStr.split(/[/\s:]/); 
                         if (parts.length >= 3) {
                             const day = parseInt(parts[0], 10);
                             const month = parseInt(parts[1], 10) - 1;
                             const year = parseInt(parts[2], 10);
                             date = new Date(year, month, day);
                         }
                     } else {
                         date = parseISO(dStr);
                     }
                }
            }
            return {
                ID_Curso: data.ID_Curso,
                FechaAsignacion: startOfDay(date)
            };
        });
        
        const courseIds = assignments.map(a => a.ID_Curso);

        // 4. Obtener Días Festivos
        const holidaysSnap = await getDocs(collection(db, 'Dias Festivos'));
        const holidays = new Set<string>();
        holidaysSnap.docs.forEach(d => {
            const data = d.data();
            let dateStr = '';
            if (data.FechaFestivo instanceof Timestamp) {
                dateStr = format(data.FechaFestivo.toDate(), 'yyyy-MM-dd');
            } else if (typeof data.FechaFestivo === 'string') {
                dateStr = data.FechaFestivo.split('T')[0];
            }
            if (dateStr) holidays.add(dateStr);
        });

        // 5. Obtener Clases (del TRIMESTRE actual hasta hoy)
        let classes: any[] = [];
        if (courseIds.length > 0) {
            const classesQ = query(
                collection(db, 'Clases'),
                where('ID_Curso', 'in', courseIds)
            );
            const classesSnap = await getDocs(classesQ);
            
            classes = classesSnap.docs.map(d => {
                const data = d.data();
                let dateStr = '';
                if (data.FechaClase instanceof Timestamp) {
                    dateStr = format(data.FechaClase.toDate(), 'yyyy-MM-dd');
                } else if (typeof data.FechaClase === 'string') {
                    dateStr = data.FechaClase;
                }
                
                if (dateStr.includes('/')) dateStr = dateStr.replace(/\//g, '-');
                if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
                     const parts = dateStr.split('-');
                     if (parts.length === 3 && parts[2].length === 4) {
                         dateStr = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
                     }
                }

                return {
                    id: d.id,
                    ID_Curso: data.ID_Curso,
                    dateStr: dateStr,
                    Anulacion: data.Anulacion
                };
            }).filter(c => {
                if (c.Anulacion === true || c.Anulacion === 'true') return false;
                if (!c.dateStr) return false;
                // Filter range: StartOfQuarter <= Date <= Today
                return c.dateStr >= startQuarterStr && c.dateStr <= todayStr;
            });
        }

        // 6. Obtener Asistencia (Clases Regulares)
        const attendanceQ = query(
            collection(db, 'Asistencia_Clases_Regulares'),
            where('ID_Alumno', '==', idAlumno)
        );
        const attendanceSnap = await getDocs(attendanceQ);
        const attendanceSet = new Set<string>(); 
        let asistenciasTrimestre = 0;
        
        attendanceSnap.docs.forEach(d => {
            const data = d.data();
            if (data.ID_Clase) attendanceSet.add(data.ID_Clase);
            
            // Count for quarter stats
            // We need the date of the attendance to filter by quarter
            let dateStr = '';
            if (data.Timestamp_Entrada instanceof Timestamp) {
                dateStr = format(data.Timestamp_Entrada.toDate(), 'yyyy-MM-dd');
            } else if (typeof data.Timestamp_Entrada === 'string') {
                 if (data.Timestamp_Entrada.match(/^\d{4}-\d{2}-\d{2}/)) {
                     dateStr = data.Timestamp_Entrada.substring(0, 10);
                 }
            }
            
            if (dateStr && dateStr >= startQuarterStr && dateStr <= todayStr) {
                asistenciasTrimestre++;
            }
        });

        // 7. Obtener Recuperaciones (del TRIMESTRE actual)
        const recoveriesQ = query(
            collection(db, 'Asistencia_Recuperaciones'),
            where('ID_Alumno', '==', idAlumno)
        );
        const recoveriesSnap = await getDocs(recoveriesQ);
        
        let recuperacionesMes = 0;
        let recuperacionesTrimestre = 0;
        
        recoveriesSnap.docs.forEach(d => {
            const data = d.data();
            let dateStr = '';
            if (data.Timestamp_Entrada instanceof Timestamp) {
                dateStr = format(data.Timestamp_Entrada.toDate(), 'yyyy-MM-dd');
            } else if (typeof data.Timestamp_Entrada === 'string') {
                 if (data.Timestamp_Entrada.match(/^\d{4}-\d{2}-\d{2}/)) {
                     dateStr = data.Timestamp_Entrada.substring(0, 10);
                 }
            }
            
            if (dateStr) {
                // For Balance (Current Month)
                if (dateStr >= startMonthStr && dateStr <= todayStr) {
                    recuperacionesMes++;
                }
                // For Stats (Current Quarter)
                if (dateStr >= startQuarterStr && dateStr <= todayStr) {
                    recuperacionesTrimestre++;
                }
            }
        });

        // 8. Cruce de Datos (Cálculo de Faltas)
        let faltasMes = 0;
        let faltasTrimestre = 0;

        for (const cls of classes) {
            // a) Clase >= FechaAsignacion
            const assignment = assignments.find(a => a.ID_Curso === cls.ID_Curso);
            if (!assignment) continue; 
            
            const classDate = parseISO(cls.dateStr);
            if (isBefore(classDate, assignment.FechaAsignacion)) continue;

            // b) Clase >= Fecha_Kickoff_Sistema
            if (fechaKickoff && isBefore(classDate, startOfDay(fechaKickoff))) continue;

            // c) No es festivo
            if (holidays.has(cls.dateStr)) continue;

            // d) No hay asistencia
            if (attendanceSet.has(cls.id)) continue;

            // If we are here, it's an absence
            
            // Check if it belongs to current month (for Balance)
            if (cls.dateStr >= startMonthStr && cls.dateStr <= todayStr) {
                faltasMes++;
            }
            
            // Check if it belongs to current quarter (for Stats)
            // (Already filtered by query, but double check range)
            if (cls.dateStr >= startQuarterStr && cls.dateStr <= todayStr) {
                faltasTrimestre++;
            }
        }

        // 9. Saldo Final (Solo afecta el mes actual + histórico)
        const rawBalance = saldoHistorico + faltasMes - recuperacionesMes;
        const saldoActual = Math.min(10, Math.max(0, rawBalance));

        setResult({
            saldoActual,
            faltasMes,
            recuperacionesMes,
            asistenciasTrimestre,
            faltasTrimestre,
            recuperacionesTrimestre,
            currentQuarterLabel: quarterLabel,
            isLoading: false,
            error: null
        });

      } catch (err: any) {
        console.error('Error in useCalculoAsistenciaEnVivo:', err);
        setResult(prev => ({ ...prev, isLoading: false, error: err.message || 'Unknown error' }));
      }
    };

    calculateAttendance();
  }, [idAlumno]);

  return result;
}
