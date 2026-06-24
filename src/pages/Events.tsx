import { useState, useEffect } from 'react';
import { GlassCard } from '@/components/GlassCard';
import { Calendar, MapPin } from 'lucide-react';
import { collection, getDocs, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/context/AuthContext';

import { Header } from '@/components/Header';

interface Event {
  ID_Evento: string;
  NombreEvento: string;
  FechaInicioEvento: string;
  PrecioEvento: number;
  ImagenEvento: string;
}

// Helper to safely format dates
const formatEventDate = (dateVal: any) => {
  if (!dateVal) return 'Sin fecha';
  if (typeof dateVal === 'string') return dateVal;
  if (dateVal.toDate) return dateVal.toDate().toLocaleDateString('es-ES');
  if (dateVal.seconds) return new Date(dateVal.seconds * 1000).toLocaleDateString('es-ES');
  return String(dateVal);
};

export default function Events() {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  useEffect(() => {
    const fetchEvents = async () => {
      try {
        const querySnapshot = await getDocs(collection(db, 'Eventos'));
        const eventsData = querySnapshot.docs.map(doc => ({
          ID_Evento: doc.id,
          ...doc.data()
        })) as Event[];
        setEvents(eventsData);
      } catch (error) {
        console.error("Error fetching events:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchEvents();
  }, []);

  const handleJoinEvent = async (eventId: string, price: number) => {
    if (!user) return;
    try {
      await addDoc(collection(db, 'Eventos_Asistencia'), {
        ID_Alumno: user.ID_Alumno,
        ID_Evento: eventId,
        Pagado: false, // Default to unpaid until processed
        FechaInscripcion: serverTimestamp()
      });
      alert(`Te has inscrito al evento. Precio: ${price}€`);
    } catch (error) {
      console.error("Error joining event:", error);
      alert('Error al inscribirse');
    }
  };

  if (loading) return <div className="p-8 text-center text-gray-500">Cargando eventos...</div>;

  return (
    <div className="space-y-6 pt-4 pb-24">
      <Header title="Próximos Eventos" />

      <div className="space-y-6">
        {events.map((event) => (
          <GlassCard key={event.ID_Evento} className="p-0 overflow-hidden border-0">
            <div className="h-32 w-full relative">
              <img 
                src={event.ImagenEvento || 'https://picsum.photos/seed/dance/400/200'} 
                alt={event.NombreEvento} 
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
              <div className="absolute top-3 right-3 bg-white/90 backdrop-blur-md px-3 py-1 rounded-full text-sm font-bold text-gray-800 shadow-sm">
                {event.PrecioEvento}€
              </div>
            </div>
            <div className="p-5">
              <h3 className="text-xl font-bold text-[#2e2f43] mb-2">{event.NombreEvento}</h3>
              <div className="flex items-center text-gray-600 text-sm mb-4">
                <Calendar size={16} className="mr-2 text-[#2e2f43]" />
                {formatEventDate(event.FechaInicioEvento)}
                <span className="mx-2">•</span>
                <MapPin size={16} className="mr-2 text-[#2e2f43]" />
                Mambo Studio
              </div>
              <button 
                onClick={() => handleJoinEvent(event.ID_Evento, event.PrecioEvento)}
                className="w-full py-3 bg-[#2e2f43] text-white rounded-xl font-bold shadow-lg shadow-[#2e2f43]/20 hover:shadow-[#2e2f43]/30 transition-all active:scale-95"
              >
                Inscribirse
              </button>
            </div>
          </GlassCard>
        ))}
        {events.length === 0 && (
          <div className="text-center text-gray-500 py-8">
            No hay eventos próximos.
          </div>
        )}
      </div>
    </div>
  );
}
