import { useState, FormEvent } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      // Pass the raw input (trimmed) to the login function which now handles multiple search strategies
      await login(email.trim(), password);
      navigate('/');
    } catch (err: any) {
      console.error("Error en login:", err);
      setError(err.message || 'Credenciales inválidas');
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] px-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm bg-white/30 backdrop-blur-xl border border-white/40 shadow-xl rounded-3xl p-8"
      >
        <h1 className="text-3xl font-black text-center mb-2 text-[#2e2f43]">
          Mi Mambo
        </h1>
        <p className="text-center text-[#2e2f43]/60 mb-8 font-medium">Bienvenido de nuevo</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-[#2e2f43] uppercase tracking-wider mb-1">Email o ID de Alumno</label>
            <input
              type="text"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoCapitalize="none"
              autoComplete="username"
              autoCorrect="off"
              spellCheck="false"
              className="w-full px-4 py-3 rounded-xl bg-white/50 border border-white/60 text-[#2e2f43] placeholder-[#2e2f43]/30 focus:outline-none focus:ring-2 focus:ring-[#2e2f43]/20 transition-all font-medium"
              placeholder="tu@email.com o ID_1234"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-[#2e2f43] uppercase tracking-wider mb-1">Contraseña</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-white/50 border border-white/60 text-[#2e2f43] placeholder-[#2e2f43]/30 focus:outline-none focus:ring-2 focus:ring-[#2e2f43]/20 transition-all font-medium"
              placeholder="•••••••• (Opcional)"
            />
          </div>

          {error && <p className="text-red-500 text-sm text-center font-bold">{error}</p>}

          <button
            type="submit"
            className="w-full py-3 px-4 bg-[#2e2f43] text-white rounded-xl font-bold shadow-lg shadow-[#2e2f43]/20 hover:shadow-[#2e2f43]/30 transition-all active:scale-95"
          >
            Ingresar
          </button>
        </form>
      </motion.div>
    </div>
  );
}
