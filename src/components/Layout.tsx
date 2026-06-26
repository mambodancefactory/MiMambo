import { Home, Calendar, User, PartyPopper, CreditCard, IdCard, LayoutGrid, Sparkles } from 'lucide-react';
import { Link, useLocation, Outlet } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { motion } from 'motion/react';
import { useAuth } from '@/context/AuthContext';
import { IdCardModal } from './IdCardModal';
import { useState } from 'react';

export default function Layout() {
  const location = useLocation();
  const isHome = location.pathname === '/';

  return (
    <div className="min-h-screen text-gray-800 font-sans pb-24 relative">
      <div className="fixed inset-0 pointer-events-none -z-10 bg-gradient-to-b from-white via-blue-50/30 to-purple-50/50" />
      <main className="max-w-md mx-auto px-4 pb-4 min-h-screen relative">
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
    { icon: LayoutGrid, label: 'INICIO', path: '/' },
    { icon: Calendar, label: 'AGENDA', path: '/classes' },
  ];
  
  const rightNavItems = [
    { icon: PartyPopper, label: 'EVENTOS', path: '/events' },
    { icon: CreditCard, label: 'CUOTAS', path: '/fees' },
  ];

  const renderNavItem = (item: any) => {
    const isActive = location.pathname === item.path;
    return (
      <Link
        key={item.path}
        to={item.path}
        className={cn(
          "flex flex-col items-center justify-center w-16 h-16 transition-all duration-300",
          isActive ? "text-[#2e2f43]" : "text-gray-400 hover:text-gray-600"
        )}
      >
        <item.icon size={24} strokeWidth={isActive ? 2.5 : 2} className="mb-1.5" />
        <span className={cn("text-[9px] font-bold tracking-wide uppercase", isActive ? "text-[#2e2f43]" : "text-gray-400")}>
          {item.label}
        </span>
      </Link>
    );
  };

  return (
    <>
      <div 
        className="fixed bottom-0 left-0 right-0 z-50 bg-white shadow-[0_-10px_40px_-15px_rgba(0,0,0,0.1)]"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="max-w-md mx-auto flex justify-between items-center px-4 relative">
          
          <div className="flex flex-1 justify-around">
            {leftNavItems.map(renderNavItem)}
          </div>

          {/* Central Prominent Button for ID Card */}
          <div className="relative flex justify-center w-20">
            <div className="absolute -top-6">
              <button 
                className="w-[60px] h-[60px] bg-[#2e2f43] rounded-full flex items-center justify-center text-yellow-400 shadow-xl shadow-[#2e2f43]/20 border-[6px] border-white transform transition-transform hover:scale-105 active:scale-95"
                onClick={() => setIsIdModalOpen(true)}
              >
                <Sparkles size={26} strokeWidth={2.5} className="fill-yellow-400 text-yellow-400" />
              </button>
            </div>
          </div>

          <div className="flex flex-1 justify-around">
            {rightNavItems.map(renderNavItem)}
          </div>

        </div>
      </div>
      <IdCardModal isOpen={isIdModalOpen} onClose={() => setIsIdModalOpen(false)} />
    </>
  );
}
