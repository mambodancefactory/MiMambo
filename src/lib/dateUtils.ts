import { 
  eachDayOfInterval, 
  isSameDay, 
  getDay, 
  parseISO, 
  startOfDay, 
  isBefore, 
  isAfter 
} from 'date-fns';

// Helper to map "Lun/Mie" to day numbers (0=Sun, 1=Mon, etc.)
export function parseDaysOfWeek(daysString: string): number[] {
  if (!daysString) return [];
  
  const map: Record<string, number> = {
    'Lun': 1, 'Mar': 2, 'Mie': 3, 'Mié': 3, 'Jue': 4, 'Vie': 5, 'Sab': 6, 'Sáb': 6, 'Dom': 0
  };
  
  // Split by slash, comma, or space
  const parts = daysString.split(/[\/, ]+/);
  return parts.map(p => map[p.trim().substring(0, 3)]).filter(n => n !== undefined);
}

export function getClassDates(
  startDate: Date, 
  endDate: Date, 
  daysOfWeek: number[]
): Date[] {
  const interval = eachDayOfInterval({ start: startDate, end: endDate });
  return interval.filter(date => daysOfWeek.includes(getDay(date)));
}
