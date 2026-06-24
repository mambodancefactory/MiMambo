import { useState, useEffect } from 'react';
import { collection, query, where, getDocs, doc, getDoc, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { startOfMonth, subMonths, format, startOfDay, isBefore, parseISO, startOfQuarter, endOfQuarter } from 'date-fns';
import { safeToDate } from './useRecovery';

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

        // 3. Obtener Asignaciones de Cursos y Datos del Alumno (con cursosInscritos y metricasAsistencia)
        const alumnoDocRef = doc(db, 'Alumnos', idAlumno);
        const alumnoSnap = await getDoc(alumnoDocRef);
        if (!alumnoSnap.exists()) {
          setResult(prev => ({ ...prev, isLoading: false, error: 'Alumno no encontrado' }));
          return;
        }
        const alumnoData = alumnoSnap.data();

        const cursosInscritos = alumnoData.cursosInscritos || [];
        const assignments = cursosInscritos.map((c: any) => {
            let date = new Date(0); 
            const fechaAsignacion = c.fechaAsignacion || c.FechaAsignacion;
            if (fechaAsignacion) {
                if (fechaAsignacion instanceof Timestamp) {
                    date = fechaAsignacion.toDate();
                } else if (typeof fechaAsignacion === 'string') {
                     let dStr = fechaAsignacion;
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
                ID_Curso: c.id || c.ID_Curso,
                FechaAsignacion: startOfDay(date)
            };
        }).filter((a: any) => a.ID_Curso);
        
        const courseIds = assignments.map((a: any) => a.ID_Curso);

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
        let computedFaltasMes = 0;
        let computedRecuperacionesMes = 0;
        let computedAsistenciasTrimestre = 0;
        let computedFaltasTrimestre = 0;
        let computedRecuperacionesTrimestre = 0;

        if (courseIds.length > 0) {
            // Firestore supports 'in' query with up to 30 courseIds
            const classesQ = query(
                collection(db, 'Clases'),
                where('ID_Curso', 'in', courseIds.slice(0, 30))
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
                    Anulacion: data.Anulacion,
                    registro_en_vivo: data.registro_en_vivo || {},
                    registro_recuperaciones_en_vivo: data.registro_recuperaciones_en_vivo || {}
                };
            }).filter(c => {
                if (c.Anulacion === true || c.Anulacion === 'true') return false;
                if (!c.dateStr) return false;
                // Filter range: StartOfQuarter <= Date <= Today
                return c.dateStr >= startQuarterStr && c.dateStr <= todayStr;
            });

            // Fallback fetches for legacy database structures
            const attendanceQ = query(
                collection(db, 'Asistencia_Clases_Regulares'),
                where('ID_Alumno', '==', idAlumno)
            );
            const attendanceSnap = await getDocs(attendanceQ);
            const attendanceSet = new Set<string>();
            attendanceSnap.docs.forEach(d => {
                const data = d.data();
                if (data.ID_Clase) attendanceSet.add(data.ID_Clase);
            });

            const recoveriesQ = query(
                collection(db, 'Asistencia_Recuperaciones'),
                where('ID_Alumno', '==', idAlumno)
            );
            const recoveriesSnap = await getDocs(recoveriesQ);
            const legacyRecoveriesSet = new Set<string>();
            recoveriesSnap.docs.forEach(d => {
                const data = d.data();
                let dateStr = '';
                if (data.Timestamp_Entrada instanceof Timestamp) {
                    dateStr = format(data.Timestamp_Entrada.toDate(), 'yyyy-MM-dd');
                } else if (typeof data.Timestamp_Entrada === 'string') {
                    dateStr = data.Timestamp_Entrada.split('T')[0];
                }
                if (dateStr) legacyRecoveriesSet.add(dateStr);
            });

            // Perform counts crossing the details
            for (const cls of classes) {
                const assignment = assignments.find((a: any) => a.ID_Curso === cls.ID_Curso);
                if (!assignment) continue; 
                
                const classDate = parseISO(cls.dateStr);
                if (isBefore(classDate, assignment.FechaAsignacion)) continue;
                if (fechaKickoff && isBefore(classDate, startOfDay(fechaKickoff))) continue;
                if (holidays.has(cls.dateStr)) continue;

                const hasAttendanceRecord = Object.prototype.hasOwnProperty.call(cls.registro_en_vivo, idAlumno);
                const hasRecoveryRecord = cls.registro_recuperaciones_en_vivo[idAlumno] === true;

                let attended = false;
                let missed = false;
                let recovered = false;

                if (hasAttendanceRecord) {
                    attended = cls.registro_en_vivo[idAlumno] === true;
                    missed = cls.registro_en_vivo[idAlumno] === false;
                } else {
                    attended = attendanceSet.has(cls.id);
                    missed = !attended;
                }

                if (hasRecoveryRecord) {
                    recovered = true;
                } else {
                    recovered = legacyRecoveriesSet.has(cls.dateStr);
                }

                if (attended) {
                    if (cls.dateStr >= startQuarterStr && cls.dateStr <= todayStr) {
                        computedAsistenciasTrimestre++;
                    }
                }
                if (missed) {
                    if (cls.dateStr >= startMonthStr && cls.dateStr <= todayStr) {
                        computedFaltasMes++;
                    }
                    if (cls.dateStr >= startQuarterStr && cls.dateStr <= todayStr) {
                        computedFaltasTrimestre++;
                    }
                }
                if (recovered) {
                    if (cls.dateStr >= startMonthStr && cls.dateStr <= todayStr) {
                        computedRecuperacionesMes++;
                    }
                    if (cls.dateStr >= startQuarterStr && cls.dateStr <= todayStr) {
                        computedRecuperacionesTrimestre++;
                    }
                }
            }
        }

        // Prioritize metricasAsistencia if defined on user document as per "consultas rápidas"
        const metricas = alumnoData.metricasAsistencia || alumnoData.metricas_asistencia || {};
        
        const activeTicketsCount = alumnoData.bolsaRecuperaciones?.filter((t: any) => 
            t.usado === false && safeToDate(t.caducidad) >= today
        ).length ?? 0;

        const saldoActual = metricas.saldoActual ?? metricas.saldo ?? metricas.saldoRecuperaciones ?? activeTicketsCount;
        const finalFaltasMes = metricas.faltasMes ?? metricas.faltas_mes ?? metricas.falta ?? computedFaltasMes;
        const finalRecuperacionesMes = metricas.recuperacionesMes ?? metricas.recuperaciones_mes ?? metricas.recupera ?? computedRecuperacionesMes;
        const finalAsistenciasTrimestre = metricas.asistenciasTrimestre ?? metricas.asistencias_trimestre ?? metricas.asistencias ?? metricas.asiste ?? computedAsistenciasTrimestre;
        const finalFaltasTrimestre = metricas.faltasTrimestre ?? metricas.faltas_trimestre ?? metricas.faltas ?? metricas.falta ?? computedFaltasTrimestre;
        const finalRecuperacionesTrimestre = metricas.recuperacionesTrimestre ?? metricas.recuperaciones_trimestre ?? metricas.recuperaciones ?? metricas.recupera ?? computedRecuperacionesTrimestre;

        setResult({
            saldoActual,
            faltasMes: finalFaltasMes,
            recuperacionesMes: finalRecuperacionesMes,
            asistenciasTrimestre: finalAsistenciasTrimestre,
            faltasTrimestre: finalFaltasTrimestre,
            recuperacionesTrimestre: finalRecuperacionesTrimestre,
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
