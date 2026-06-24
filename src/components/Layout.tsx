import { Home, Calendar, User, PartyPopper, CreditCard, IdCard } from 'lucide-react';
import { Link, useLocation, Outlet } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { motion } from 'motion/react';
import { useAuth } from '@/context/AuthContext';
import { IdCardModal } from './IdCardModal';
import { useState } from 'react';

export default function Layout() {
  return (
    <div className="min-h-screen bg-white bg-gradient-to-b from-white via-blue-50/30 to-purple-50/50 text-gray-800 font-sans pb-24">
      <main className="max-w-md mx-auto p-4 min-h-screen relative">
        <Outlet />
      </main>
      <BottomDock />
    </div>
  );
}

function BottomDock() {
  const location = useLocation();
  const { user } = useAuth();
  const [isIdModalOpen, setIsIdModalOpen] = useState(false);
  
  const leftNavItems = [
    { icon: Home, label: 'Inicio', path: '/' },
    { icon: Calendar, label: 'Mis Clases', path: '/classes' },
  ];
  
  const rightNavItems = [
    { icon: PartyPopper, label: 'Eventos', path: '/events' },
    { icon: CreditCard, label: 'Cuotas', path: '/fees' },
  ];

  const renderNavItem = (item: any) => {
    const isActive = location.pathname === item.path;
    return (
      <Link
        key={item.path}
        to={item.path}
        className={cn(
          "flex flex-col items-center justify-center w-12 h-12 rounded-2xl transition-all duration-300 relative",
          isActive ? "text-[#2e2f43]" : "text-gray-400 hover:text-gray-600"
        )}
      >
        <item.icon size={22} strokeWidth={isActive ? 2.5 : 2} className={isActive ? "scale-110" : ""} />
        {isActive && (
          <motion.div
            layoutId="active-dot"
            className="absolute -bottom-1 w-1 h-1 bg-[#2e2f43] rounded-full"
          />
        )}
      </Link>
    );
  };

  return (
    <>
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-white/90 backdrop-blur-2xl border-t border-gray-100 shadow-[0_-10px_40px_-15px_rgba(0,0,0,0.1)] pb-safe">
        <div className="max-w-md mx-auto flex justify-between items-center px-6 py-2 relative">
          
          <div className="flex gap-4 sm:gap-6">
            {leftNavItems.map(renderNavItem)}
          </div>

          {/* Central Prominent Button for ID Card */}
          <div className="absolute left-1/2 -translate-x-1/2 -top-6">
            <button 
              className="w-14 h-14 bg-[#2e2f43] rounded-full flex items-center justify-center text-yellow-400 shadow-lg shadow-[#2e2f43]/30 border-4 border-white transform transition-transform hover:scale-105 active:scale-95"
              onClick={() => setIsIdModalOpen(true)}
            >
              <IdCard size={26} strokeWidth={2.5} />
            </button>
          </div>

          <div className="flex gap-4 sm:gap-6">
            {rightNavItems.map(renderNavItem)}
          </div>

        </div>
      </div>
      <IdCardModal isOpen={isIdModalOpen} onClose={() => setIsIdModalOpen(false)} />
    </>
  );
}
