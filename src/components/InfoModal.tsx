import React from 'react';
import { X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface InfoModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function InfoModal({ isOpen, onClose }: InfoModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
          />
          
          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed inset-x-4 top-[10%] max-h-[80vh] bg-white rounded-3xl shadow-2xl z-50 overflow-hidden flex flex-col md:max-w-md md:mx-auto"
          >
            {/* Header */}
            <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
              <h3 className="text-xl font-bold text-[#2e2f43]">Reglas de Asistencia</h3>
              <button 
                onClick={onClose}
                className="p-2 hover:bg-gray-200 rounded-full transition-colors text-gray-500"
              >
                <X size={20} />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 overflow-y-auto space-y-6 text-[#2e2f43]/80 text-sm leading-relaxed">
              <section>
                <h4 className="font-bold text-[#2e2f43] mb-2 flex items-center">
                  <span className="w-6 h-6 rounded-full bg-[#ffba15]/20 text-[#ffba15] flex items-center justify-center text-xs mr-2">1</span>
                  Sistema de Faltas
                </h4>
                <p>
                  Cada falta no justificada ocupa un "slot" en tu saldo. Tienes un máximo de <strong>10 faltas acumulables</strong>.
                  El objetivo es mantener tus slots vacíos (0 faltas).
                </p>
              </section>

              <section>
                <h4 className="font-bold text-[#2e2f43] mb-2 flex items-center">
                  <span className="w-6 h-6 rounded-full bg-[#ffba15]/20 text-[#ffba15] flex items-center justify-center text-xs mr-2">2</span>
                  Recuperaciones
                </h4>
                <p>
                  Puedes recuperar una falta asistiendo a otra clase de tu nivel o inferior. 
                  Al recuperar, se libera un slot de falta (restas 1 al saldo).
                </p>
              </section>

              <section>
                <h4 className="font-bold text-[#2e2f43] mb-2 flex items-center">
                  <span className="w-6 h-6 rounded-full bg-[#ffba15]/20 text-[#ffba15] flex items-center justify-center text-xs mr-2">3</span>
                  Trimestres
                </h4>
                <p>
                  Las estadísticas se muestran por trimestres naturales (Ene-Mar, Abr-Jun, Jul-Sep, Oct-Dic), 
                  pero tu saldo de faltas es acumulativo y continuo.
                </p>
              </section>

              <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 text-blue-800 text-xs">
                <strong>Nota Importante:</strong> Si alcanzas las 10 faltas acumuladas, el sistema podría limitar tu acceso a reservas de clases adicionales.
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
