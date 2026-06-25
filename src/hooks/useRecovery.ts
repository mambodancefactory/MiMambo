import { doc, updateDoc, arrayUnion } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export interface RecoveryTicket {
  idAsistencia: string;
  fechaFalta: any;
  caducidad: any;
  usado: boolean;
  disciplina: string;
  modalidad: string;
  nivel: string;
}

export const safeToDate = (val: any): Date => {
  if (!val) return new Date();
  if (val instanceof Date) return val;
  if (typeof val.toDate === 'function') return val.toDate();
  if (typeof val.seconds === 'number') {
    return new Date(val.seconds * 1000 + (val.nanoseconds || 0) / 1000000);
  }
  if (typeof val === 'string' || typeof val === 'number') {
    return new Date(val);
  }
  return new Date();
};

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

export const useRecovery = () => {
  const verificarCompatibilidadRecuperacion = (ticket: any, claseDestino: any, alumnoDoc: any): boolean => {
    const hoy = new Date();

    // Regla 1: Estado del Alumno válido para operar en el sistema
    if (alumnoDoc.Estado !== 'Activo' && alumnoDoc.Estado !== 'Inactivo') return false;

    // Regla 2: No estar ya matriculado de forma oficial en el curso de destino
    const cursosInscritosArray = getCursosInscritosArray(alumnoDoc.cursosInscritos);
    const cursosOficialesIds = cursosInscritosArray.map((c: any) => c.id || c.ID_Curso).filter(Boolean);
    if (cursosOficialesIds.includes(claseDestino.ID_Curso)) return false;

    // Regla 3: El ticket seleccionado no debe estar usado ni caducado en tiempo real
    if (ticket.usado || safeToDate(ticket.caducidad) < hoy) return false;

    // Regla 4: Coincidencia estricta de Disciplina y Modalidad
    if (ticket.disciplina !== claseDestino.Disciplina) return false;
    if (ticket.modalidad !== claseDestino.Modalidad) return false;

    // Regla 5: Jerarquía de Dificultad (El nivel del ticket debe ser igual o superior al de la clase destino)
    const pesosNivel: { [key: string]: number } = {
      'Desde cero': 0,
      'Iniciación': 1,
      'Básico': 2,
      'Intermedio': 3,
      'Avanzado': 4,
      'Pro': 5
    };

    const pesoTicket = pesosNivel[ticket.nivel] ?? 0;
    const pesoClaseDestino = pesosNivel[claseDestino.Nivel] ?? 0;

    return pesoTicket >= pesoClaseDestino;
  };

  const solicitarReservaRecuperacion = async (ticket: any, claseDestino: any, user: any) => {
    try {
      if (!verificarCompatibilidadRecuperacion(ticket, claseDestino, user)) {
        throw new Error('La clase seleccionada no es compatible con el ticket.');
      }

      // Añadir al alumno como invitado/recuperación en la sesión de la clase destino
      // We assume there's a subcollection or field. The prompt says:
      // "Implementa la llamada asíncrona que añade al alumno como invitado/recuperación dentro del documento de la sesión correspondiente en la colección de la clase de destino."
      // Let's assume claseDestino has an ID and we update it, or there is a "Sesiones" collection.
      // Usually it's `doc(db, 'Clases', claseDestino.id)` and we add to an array `invitados`.
      
      const claseRef = doc(db, 'Clases', claseDestino.id);
      await updateDoc(claseRef, {
        invitados: arrayUnion({
          idAlumno: user.ID_Alumno,
          nombre: user.Nombre,
          tipo: 'Recuperación',
          idTicket: ticket.idAsistencia,
          fechaReserva: new Date()
        })
      });

      return { success: true };
    } catch (error: any) {
      console.error("Error al solicitar reserva:", error);
      return { success: false, error: error.message };
    }
  };

  return {
    verificarCompatibilidadRecuperacion,
    solicitarReservaRecuperacion
  };
};
