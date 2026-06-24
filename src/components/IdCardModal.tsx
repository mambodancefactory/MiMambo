import React, { useState, useEffect } from 'react';
import QRCode from 'react-qr-code';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '@/context/AuthContext';
import { cn } from '@/lib/utils';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';

interface IdCardModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function IdCardModal({ isOpen, onClose }: IdCardModalProps) {
  const { user } = useAuth();
  const [coursesCount, setCoursesCount] = useState(0);

  useEffect(() => {
    if (user && isOpen) {
      const fetchCourses = async () => {
        try {
          const q = query(collection(db, 'Asignacion_Cursos'), where('ID_Alumno', '==', user.ID_Alumno));
          const snap = await getDocs(q);
          setCoursesCount(snap.size);
        } catch (e) {
          console.error("Error fetching courses count", e);
        }
      };
      fetchCourses();
    }
  }, [user, isOpen]);

  if (!user) return null;

  const isVIP = coursesCount > 5;
  const isActivo = user.Estado === 'Activo';

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 pointer-events-none">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm pointer-events-auto"
            onClick={onClose}
          />
          
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="w-full max-w-sm relative pointer-events-auto"
            onClick={onClose}
          >
            {/* ID Card Wrapper */}
            <div className="bg-[#35364a] rounded-[2rem] shadow-2xl relative overflow-hidden">
              
              <div className="overflow-hidden relative">
                
                {/* Header Pattern */}
                <div className="h-28 bg-[#3c3e53] relative border-b border-white/5">
                  <div className="absolute inset-0 opacity-[0.15]" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)', backgroundSize: '16px 16px' }} />
                </div>

                {/* Logo */}
                <div className="flex justify-center -mt-12 relative z-10">
                  <div className="relative">
                    <img 
                      src={`https://ui-avatars.com/api/?name=Mambo&background=fbbf24&color=2e2f43&rounded=true&font-size=0.4&bold=true`}
                      alt="Mambo Logo"
                      className="w-24 h-24 rounded-full object-cover border-4 border-[#35364a] shadow-lg"
                    />
                    {isVIP && (
                      <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-gradient-to-r from-yellow-400 to-yellow-600 text-[#2e2f43] text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full shadow-lg border border-yellow-300">
                        VIP
                      </div>
                    )}
                  </div>
                </div>

                {/* Info */}
                <div className="text-center px-6 pt-5 pb-4">
                  <h2 className="text-xl font-black text-white leading-tight mb-1">{user.Nombre} {user.Apellidos}</h2>
                  <p className="text-sm text-gray-400 font-medium mb-4">{user.Email}</p>

                  <div className="flex justify-center gap-2 mb-6">
                    <span className={cn(
                      "text-[10px] font-black uppercase tracking-widest px-4 py-1.5 rounded-full shadow-inner",
                      isActivo ? "bg-[#1f2937]/50 text-emerald-400 border border-emerald-500/20" : "bg-[#1f2937]/50 text-red-400 border border-red-500/20"
                    )}>
                      {user.Estado || 'Inactivo'}
                    </span>
                  </div>

                  {/* QR Code Container */}
                  <div className="bg-white p-4 rounded-3xl mx-auto w-52 shadow-xl mb-8 relative">
                    <div className="absolute -left-3 top-1/2 -translate-y-1/2 w-6 h-6 bg-[#35364a] rounded-full" />
                    <div className="absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 bg-[#35364a] rounded-full" />
                    
                    <div className="relative z-10 bg-white p-2">
                      <QRCode 
                        value={user.ID_Alumno || user.Email || ''} 
                        size={160}
                        style={{ height: "auto", maxWidth: "100%", width: "100%" }}
                        fgColor="#2e2f43"
                      />
                    </div>
                  </div>

                  <div className="text-center mb-2">
                    <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5">ID ALUMNO</p>
                    <p className="text-sm font-mono text-gray-300 bg-[#2b2c3d] py-2 px-6 rounded-xl inline-block shadow-inner">
                      {user.ID_Alumno}
                    </p>
                  </div>
                </div>

                {/* Footer */}
                <div className="bg-[#2b2c3d] p-5 text-center mt-2">
                  <p className="text-[10px] text-gray-500 font-medium">
                    Escanea este código en recepción para registrar tu asistencia.
                  </p>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
