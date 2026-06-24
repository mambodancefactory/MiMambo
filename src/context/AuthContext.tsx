import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { collection, query, where, getDocs, doc, getDoc, onSnapshot, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';

// Helper to recursively normalize Firestore data (specifically Timestamps)
function normalizeFirestoreData(data: any): any {
  if (data === null || data === undefined) return data;
  
  if (data instanceof Timestamp) {
    return data.toDate().toISOString();
  }
  
  if (Array.isArray(data)) {
    return data.map(normalizeFirestoreData);
  }
  
  if (typeof data === 'object' && data.constructor === Object) {
    const normalized: any = {};
    for (const key in data) {
      normalized[key] = normalizeFirestoreData(data[key]);
    }
    return normalized;
  }
  
  // Handle some objects that might be plain objects with seconds/nanoseconds
  if (typeof data === 'object' && 'seconds' in data && 'nanoseconds' in data) {
    try {
      return new Date(data.seconds * 1000).toISOString();
    } catch (e) {
      return data;
    }
  }
  
  return data;
}

interface User {
  ID_Alumno: string;
  Nombre: string;
  Email: string;
  Estado: 'Activo' | 'Inactivo' | 'Baja';
  Foto_Alumno: string;
  DNI: string;
  Telefono: string;
  Fecha_Nacimiento: string;
  [key: string]: any;
}

interface AuthContextType {
  user: User | null;
  login: (email: string, pass: string) => Promise<void>;
  logout: () => void;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const storedUser = localStorage.getItem('mi_mambo_user');
    if (storedUser) {
      setUser(JSON.parse(storedUser));
    }
    setLoading(false);
  }, []);

  // Real-time listener for the logged-in user
  useEffect(() => {
    if (!user?.ID_Alumno) return;

    const userRef = doc(db, 'Alumnos', user.ID_Alumno);
    const unsubscribe = onSnapshot(userRef, (docSnap) => {
      if (docSnap.exists()) {
        const rawData = docSnap.data();
        const updatedData = normalizeFirestoreData(rawData) as User;
        updatedData.ID_Alumno = updatedData.ID_Alumno || docSnap.id;
        
        setUser(prevUser => {
          const newUser = { ...prevUser, ...updatedData };
          localStorage.setItem('mi_mambo_user', JSON.stringify(newUser));
          return newUser;
        });
      }
    }, (error) => {
      console.error("Error listening to real-time user updates:", error);
    });

    return () => unsubscribe();
  }, [user?.ID_Alumno]);

  const login = async (emailOrId: string, _pass: string) => {
    // Aggressive cleaning of input for mobile compatibility
    const input = emailOrId.trim().replace(/[\u200B-\u200D\uFEFF]/g, '');
    const lowerInput = input.toLowerCase();
    const upperInput = input.toUpperCase();
    
    // Try multiple strategies to find the user
    // 1. Check if input is a direct Document ID
    // 2. Query by Email (exact and lowercase)
    // 3. Query by ID_Alumno field (exact, lower, and upper)
    
    let userData: User | null = null;

    // Strategy 1: Direct Document ID lookup
    try {
      const docRef = doc(db, 'Alumnos', input);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const rawData = docSnap.data();
        userData = normalizeFirestoreData(rawData) as User;
        userData.ID_Alumno = userData.ID_Alumno || docSnap.id;
      }
      
      if (!userData) {
        // Try upper case doc ID (common for IDs)
        const docRefUpper = doc(db, 'Alumnos', upperInput);
        const docSnapUpper = await getDoc(docRefUpper);
        if (docSnapUpper.exists()) {
          const rawDataUpper = docSnapUpper.data();
          userData = normalizeFirestoreData(rawDataUpper) as User;
          userData.ID_Alumno = userData.ID_Alumno || docSnapUpper.id;
        }
      }
    } catch (e) {
      console.error("Error in direct doc lookup", e);
    }

    // Strategy 2: Queries
    if (!userData) {
      try {
        const queries = [
          query(collection(db, 'Alumnos'), where('Email', '==', input)),
          query(collection(db, 'Alumnos'), where('Email', '==', lowerInput)),
          query(collection(db, 'Alumnos'), where('ID_Alumno', '==', input)),
          query(collection(db, 'Alumnos'), where('ID_Alumno', '==', lowerInput)),
          query(collection(db, 'Alumnos'), where('ID_Alumno', '==', upperInput)),
        ];

        for (const q of queries) {
          const snap = await getDocs(q);
          if (!snap.empty) {
            const rawData = snap.docs[0].data();
            userData = normalizeFirestoreData(rawData) as User;
            userData.ID_Alumno = userData.ID_Alumno || snap.docs[0].id;
            break;
          }
        }
      } catch (e: any) {
        console.error("Error in Strategy 2 queries:", e);
        throw new Error("Error consultando la base de datos: " + e.message);
      }
    }

    if (userData) {
      setUser(userData);
      localStorage.setItem('mi_mambo_user', JSON.stringify(userData));
    } else {
      throw new Error('Credenciales incorrectas');
    }
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('mi_mambo_user');
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
