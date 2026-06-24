import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import QRCode from 'react-qr-code';
import { motion, AnimatePresence } from 'framer-motion';
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
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-4 pointer-events-none">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/40 backdrop-blur-sm pointer-events-auto"
            onClick={onClose}
          />
          
          <motion.div
            initial={{ y: '100%', opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: '100%', opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="w-full max-w-sm relative pointer-events-auto pb-safe"
          >
            {/* Modal Close Button */}
            <button 
              onClick={onClose}
              className="absolute -top-12 right-0 w-10 h-10 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center text-white hover:bg-white/30 transition-all border border-white/20"
            >
              <X size={20} />
            </button>

            {/* ID Card Wrapper */}
            <div className="bg-gradient-to-b from-[#2e2f43] to-[#1a1b26] rounded-3xl p-1 shadow-2xl relative overflow-hidden">
              {/* Shine effect */}
              <div className="absolute inset-0 bg-gradient-to-tr from-white/5 via-transparent to-white/10 opacity-50" />
              
              <div className="bg-[#2e2f43]/90 backdrop-blur-xl rounded-[22px] overflow-hidden border border-white/10 relative">
                
                {/* Header Pattern */}
                <div className="h-24 bg-gradient-to-r from-[#2e2f43] to-[#42445e] relative">
                  <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)', backgroundSize: '16px 16px' }} />
                </div>

                {/* Profile Photo */}
                <div className="flex justify-center -mt-12 relative z-10">
                  <div className="relative">
                    <img 
                      src={user.Foto_Alumno || `https://ui-avatars.com/api/?name=${user.Nombre}&background=fff&color=2e2f43`}
                      alt="Perfil"
                      className="w-24 h-24 rounded-full object-cover border-4 border-[#2e2f43] shadow-xl"
                    />
                    {isVIP && (
                      <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-gradient-to-r from-yellow-400 to-yellow-600 text-[#2e2f43] text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full shadow-lg border border-yellow-300">
                        VIP
                      </div>
                    )}
                  </div>
                </div>

                {/* Info */}
                <div className="text-center px-6 pt-6 pb-4">
                  <h2 className="text-xl font-black text-white leading-tight mb-1">{user.Nombre} {user.Apellidos}</h2>
                  <p className="text-sm text-gray-400 font-medium mb-4">{user.Email}</p>

                  <div className="flex justify-center gap-2 mb-8">
                    <span className={cn(
                      "text-xs font-black uppercase tracking-widest px-3 py-1 rounded-full",
                      isActivo ? "bg-green-500/20 text-green-400 border border-green-500/30" : "bg-red-500/20 text-red-400 border border-red-500/30"
                    )}>
                      {user.Estado || 'Inactivo'}
                    </span>
                  </div>

                  {/* QR Code Container */}
                  <div className="bg-white p-4 rounded-2xl mx-auto w-48 shadow-inner mb-6 relative">
                    <div className="absolute -left-3 top-1/2 -translate-y-1/2 w-6 h-6 bg-[#2e2f43] rounded-full" />
                    <div className="absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 bg-[#2e2f43] rounded-full" />
                    <div className="absolute left-3 right-3 top-1/2 -translate-y-1/2 border-t-2 border-dashed border-gray-200" />
                    
                    <div className="relative z-10 bg-white p-2">
                      <QRCode 
                        value={user.ID_Alumno || user.Email || ''} 
                        size={160}
                        style={{ height: "auto", maxWidth: "100%", width: "100%" }}
                        fgColor="#2e2f43"
                      />
                    </div>
                  </div>

                  <div className="text-center">
                    <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">ID ALUMNO</p>
                    <p className="text-sm font-mono text-gray-300 bg-black/20 py-2 px-4 rounded-xl inline-block border border-white/5">
                      {user.ID_Alumno}
                    </p>
                  </div>
                </div>

                {/* Footer */}
                <div className="bg-black/20 p-4 text-center border-t border-white/5">
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
