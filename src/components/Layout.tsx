import { Home, Calendar, User, PartyPopper, CreditCard } from 'lucide-react';
import { Link, useLocation, Outlet } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { motion } from 'motion/react';
import { useAuth } from '@/context/AuthContext';

export default function Layout() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 text-gray-800 font-sans pb-24">
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
  
  const navItems = [
    { icon: Home, label: 'Inicio', path: '/' },
    { icon: Calendar, label: 'Mis Clases', path: '/classes' },
    { icon: PartyPopper, label: 'Eventos', path: '/events' },
    { icon: CreditCard, label: 'Cuotas', path: '/fees' },
    { icon: User, label: 'Perfil', path: '/profile' },
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-2xl border-t border-white/40 shadow-[0_-10px_40px_-15px_rgba(0,0,0,0.1)]">
      <div className="max-w-md mx-auto flex justify-around items-center px-2 py-3">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          
          return (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                "flex flex-col items-center justify-center w-12 h-12 rounded-2xl transition-all duration-300 relative",
                isActive ? "text-[#2e2f43] scale-110" : "text-gray-400 hover:text-gray-600"
              )}
            >
              <item.icon size={22} strokeWidth={isActive ? 2.5 : 2} />
              {isActive && (
                <motion.div
                  layoutId="active-dot"
                  className="absolute -bottom-1 w-1 h-1 bg-[#2e2f43] rounded-full"
                />
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
