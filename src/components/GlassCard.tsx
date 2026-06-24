import { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { motion } from 'motion/react';

interface CardProps {
  children: ReactNode;
  className?: string;
  title?: string;
  key?: any;
}

export function GlassCard({ children, className, title }: CardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className={cn(
        "bg-white/40 backdrop-blur-md border border-white/50 shadow-lg rounded-2xl p-5 relative overflow-hidden",
        className
      )}
    >
      {/* Subtle shine effect */}
      <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-white/40 to-transparent pointer-events-none" />
      
      {title && <h3 className="text-lg font-semibold text-gray-800 mb-3 relative z-10">{title}</h3>}
      <div className="relative z-10">{children}</div>
    </motion.div>
  );
}
