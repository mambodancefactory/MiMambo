import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useBattlepass } from '@/hooks/useBattlepass';
import { useCalculoAsistenciaEnVivo } from '@/hooks/useCalculoAsistenciaEnVivo';
import { useAuth } from '@/context/AuthContext';
import { Shield, Zap, Heart, ChevronRight, Lock, Check, X, Trophy, Star, Calendar, Info } from 'lucide-react';
import { cn } from '@/lib/utils';

export function BattlepassWidget() {
  const { user } = useAuth();
  const { currentLevel, nextLevel, progress, currentXP, nextLevelXP, levels, loading } = useBattlepass();
  const { saldoActual, isLoading: loadingHP } = useCalculoAsistenciaEnVivo(user?.ID_Alumno);
  const [isOpen, setIsOpen] = useState(false);

  // Scroll locking
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => { document.body.style.overflow = 'unset'; };
  }, [isOpen]);

  if (loading || loadingHP) {
    return (
      <div className="w-full h-48 bg-white/10 animate-pulse rounded-2xl backdrop-blur-md border border-white/20" />
    );
  }

  // HP Calculation
  const maxHP = 10;
  const currentHP = Math.max(0, maxHP - saldoActual);
  
  // Determine HP Color
  let hpColor = '#22c55e'; // Green
  if (currentHP <= 3) hpColor = '#ef4444'; // Red
  else if (currentHP <= 6) hpColor = '#f97316'; // Orange

  const pointsToNext = nextLevelXP - Math.floor(currentXP);

  return (
    <>
      {/* Widget Card - Dark Premium Gaming Theme */}
      <motion.div 
        whileHover={{ scale: 1.01 }}
        whileTap={{ scale: 0.99 }}
        onClick={() => setIsOpen(true)}
        className="relative w-full overflow-hidden rounded-2xl bg-[#0f172a] border border-[#ffba15]/30 shadow-[0_8px_30px_rgba(0,0,0,0.04)] cursor-pointer group"
      >
        {/* Background Effects */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(255,186,21,0.1),transparent_70%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_bottom_right,rgba(255,255,255,0.05),transparent)]" />

        <div className="relative p-8 flex justify-between">
          {/* Left Column: Info & Progress */}
          <div className="flex-1 z-10 flex flex-col justify-between mr-4">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <h2 className="text-3xl font-black text-white tracking-tight leading-none">
                  {currentLevel?.displayName || 'Novato'}
                </h2>
              </div>
              
              <div className="flex items-center gap-2 text-white/60 font-bold text-sm mb-6">
                <div className="w-5 h-5 rounded-full bg-[#ffba15]/20 flex items-center justify-center">
                  <Zap size={12} className="text-[#ffba15]" fill="currentColor" />
                </div>
                <span>{Math.floor(currentXP).toLocaleString()}</span>
                <div className="bg-[#ffba15] text-[#0f172a] text-[10px] font-black px-2 py-0.5 rounded-md uppercase tracking-widest ml-1 shadow-[0_0_10px_rgba(255,186,21,0.4)]">
                  LVL {currentLevel?.order || 1}
                </div>
              </div>
            </div>

            <div className="w-full">
              <p className="text-[10px] font-bold text-white/40 mb-2 uppercase tracking-wider">
                {pointsToNext > 0 
                  ? `Faltan ${pointsToNext} XP para el siguiente nivel`
                  : '¡Nivel Máximo alcanzado!'}
              </p>
              
              {/* Premium Progress Bar with "Golden Hammer" touch */}
              <div className="relative w-full h-6 mb-1">
                <div className="absolute top-1/2 -translate-y-1/2 left-0 w-full h-4 bg-white/10 rounded-full overflow-hidden border border-white/5">
                  <motion.div 
                    className="absolute top-0 left-0 h-full bg-gradient-to-r from-[#ffba15] to-[#d97706] shadow-[0_0_15px_rgba(255,186,21,0.4)]"
                    initial={{ width: 0 }}
                    animate={{ width: `${progress}%` }}
                    transition={{ duration: 1.5, ease: "easeOut" }}
                  >
                    {/* Hammer Texture/Shine */}
                    <div className="absolute inset-0 opacity-30 bg-[linear-gradient(45deg,transparent_25%,rgba(255,255,255,0.5)_50%,transparent_75%)] bg-[length:200%_100%] animate-[shimmer_2s_infinite]" />
                  </motion.div>
                </div>
                
                {/* Hammer Icon at the end of progress */}
                <motion.div 
                  className="absolute top-1/2 -translate-y-1/2 z-20 pointer-events-none"
                  initial={{ left: 0 }}
                  animate={{ left: `${progress}%` }}
                  transition={{ duration: 1.5, ease: "easeOut" }}
                  style={{ transform: 'translate(-50%, -50%)' }}
                >
                  <div className="w-6 h-6 bg-[#0f172a] rounded-full flex items-center justify-center border-2 border-[#ffba15] shadow-lg">
                    <Zap size={12} className="text-[#ffba15]" fill="currentColor" />
                  </div>
                </motion.div>
              </div>
              
              <div className="flex justify-between text-[9px] font-black text-white/30 uppercase tracking-tighter">
                <span>{currentLevel?.displayName}</span>
                <span>{nextLevel?.displayName || 'Max'}</span>
              </div>
            </div>
          </div>

          {/* Right Column: Rank Image with Golden Mask */}
          <div className="flex flex-col items-end justify-center">
            <div className="relative w-32 h-32">
              {/* Golden Circle Border */}
              <div className="absolute inset-0 rounded-full border-[6px] border-[#ffba15] shadow-[0_0_20px_rgba(255,186,21,0.4)] z-20" />
              
              {/* Round Image Mask */}
              <div className="absolute inset-[6px] rounded-full overflow-hidden bg-[#0f172a] z-10">
                {currentLevel?.logo_url ? (
                  <img 
                    src={currentLevel.logo_url} 
                    alt={currentLevel.displayName} 
                    className="w-full h-full object-cover transform group-hover:scale-110 transition-transform duration-500"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-yellow-400 to-orange-500">
                    <Shield className="w-12 h-12 text-white" />
                  </div>
                )}
              </div>
              
              {/* Decorative Stars */}
              <div className="absolute -top-2 -right-2 text-[#ffba15] z-30">
                <Star size={16} fill="currentColor" className="animate-pulse" />
              </div>
              <div className="absolute -bottom-1 -left-1 text-[#ffba15]/60 z-30">
                <Star size={12} fill="currentColor" />
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Full Screen Immersive View (No Modal Frame) */}
      <AnimatePresence>
        {isOpen && (
          <div className="fixed inset-0 z-[100] flex flex-col">
            {/* Blurred Background of Dashboard */}
            <motion.div 
              initial={{ opacity: 0, backdropFilter: "blur(0px)" }}
              animate={{ opacity: 1, backdropFilter: "blur(20px)" }}
              exit={{ opacity: 0, backdropFilter: "blur(0px)" }}
              className="absolute inset-0 bg-[#0f172a]/80"
            />
            
            {/* Content Container */}
            <motion.div 
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 50 }}
              className="relative z-10 w-full h-full overflow-y-auto custom-scrollbar flex flex-col"
            >
              {/* Header */}
              <div className="sticky top-0 z-20 pt-12 pb-6 px-6 bg-[#0f172a]/80 backdrop-blur-xl border-b border-white/5 shadow-2xl shadow-black/20">
                <div className="flex justify-between items-start max-w-2xl mx-auto w-full">
                  <div>
                    <span className="text-yellow-400 font-bold text-xs uppercase tracking-[0.2em] mb-2 block">Battlepass Temporada 1</span>
                    <h2 className="text-4xl font-black text-white tracking-tight leading-none">
                      {currentLevel?.displayName || 'Nivel 1'}
                    </h2>
                  </div>
                  <button 
                    onClick={() => setIsOpen(false)}
                    className="p-3 bg-white/10 rounded-full text-white hover:bg-white/20 transition-colors backdrop-blur-md border border-white/10"
                  >
                    <X size={24} />
                  </button>
                </div>
              </div>

              <div className="flex-1 px-6 pb-24 max-w-2xl mx-auto w-full space-y-10 pt-8">
                
                {/* Main Stats Indicators */}
                <div className="grid grid-cols-2 gap-4 relative z-10">
                  <div className="bg-gradient-to-br from-white/10 to-white/5 rounded-3xl p-6 border border-white/10 backdrop-blur-md">
                    <div className="text-yellow-400 mb-3 flex items-center gap-2">
                      <Zap size={24} fill="currentColor" />
                      <span className="text-[10px] font-black uppercase tracking-widest text-white/40">Experiencia</span>
                    </div>
                    <div className="text-3xl font-black text-white">{Math.floor(currentXP).toLocaleString()}</div>
                    <div className="text-[10px] font-bold text-yellow-400/60 uppercase tracking-wider mt-1">XP Totales Acumulados</div>
                  </div>
                  <div className="bg-gradient-to-br from-white/10 to-white/5 rounded-3xl p-6 border border-white/10 backdrop-blur-md">
                    <div className="text-[#ffba15] mb-3 flex items-center gap-2">
                      <Heart size={24} fill="currentColor" />
                      <span className="text-[10px] font-black uppercase tracking-widest text-white/40">Recuperaciones</span>
                    </div>
                    <div className="text-3xl font-black text-white">{saldoActual}</div>
                    <div className="text-[10px] font-bold text-[#ffba15]/60 uppercase tracking-wider mt-1">Clases por recuperar</div>
                  </div>
                </div>

                {/* Horizontal Road Map (Cards) */}
                <div className="relative">
                  <h3 className="text-white/60 text-xs font-bold uppercase tracking-widest mb-4 px-2">Road Map de Rangos</h3>
                  
                  <div className="flex gap-4 overflow-x-auto pb-8 pt-4 px-2 snap-x snap-mandatory no-scrollbar mask-linear-fade">
                    {levels.map((level, index) => {
                      const isUnlocked = currentLevel && level.min_xp <= currentLevel.min_xp;
                      const isCurrent = currentLevel?.id === level.id;
                      
                      // Calculate brightness/glow based on index (0 to levels.length - 1)
                      const brightness = 0.5 + (index / (levels.length - 1)) * 0.5; // 0.5 to 1.0
                      const glowIntensity = index / (levels.length - 1); // 0.0 to 1.0

                      return (
                        <motion.div 
                          key={level.id}
                          initial={{ opacity: 0, x: 50 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: index * 0.1 }}
                          className="snap-center shrink-0 first:pl-2 last:pr-2"
                        >
                          <div 
                            className={cn(
                              "relative w-40 h-64 rounded-3xl overflow-hidden border transition-all duration-500 group",
                              isCurrent ? "border-[#ffba15] scale-105 z-10 shadow-[0_0_30px_rgba(255,186,21,0.3)]" : 
                              isUnlocked ? "border-white/20 hover:border-white/40" : "border-white/5 opacity-60 grayscale"
                            )}
                            style={{
                              background: `linear-gradient(to bottom right, rgba(255, 255, 255, ${0.05 + glowIntensity * 0.1}), rgba(0, 0, 0, 0.8))`,
                            }}
                          >
                            {/* Glow Effect for higher levels */}
                            <div 
                              className="absolute inset-0 pointer-events-none opacity-20"
                              style={{
                                background: `radial-gradient(circle at 50% 0%, rgba(255, 186, 21, ${glowIntensity}), transparent 70%)`
                              }}
                            />

                            {/* Level Number Badge */}
                            <div className="absolute top-3 right-3 z-20">
                              <div className={cn(
                                "text-[10px] font-black px-2 py-1 rounded-md uppercase tracking-widest backdrop-blur-md border",
                                isCurrent ? "bg-[#ffba15] text-[#1a1b2e] border-[#ffba15]" : "bg-black/40 text-white border-white/10"
                              )}>
                                LVL {level.order}
                              </div>
                            </div>

                            {/* Status Icon */}
                            <div className="absolute top-3 left-3 z-20">
                              {isCurrent ? (
                                <div className="p-1.5 bg-[#ffba15] rounded-full shadow-lg shadow-orange-500/20">
                                  <Zap size={12} className="text-[#1a1b2e]" fill="currentColor" />
                                </div>
                              ) : isUnlocked ? (
                                <div className="p-1.5 bg-green-500/20 rounded-full border border-green-500/50">
                                  <Check size={12} className="text-green-400" />
                                </div>
                              ) : (
                                <div className="p-1.5 bg-black/40 rounded-full border border-white/10">
                                  <Lock size={12} className="text-white/40" />
                                </div>
                              )}
                            </div>

                            {/* Image Container */}
                            <div className="absolute top-12 left-1/2 -translate-x-1/2 w-24 h-24">
                              <div className={cn(
                                "w-full h-full rounded-full border-4 overflow-hidden shadow-2xl",
                                isCurrent ? "border-[#ffba15]" : "border-white/10"
                              )}>
                                {level.logo_url ? (
                                  <img src={level.logo_url} alt={level.displayName} className="w-full h-full object-cover" />
                                ) : (
                                  <div className="w-full h-full bg-white/5 flex items-center justify-center">
                                    <Shield className="text-white/20" />
                                  </div>
                                )}
                              </div>
                              
                              {/* Current Level Indicator */}
                              {isCurrent && (
                                <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 bg-[#ffba15] text-[#1a1b2e] text-[8px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest whitespace-nowrap shadow-lg">
                                  Actual
                                </div>
                              )}
                            </div>

                            {/* Info */}
                            <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black via-black/80 to-transparent pt-12 text-center">
                              <h4 className={cn(
                                "font-black text-sm uppercase tracking-tight mb-1",
                                isCurrent ? "text-[#ffba15]" : "text-white"
                              )}>
                                {level.displayName}
                              </h4>
                              <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest">
                                {level.min_xp.toLocaleString()} XP
                              </p>
                            </div>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                </div>

                {/* Scoring Rules - Moved to Bottom */}
                <div className="bg-[#1e293b]/50 rounded-3xl p-6 border border-white/5 mt-8">
                  <div className="flex items-center gap-2 mb-4">
                    <Info size={18} className="text-blue-400" />
                    <h3 className="font-bold text-white text-sm uppercase tracking-wider">Cómo ganar puntos</h3>
                  </div>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center p-3 bg-white/5 rounded-xl border border-white/5">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-green-500/20 rounded-lg text-green-400"><Check size={16} /></div>
                        <span className="text-sm font-medium text-gray-300">Asistencia a clase</span>
                      </div>
                      <span className="font-bold text-yellow-400">+100 XP</span>
                    </div>
                    <div className="flex justify-between items-center p-3 bg-white/5 rounded-xl border border-white/5">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-purple-500/20 rounded-lg text-purple-400"><Calendar size={16} /></div>
                        <span className="text-sm font-medium text-gray-300">Eventos especiales</span>
                      </div>
                      <span className="font-bold text-yellow-400">+300 XP</span>
                    </div>
                    <div className="flex justify-between items-center p-3 bg-white/5 rounded-xl border border-white/5">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-500/20 rounded-lg text-blue-400"><Zap size={16} /></div>
                        <span className="text-sm font-medium text-gray-300">Recuperaciones</span>
                      </div>
                      <span className="font-bold text-yellow-400">+50 XP</span>
                    </div>
                  </div>
                </div>

              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
