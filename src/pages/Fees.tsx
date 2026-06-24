import { useState, useEffect } from 'react';
import { GlassCard } from '@/components/GlassCard';
import { CreditCard, Receipt, History, Download, AlertCircle, Loader2, CheckCircle, Star, Calendar, ChevronDown, ChevronUp } from 'lucide-react';
import { Header } from '@/components/Header';
import { useAuth } from '@/context/AuthContext';
import { collection, query, where, getDocs, orderBy, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { format, parseISO, startOfDay, isBefore } from 'date-fns';
import { es } from 'date-fns/locale';
import { motion, AnimatePresence } from 'motion/react';
import { safeToDate } from '@/hooks/useRecovery';

interface PagoCuota {
  id: string;
  Cuota: number;
  Estado: string;
  FechaDePago: string; // Start of period
  FechaEstadoPagado?: string; // Actual payment date
  FechaProximoPago?: string;
  FormaPago?: string;
  ID_Alumno: string;
  ID_Combo_Precio: string;
  ID_PagoCuota: string;
  ID_Recibo: string;
  PDF?: string;
  TipoCuota: string;
  Total: number;
}

interface Precio {
  id: string;
  Categoria: string;
  ID_Combo_Precio: string;
  NumCursos: number;
  Precio_Combo_Cursos: number;
}

interface Course {
    ID_Curso: string;
    NombreCurso: string;
    Disciplina: string;
    Nivel: string;
    HoraInicio: string;
    DiaSemana: number;
    FechaFinCurso?: string | Timestamp;
}

export default function Fees() {
  const { user } = useAuth();
  const [fees, setFees] = useState<PagoCuota[]>([]);
  const [prices, setPrices] = useState<Record<string, Precio>>({});
  const [loading, setLoading] = useState(true);
  const [pendingBalance, setPendingBalance] = useState(0);
  const [enrolledCourses, setEnrolledCourses] = useState<Course[]>([]);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    if (!user) return;

    const fetchData = async () => {
      try {
        setLoading(true);

        // 1. Fetch ListadoPrecios
        const pricesSnap = await getDocs(collection(db, 'ListadoPrecios'));
        const pricesMap: Record<string, Precio> = {};
        pricesSnap.docs.forEach(doc => {
          const data = doc.data() as Precio;
          pricesMap[data.ID_Combo_Precio] = { ...data, id: doc.id };
        });
        setPrices(pricesMap);

        // 2. Fetch PagosCuotas
        const feesQ = query(
          collection(db, 'PagosCuotas'),
          where('ID_Alumno', '==', user.ID_Alumno)
        );
        
        const feesSnap = await getDocs(feesQ);
        const feesList = feesSnap.docs.map(doc => ({ 
          id: doc.id, 
          ...doc.data() 
        } as PagoCuota));

        // Sort: Newest first
        feesList.sort((a, b) => {
            const getMs = (val: any) => {
                if (!val) return 0;
                if (typeof val === 'object' && val !== null) {
                    if ('toMillis' in val && typeof val.toMillis === 'function') return val.toMillis();
                    if ('seconds' in val) return val.seconds * 1000;
                }
                return new Date(String(val)).getTime() || 0;
            };
            return getMs(b.FechaDePago) - getMs(a.FechaDePago);
        });

        setFees(feesList);

        // Calculate pending balance
        const pending = feesList
          .filter(fee => fee.Estado === 'Pendiente')
          .reduce((acc, fee) => acc + (fee.Total || fee.Cuota || 0), 0);
        
        setPendingBalance(pending);

        // 3. Fetch Enrolled Courses with full details
        const coursesSnap = await getDocs(collection(db, 'Cursos'));
        const courseMap: Record<string, Course> = {};
        coursesSnap.docs.forEach(doc => {
            const data = doc.data() as Course;
            courseMap[doc.id] = { ...data, ID_Curso: doc.id };
        });

        // Get user assignments
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
        
        const todayDate = startOfDay(new Date());

        const userCourses = courseIds
            .map(id => courseMap[id])
            .filter(Boolean)
            .filter(course => {
                // Filter for active courses only
                if (!course.FechaFinCurso) return true;
                
                const end = safeToDate(course.FechaFinCurso);
                
                return !isBefore(startOfDay(end), todayDate); 
            });
        
        setEnrolledCourses(userCourses);

      } catch (error) {
        console.error("Error fetching fees:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [user]);

  const getFeeLabel = (fee: PagoCuota) => {
    const priceInfo = prices[fee.ID_Combo_Precio];
    if (priceInfo) {
        return priceInfo.Categoria === 'Mantenimiento' 
            ? 'Cuota de Mantenimiento' 
            : `Mensualidad (${priceInfo.ID_Combo_Precio})`;
    }
    return fee.TipoCuota || 'Cuota Mensual';
  };

  const getPeriodLabel = (dateInput: any) => {
    if (!dateInput) return 'Periodo desconocido';
    try {
        let date: Date;
        if (typeof dateInput === 'object' && dateInput !== null) {
            if ('toDate' in dateInput && typeof dateInput.toDate === 'function') {
                date = dateInput.toDate();
            } else if ('seconds' in dateInput) {
                date = new Date(dateInput.seconds * 1000);
            } else {
                date = new Date(String(dateInput));
            }
        } else {
            const dateString = String(dateInput);
            date = new Date(dateString);
            if (isNaN(date.getTime()) && dateString.includes('/')) {
                 const parts = dateString.split('/');
                 if (parts.length === 3) {
                     date = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
                 }
            }
        }
        if (isNaN(date.getTime())) return String(dateInput);
        return format(date, 'MMMM yyyy', { locale: es });
    } catch (e) {
        return String(dateInput);
    }
  };

  const safeFormatDate = (dateInput?: any) => {
    if (!dateInput) return null;
    try {
        let date: Date;
        if (typeof dateInput === 'object' && dateInput !== null) {
            if ('toDate' in dateInput && typeof dateInput.toDate === 'function') {
                date = dateInput.toDate();
            } else if ('seconds' in dateInput) {
                date = new Date(dateInput.seconds * 1000);
            } else {
                date = new Date(String(dateInput));
            }
        } else {
            const dateString = String(dateInput);
            date = new Date(dateString);
            if (isNaN(date.getTime()) && dateString.includes('/')) {
                 const parts = dateString.split('/');
                 if (parts.length === 3) {
                     date = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
                 }
            }
        }
        if (isNaN(date.getTime())) return String(dateInput);
        return format(date, 'd MMM yyyy', { locale: es });
    } catch(e) {
        return String(dateInput);
    }
  };

  const currentFee = fees.length > 0 ? fees[0] : null;
  const isCurrentPaid = currentFee?.Estado === 'Pagado';

  const getDayName = (day: number) => {
      const days = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
      return days[day - 1] || '';
  };

  if (loading) {
    return (
        <div className="flex justify-center items-center h-screen pb-24">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        </div>
    );
  }

  return (
    <div className="space-y-6 pt-4 pb-24">
      <Header title="Mis Cuotas" />
      
      {/* Current Fee Card - Prominent & Detailed */}
      {currentFee ? (
        <div className={`relative rounded-[2.5rem] p-8 shadow-2xl overflow-hidden transition-all duration-500 min-h-[50vh] flex flex-col justify-between ${
            isCurrentPaid 
                ? 'bg-white border-2 border-yellow-400 shadow-[0_20px_50px_rgba(250,204,21,0.15)]' 
                : 'bg-gradient-to-br from-red-400 to-red-500 text-white border-none shadow-[0_20px_50px_rgba(239,68,68,0.2)]'
        }`}>
            {/* Background Decoration */}
            {isCurrentPaid && (
                <div className="absolute top-0 right-0 -mt-10 -mr-10 w-40 h-40 bg-yellow-100 rounded-full blur-3xl opacity-40 pointer-events-none"></div>
            )}

            <div className="relative z-10 flex flex-col h-full">
                <div className="flex justify-between items-start mb-8">
                    <div>
                        <p className={`text-xs font-black uppercase tracking-[0.2em] mb-2 ${isCurrentPaid ? 'text-yellow-600' : 'text-red-100'}`}>
                            {getPeriodLabel(currentFee.FechaDePago)}
                        </p>
                        <h2 className={`text-5xl font-black tracking-tighter ${isCurrentPaid ? 'text-[#2e2f43]' : 'text-white'}`}>
                            {(currentFee.Total ?? currentFee.Cuota ?? 0).toFixed(2)}<span className="text-2xl ml-1">€</span>
                        </h2>
                    </div>
                    <div className={`p-4 rounded-2xl shadow-lg ${isCurrentPaid ? 'bg-yellow-100 text-yellow-600' : 'bg-white/20 text-white backdrop-blur-md'}`}>
                        {isCurrentPaid ? <Star size={32} fill="currentColor" /> : <AlertCircle size={32} />}
                    </div>
                </div>

                <div className="flex-grow space-y-6">
                    <div>
                        <p className={`text-[10px] uppercase font-black tracking-[0.15em] mb-2 ${isCurrentPaid ? 'text-gray-400' : 'text-red-100/60'}`}>
                            Concepto de Pago
                        </p>
                        <p className={`text-xl font-bold ${isCurrentPaid ? 'text-[#2e2f43]' : 'text-white'}`}>
                            {getFeeLabel(currentFee)}
                        </p>
                    </div>
                    
                    {enrolledCourses.length > 0 && (
                        <div className="space-y-4">
                            <button 
                                onClick={() => setShowDetails(!showDetails)}
                                className={`flex items-center gap-2 text-[10px] uppercase font-black tracking-[0.15em] transition-all hover:opacity-70 ${isCurrentPaid ? 'text-yellow-600' : 'text-white'}`}
                            >
                                {showDetails ? 'Ocultar detalles' : 'Ver detalles'}
                                {showDetails ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                            </button>

                            <AnimatePresence>
                                {showDetails && (
                                    <motion.div 
                                        initial={{ height: 0, opacity: 0 }}
                                        animate={{ height: 'auto', opacity: 1 }}
                                        exit={{ height: 0, opacity: 0 }}
                                        className="overflow-hidden"
                                    >
                                        <div className="grid grid-cols-1 gap-3 pt-2">
                                            {enrolledCourses.map((course, index) => (
                                                <div 
                                                    key={index} 
                                                    className={`flex items-center justify-between p-4 rounded-2xl shadow-sm transition-all ${
                                                        isCurrentPaid 
                                                            ? 'bg-gray-50 border border-gray-100 text-[#2e2f43]' 
                                                            : 'bg-white/10 border border-white/20 text-white backdrop-blur-sm'
                                                    }`}
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isCurrentPaid ? 'bg-white' : 'bg-white/20'}`}>
                                                            <Calendar size={18} className={isCurrentPaid ? 'text-yellow-600' : 'text-white'} />
                                                        </div>
                                                        <div>
                                                            <p className="font-black text-sm">{course.NombreCurso}</p>
                                                            <p className={`text-[10px] font-bold uppercase tracking-wider opacity-60`}>
                                                                {course.Disciplina} • {course.Nivel}
                                                            </p>
                                                        </div>
                                                    </div>
                                                    <div className="text-right">
                                                        <p className="font-black text-xs">{getDayName(course.DiaSemana)}</p>
                                                        <p className="text-[10px] font-bold opacity-60">{course.HoraInicio}</p>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    )}
                </div>

                <div className={`mt-8 pt-6 border-t flex items-center justify-between ${isCurrentPaid ? 'border-gray-100' : 'border-white/10'}`}>
                    <div className={`flex items-center gap-2 text-xs font-black uppercase tracking-widest ${isCurrentPaid ? 'text-green-600' : 'text-white'}`}>
                        {isCurrentPaid ? (
                            <>
                                <CheckCircle size={16} />
                                <span>Pagado el {safeFormatDate(currentFee.FechaEstadoPagado) || '---'}</span>
                            </>
                        ) : (
                            <>
                                <AlertCircle size={16} />
                                <span>Pendiente de Pago</span>
                            </>
                        )}
                    </div>
                    <div className={`text-[10px] font-mono opacity-50 ${isCurrentPaid ? 'text-[#2e2f43]' : 'text-white'}`}>
                        ID: {currentFee.ID_PagoCuota}
                    </div>
                </div>
            </div>
        </div>
      ) : (
        <div className="p-12 bg-gray-50 rounded-[2.5rem] border-2 border-dashed border-gray-200 text-center text-gray-400 flex flex-col items-center gap-4">
            <Receipt size={48} className="opacity-20" />
            <p className="font-bold">No hay cuotas activas para este periodo</p>
        </div>
      )}

      <div className="space-y-4">
        <div className="flex justify-between items-center px-2">
            <h3 className="text-xs font-black text-[#2e2f43] uppercase tracking-[0.2em]">Cuotas Recientes</h3>
            <span className="text-[10px] font-bold text-[#2e2f43]/40 uppercase">Últimas 5</span>
        </div>
        
        {fees.length === 0 ? (
            <div className="text-center py-12 bg-white/30 rounded-3xl border border-white/60">
                <p className="text-sm text-gray-400 font-medium">No hay registros de cuotas anteriores.</p>
            </div>
        ) : (
            <div className="space-y-3">
            {fees.slice(1, 6).map((fee) => { // Skip current, show next 5
                const isPaid = fee.Estado === 'Pagado';
                const periodLabel = getPeriodLabel(fee.FechaDePago);
                const paymentDateLabel = safeFormatDate(fee.FechaEstadoPagado);

                return (
                <div key={fee.id} className="bg-white/60 backdrop-blur-xl rounded-2xl p-4 border border-white/80 shadow-sm flex justify-between items-center group hover:bg-white/80 transition-all">
                    <div className="flex items-center gap-4">
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center transition-colors ${
                            isPaid ? 'bg-[#2e2f43]/5 text-[#2e2f43]' : 'bg-red-50 text-red-500'
                        }`}>
                            {isPaid ? <Receipt size={22} /> : <AlertCircle size={22} />}
                        </div>
                        <div>
                            <h4 className="text-sm font-black text-[#2e2f43] capitalize mb-0.5">{periodLabel}</h4>
                            <p className="text-[10px] text-[#2e2f43]/60 font-bold uppercase tracking-wider">
                                {getFeeLabel(fee)}
                            </p>
                            {isPaid && paymentDateLabel && (
                                <p className="text-[9px] text-[#2e2f43] font-bold mt-1">
                                    Pagado el {paymentDateLabel}
                                </p>
                            )}
                        </div>
                    </div>
                    <div className="text-right">
                        <p className="text-base font-black text-[#2e2f43]">{(fee.Total ?? fee.Cuota ?? 0).toFixed(2)}€</p>
                        <div className="flex items-center justify-end gap-2 mt-1">
                            <span className={`text-[9px] font-black uppercase tracking-tighter ${isPaid ? 'text-[#2e2f43]' : 'text-red-500'}`}>
                                {fee.Estado}
                            </span>
                        </div>
                    </div>
                </div>
                );
            })}
            </div>
        )}
      </div>

      <button className="w-full py-5 bg-[#2e2f43]/5 rounded-2xl border border-dashed border-[#2e2f43]/10 text-[#2e2f43] text-xs font-black uppercase tracking-[0.2em] flex items-center justify-center gap-3 hover:bg-[#2e2f43]/10 transition-all">
        <History size={18} />
        Historial Completo
      </button>
    </div>
  );
}
