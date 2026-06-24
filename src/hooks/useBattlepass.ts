import { useState, useEffect } from 'react';
import { doc, onSnapshot, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/context/AuthContext';

export interface BattlepassLevel {
  id: string;
  min_xp: number;
  max_xp: number;
  logo_url: string;
  nombre_m: string;
  nombre_f: string;
  order: number;
  displayName?: string;
}

export interface BattlepassData {
  currentLevel: BattlepassLevel | null;
  nextLevel: BattlepassLevel | null;
  progress: number; // 0 to 100
  currentXP: number;
  nextLevelXP: number;
  levels: BattlepassLevel[];
  loading: boolean;
}

// Fallback data provided by user
const DEFAULT_LEVELS: BattlepassLevel[] = [
  {
    id: "0",
    min_xp: 0,
    max_xp: 1500,
    logo_url: "https://mambodancefactory.com/wp-content/uploads/2026/01/rookies.jpg",
    nombre_m: "Mamberito",
    nombre_f: "Mamberita",
    order: 0
  },
  {
    id: "1",
    min_xp: 1501,
    max_xp: 4000,
    logo_url: "https://mambodancefactory.com/wp-content/uploads/2026/01/mamberitos.jpg",
    nombre_m: "Mambero",
    nombre_f: "Mambera",
    order: 1
  },
  {
    id: "2",
    min_xp: 4001,
    max_xp: 8000,
    logo_url: "https://mambodancefactory.com/wp-content/uploads/2026/01/expertos.jpg",
    nombre_m: "Mambero Experto",
    nombre_f: "Mambera Experta",
    order: 2
  },
  {
    id: "3",
    min_xp: 8001,
    max_xp: 12000,
    logo_url: "https://mambodancefactory.com/wp-content/uploads/2026/01/pro.jpg",
    nombre_m: "Mambero Pro",
    nombre_f: "Mambera Pro",
    order: 3
  },
  {
    id: "4",
    min_xp: 12001,
    max_xp: 999999,
    logo_url: "https://mambodancefactory.com/wp-content/uploads/2026/01/legendario.jpg",
    nombre_m: "Mambero Legendario",
    nombre_f: "Mambera Legendaria",
    order: 4
  }
];

export function useBattlepass() {
  const { user } = useAuth();
  const [data, setData] = useState<BattlepassData>({
    currentLevel: null,
    nextLevel: null,
    progress: 0,
    currentXP: 0,
    nextLevelXP: 0,
    levels: [],
    loading: true,
  });

  useEffect(() => {
    if (!user?.ID_Alumno) return;

    let unsubscribeUser: (() => void) | undefined;

    const init = async () => {
      try {
        // 1. Fetch Battlepass Config
        let levels: BattlepassLevel[] = [];
        
        try {
          // Try 'Battlepass' first, then 'battlepass'
          let configRef = doc(db, 'Configuracion_Global', 'Battlepass');
          let configSnap = await getDoc(configRef);
          
          if (!configSnap.exists()) {
             console.log("Battlepass doc not found, trying lowercase 'battlepass'");
             configRef = doc(db, 'Configuracion_Global', 'battlepass');
             configSnap = await getDoc(configRef);
          }
          
          if (configSnap.exists()) {
            const configData = configSnap.data();
            console.log("Battlepass Config Raw:", configData);

            let rawLevels: any[] = [];
            
            // Try to find the levels array in various common field names
            const candidates = [
              configData.rangos, 
              configData.Rangos, 
              configData.Niveles, 
              configData.niveles,
              configData.levels,
              configData.Levels
            ];

            for (const candidate of candidates) {
              if (Array.isArray(candidate)) {
                rawLevels = candidate;
                break;
              } else if (candidate && typeof candidate === 'object') {
                 // Handle map/object structure
                 rawLevels = Object.keys(candidate).map(key => ({
                    ...candidate[key],
                    id: key
                 }));
                 break;
              }
            }

            // Map to BattlepassLevel interface
            if (rawLevels.length > 0) {
              levels = rawLevels.map((rango: any, index: number) => ({
                id: rango.id || index.toString(),
                min_xp: Number(rango.min_xp || 0),
                max_xp: Number(rango.max_xp || 0),
                logo_url: rango.logo_url || '',
                nombre_m: rango.nombre_m || 'Rango',
                nombre_f: rango.nombre_f || 'Rango',
                order: index
              }));
              
              // Sort levels by min_xp
              levels.sort((a, b) => a.min_xp - b.min_xp);
              console.log("Parsed Levels from DB:", levels);
            }
          }
        } catch (err: any) {
          // If offline, just warn and use defaults
          if (err?.code === 'unavailable' || err?.message?.includes('offline')) {
             console.warn("Battlepass config fetch failed (offline mode), using defaults.");
          } else {
             console.error("Error fetching Battlepass config from DB:", err);
          }
        }

        // Use DEFAULT_LEVELS if DB fetch failed or returned empty
        if (levels.length === 0) {
          console.log("Using DEFAULT_LEVELS fallback");
          levels = [...DEFAULT_LEVELS];
        }

        // 2. Listen to User's XP
        const userRef = doc(db, 'Alumnos', user.ID_Alumno);
        unsubscribeUser = onSnapshot(userRef, (docSnap) => {
          if (docSnap.exists()) {
            const userData = docSnap.data();
            const currentXP = Number(userData.XP_Total || 0);
            const gender = userData.Genero || 'M';

            console.log("User XP:", currentXP, "Gender:", gender);

            // Find current level
            let currentLevelIndex = -1;
            
            // Find the highest level where min_xp <= currentXP
            for (let i = 0; i < levels.length; i++) {
              if (currentXP >= levels[i].min_xp) {
                currentLevelIndex = i;
              } else {
                break;
              }
            }

            // Create copies to avoid mutation issues
            const currentLevel = levels[currentLevelIndex] ? { ...levels[currentLevelIndex] } : null;
            const nextLevel = levels[currentLevelIndex + 1] ? { ...levels[currentLevelIndex + 1] } : null;

            let progress = 0;
            // If there is a next level, target is its min_xp. 
            // If max level, target is current level's max_xp.
            let nextLevelXP = nextLevel ? nextLevel.min_xp : (currentLevel ? currentLevel.max_xp : 100);

            if (currentLevel && nextLevel) {
              const range = nextLevel.min_xp - currentLevel.min_xp;
              const gained = currentXP - currentLevel.min_xp;
              progress = Math.min(100, Math.max(0, (gained / range) * 100));
            } else if (currentLevel && !nextLevel) {
              // Max level logic
              if (currentLevel.max_xp > currentLevel.min_xp) {
                  const range = currentLevel.max_xp - currentLevel.min_xp;
                  const gained = currentXP - currentLevel.min_xp;
                  progress = Math.min(100, Math.max(0, (gained / range) * 100));
              } else {
                  progress = 100;
              }
            }

            // Adjust name based on gender for ALL levels (for timeline)
            const isFemale = gender === 'F' || gender === 'Mujer' || gender === 'Female';
            levels.forEach(level => {
              level.displayName = isFemale ? level.nombre_f : level.nombre_m;
            });
            
            // Update current/next level display names in the specific objects
            if (currentLevel) currentLevel.displayName = isFemale ? currentLevel.nombre_f : currentLevel.nombre_m;
            if (nextLevel) nextLevel.displayName = isFemale ? nextLevel.nombre_f : nextLevel.nombre_m;

            setData({
              currentLevel,
              nextLevel,
              progress,
              currentXP,
              nextLevelXP,
              levels,
              loading: false,
            });
          }
        });

      } catch (error) {
        console.error("Error initializing Battlepass:", error);
        setData(prev => ({ ...prev, loading: false }));
      }
    };

    init();

    return () => {
      if (unsubscribeUser) unsubscribeUser();
    };
  }, [user?.ID_Alumno]);

  return data;
}
