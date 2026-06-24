import { useState, useEffect } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/context/AuthContext';
import { isWithinInterval } from 'date-fns';
import { safeToDate } from './useRecovery';

export function useFees() {
  const { user } = useAuth();
  const [fee, setFee] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    const calculateFee = async () => {
      try {
        // 1. Fetch Assignments
        let courseIds: string[] = [];
        if (user.cursosInscritos && Array.isArray(user.cursosInscritos)) {
          courseIds = user.cursosInscritos.map((c: any) => c.id || c.ID_Curso).filter(Boolean);
        } else {
          const assignmentsQ = query(
            collection(db, 'Cursos_Asignacion_Alumnos'),
            where('ID_Alumno', '==', user.ID_Alumno)
          );
          const assignmentsSnap = await getDocs(assignmentsQ);
          courseIds = assignmentsSnap.docs.map(d => d.data().ID_Curso);
        }

        let activeCoursesCount = 0;

        if (courseIds.length > 0) {
          // 2. Fetch Courses to check dates
          const coursesQ = query(collection(db, 'Cursos'), where('ID_Curso', 'in', courseIds));
          const coursesSnap = await getDocs(coursesQ);
          
          const today = new Date();

          coursesSnap.docs.forEach(doc => {
            const data = doc.data();
            const start = safeToDate(data.FechaInicioCurso);
            const end = safeToDate(data.FechaFinCurso);

            if (isWithinInterval(today, { start, end })) {
              activeCoursesCount++;
            }
          });
        }

        // 3. Fetch Pricing
        let category = 'Cuota mensual';
        if (user.Estado === 'Inactivo') {
          category = 'Mantenimiento';
        }

        const pricingQ = query(
          collection(db, 'ListadoPrecios'),
          where('Categoria', '==', category)
        );
        
        const pricingSnap = await getDocs(pricingQ);
        let calculatedFee = 0;

        // Find matching price for number of courses
        // Assuming ListadoPrecios has entries like { NumCursos: 1, Precio_Combo_Cursos: 50 }
        const priceDoc = pricingSnap.docs.find(d => d.data().NumCursos === activeCoursesCount);
        
        if (priceDoc) {
          calculatedFee = priceDoc.data().Precio_Combo_Cursos;
        } else if (activeCoursesCount > 0) {
          // Fallback logic if exact number not found (e.g. max out)
          // For now, just take the highest available or 0
          calculatedFee = 0; 
        }

        setFee(calculatedFee);

      } catch (error) {
        console.error("Error calculating fees:", error);
      } finally {
        setLoading(false);
      }
    };

    calculateFee();
  }, [user]);

  return { fee, loading };
}
