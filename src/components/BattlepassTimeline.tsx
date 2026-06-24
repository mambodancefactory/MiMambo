import React from 'react';
import { motion } from 'framer-motion';
import { useBattlepass } from '@/hooks/useBattlepass';
import { Lock, Check } from 'lucide-react';

export function BattlepassTimeline() {
  const { levels, currentLevel, progress, loading } = useBattlepass();

  if (loading) {
    return (
      <div className="w-full h-64 bg-white/10 animate-pulse rounded-3xl backdrop-blur-md border border-white/20" />
    );
  }

  return (
    <div className="relative w-full overflow-hidden rounded-3xl bg-white/10 backdrop-blur-xl border border-white/20 shadow-xl p-6">
      <h2 className="text-xl font-bold text-[#2e2f43] mb-6">Temporada 2025-2026</h2>
      
      <div className="relative flex flex-col gap-8">
        {/* Timeline Line */}
        <div className="absolute left-8 top-0 bottom-0 w-1 bg-[#2e2f43]/10 rounded-full" />

        {levels.map((level, index) => {
          const isUnlocked = currentLevel && level.min_xp <= currentLevel.min_xp;
          const isCurrent = currentLevel?.id === level.id;
          const isNext = !isUnlocked && levels[index - 1]?.id === currentLevel?.id;

          return (
            <motion.div 
              key={level.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.1 }}
              className={`relative flex items-center gap-6 ${isUnlocked ? 'opacity-100' : 'opacity-60 grayscale'}`}
            >
              {/* Badge / Node */}
              <div className={`relative z-10 w-16 h-16 flex-shrink-0 rounded-full border-4 ${isCurrent ? 'border-[#ffba15] shadow-[0_0_15px_rgba(255,186,21,0.5)]' : 'border-white/50'} bg-white flex items-center justify-center overflow-hidden transition-all duration-300`}>
                {level.logo_url ? (
                  <img src={level.logo_url} alt={level.displayName} className="w-12 h-12 object-contain" />
                ) : (
                  <div className="w-full h-full bg-gray-200" />
                )}
                
                {/* Status Indicator */}
                {isUnlocked && !isCurrent && (
                  <div className="absolute inset-0 bg-green-500/20 flex items-center justify-center backdrop-blur-[1px]">
                    <Check className="text-green-600 drop-shadow-md" size={24} strokeWidth={3} />
                  </div>
                )}
                {!isUnlocked && (
                  <div className="absolute inset-0 bg-black/10 flex items-center justify-center backdrop-blur-[1px]">
                    <Lock className="text-gray-500 drop-shadow-md" size={20} />
                  </div>
                )}
              </div>

              {/* Info */}
              <div className="flex-1 bg-white/40 backdrop-blur-md rounded-2xl p-4 border border-white/50 shadow-sm">
                <div className="flex justify-between items-center mb-1">
                  <h3 className={`font-bold text-lg ${isCurrent ? 'text-[#ffba15]' : 'text-[#2e2f43]'}`}>
                    {level.displayName}
                  </h3>
                  <span className="text-xs font-mono text-[#2e2f43]/60 bg-white/50 px-2 py-1 rounded-md">
                    {level.min_xp} XP
                  </span>
                </div>
                
                {isCurrent && (
                  <div className="mt-2 w-full h-2 bg-[#2e2f43]/5 rounded-full overflow-hidden">
                    <motion.div 
                      className="h-full bg-[#ffba15]"
                      initial={{ width: 0 }}
                      animate={{ width: `${progress}%` }}
                      transition={{ duration: 1 }}
                    />
                  </div>
                )}
                
                {isNext && (
                  <p className="text-xs text-[#2e2f43]/60 mt-1">
                    Siguiente objetivo: {level.min_xp} XP
                  </p>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
