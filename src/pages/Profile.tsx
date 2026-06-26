import React, { useState, useRef } from 'react';
import { GlassCard } from '@/components/GlassCard';
import { useAuth } from '@/context/AuthContext';
import { safeToDate } from '@/hooks/useRecovery';
import { Camera, LogOut, Settings, Upload, Loader2, Link as LinkIcon, X, Search, QrCode, AlertTriangle, Plus, Info, Lock, Shield, CheckCircle, XCircle, ChevronRight, ShieldCheck, MessageSquare, Image as ImageIcon, User, BookOpen } from 'lucide-react';
import { doc, updateDoc, addDoc, collection, serverTimestamp, query, where, getDocs, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Header } from '@/components/Header';
import { motion, AnimatePresence } from 'framer-motion';
import { Scanner } from '@yudiel/react-qr-scanner';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';

export default function Profile() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [uploading, setUploading] = useState(false);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [linkSearchTerm, setLinkSearchTerm] = useState('');
  const [isLinking, setIsLinking] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  
  // Status State
  const [showStatusInfoModal, setShowStatusInfoModal] = useState(false);
  const [showBajaModal, setShowBajaModal] = useState(false); // For Active -> Inactive
  const [showAltaModal, setShowAltaModal] = useState(false); // For Inactive -> Active
  const [showBajaDefinitivaModal, setShowBajaDefinitivaModal] = useState(false); // For Inactive -> Baja Definitiva
  const [bajaObservations, setBajaObservations] = useState('');
  const [isRequestingStatusChange, setIsRequestingStatusChange] = useState(false);

  // Password State
  const [showChangePasswordModal, setShowChangePasswordModal] = useState(false);
  const [passwordForm, setPasswordForm] = useState({ current: '', new: '', confirm: '' });
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  // Permissions State
  const [permissions, setPermissions] = useState({
      normativa: true,
      whatsapp: user?.Permiso_WhatsApp || false,
      imagen: user?.Permiso_Imagen || false
  });
  const [showPermissionWarning, setShowPermissionWarning] = useState<{ type: 'whatsapp' | 'imagen' | null }>({ type: null });

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleTogglePermission = async (type: 'whatsapp' | 'imagen') => {
      if (!user) return;
      
      const currentValue = permissions[type];
      
      // If turning OFF, show warning
      if (currentValue) {
          setShowPermissionWarning({ type });
          return;
      }

      // If turning ON, just do it
      updatePermission(type, true);
  };

  const updatePermission = async (type: 'whatsapp' | 'imagen', value: boolean) => {
      if (!user) return;
      try {
          const userRef = doc(db, 'Alumnos', user.ID_Alumno);
          const field = type === 'whatsapp' ? 'Permiso_WhatsApp' : 'Permiso_Imagen';
          await updateDoc(userRef, { [field]: value });
          
          setPermissions(prev => ({ ...prev, [type]: value }));
          
          // Update local storage user
          const updatedUser = { ...user, [field]: value };
          localStorage.setItem('mi_mambo_user', JSON.stringify(updatedUser));
          
          setShowPermissionWarning({ type: null });
      } catch (error) {
          console.error("Error updating permission:", error);
          alert("Error al actualizar el permiso");
      }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    if (file.size > 5 * 1024 * 1024) {
      alert('La imagen es demasiado grande. Máximo 5MB.');
      return;
    }

    setUploading(true);

    try {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      
      reader.onload = async () => {
        const base64Data = (reader.result as string).split(',')[1];
        const scriptUrl = import.meta.env.VITE_DRIVE_SCRIPT_URL;
        
        if (!scriptUrl) {
          alert('Error de configuración: Falta la URL del script de Drive.');
          setUploading(false);
          return;
        }

        const formData = new FormData();
        formData.append('data', base64Data);
        formData.append('mimeType', file.type);
        formData.append('filename', `${user.ID_Alumno}_${Date.now()}.jpg`);

        const response = await fetch(scriptUrl, {
          method: 'POST',
          body: formData,
        });

        const result = await response.json();

        if (result.status === 'success') {
          const fileIdMatch = result.url.match(/\/d\/(.+)$/);
          const fileId = fileIdMatch ? fileIdMatch[1] : null;
          let finalUrl = result.url;
          if (fileId) {
             finalUrl = `https://drive.google.com/thumbnail?id=${fileId}&sz=w1000`;
          }

          const userRef = doc(db, 'Alumnos', user.ID_Alumno);
          await updateDoc(userRef, {
            Foto_Alumno: finalUrl
          });

          const updatedUser = { ...user, Foto_Alumno: finalUrl };
          localStorage.setItem('mi_mambo_user', JSON.stringify(updatedUser));

          alert('Foto de perfil actualizada correctamente.');
          window.location.reload();
        } else {
          throw new Error(result.message || 'Error en el script de subida');
        }
      };

    } catch (error) {
      console.error("Error uploading photo:", error);
      alert('Error al subir la foto.');
    } finally {
      setUploading(false);
    }
  };

  const handleRequestBajaTemporal = async () => {
    if (!user) return;
    if (!bajaObservations.trim()) {
        alert('Por favor, indica el motivo en el campo de observaciones.');
        return;
    }

    setIsRequestingStatusChange(true);

    try {
      await addDoc(collection(db, 'Solicitudes_Cambio_Estado'), {
        ID_Alumno: user.ID_Alumno,
        Nombre_Alumno: user.Nombre,
        Email_Alumno: user.Email,
        FechaSolicitud: serverTimestamp(),
        EstadoSolicitud: 'Pendiente',
        EstadoActual: user.Estado,
        EstadoSolicitado: 'Inactivo',
        Observaciones: bajaObservations.trim()
      });
      
      alert('Solicitud de cambio a estado Inactivo enviada correctamente.');
      setShowBajaModal(false);
      setBajaObservations('');
    } catch (error) {
      console.error("Error requesting status change:", error);
      alert('Error al enviar la solicitud.');
    } finally {
      setIsRequestingStatusChange(false);
    }
  };

  const handleRequestAlta = async () => {
    if (!user) return;
    setIsRequestingStatusChange(true);
    try {
        await addDoc(collection(db, 'Solicitudes_Cambio_Estado'), {
            ID_Alumno: user.ID_Alumno,
            Nombre_Alumno: user.Nombre,
            Email_Alumno: user.Email,
            FechaSolicitud: serverTimestamp(),
            EstadoSolicitud: 'Pendiente',
            EstadoActual: user.Estado,
            EstadoSolicitado: 'Activo',
            Observaciones: 'Solicitud de reactivación de cuenta'
        });
        alert('Solicitud de reactivación enviada correctamente.');
        setShowAltaModal(false);
    } catch (error) {
        console.error("Error requesting activation:", error);
        alert('Error al enviar la solicitud.');
    } finally {
        setIsRequestingStatusChange(false);
    }
  };

  const handleRequestBajaDefinitiva = async () => {
      if (!user) return;
      setIsRequestingStatusChange(true);
      try {
          await addDoc(collection(db, 'Solicitudes_Cambio_Estado'), {
              ID_Alumno: user.ID_Alumno,
              Nombre_Alumno: user.Nombre,
              Email_Alumno: user.Email,
              FechaSolicitud: serverTimestamp(),
              EstadoSolicitud: 'Pendiente',
              EstadoActual: user.Estado,
              EstadoSolicitado: 'Baja',
              Observaciones: 'Solicitud de baja definitiva desde la app'
          });
          alert('Solicitud de baja definitiva enviada. Lamentamos verte partir.');
          setShowBajaDefinitivaModal(false);
      } catch (error) {
          console.error("Error requesting definitive leave:", error);
          alert('Error al enviar la solicitud.');
      } finally {
          setIsRequestingStatusChange(false);
      }
  };

  const handleChangePassword = async () => {
      if (!user) return;
      if (passwordForm.new !== passwordForm.confirm) {
          alert('Las contraseñas nuevas no coinciden.');
          return;
      }
      if (passwordForm.new.length < 6) {
          alert('La contraseña debe tener al menos 6 caracteres.');
          return;
      }

      setIsChangingPassword(true);
      try {
          // Verify current password (optional, but recommended)
          // Since we don't have a backend auth API for this, we'll check against Firestore
          // assuming there's a 'Password' field.
          const userRef = doc(db, 'Alumnos', user.ID_Alumno);
          const userSnap = await getDoc(userRef);
          
          if (userSnap.exists()) {
              const userData = userSnap.data();
              // Check if Password field exists and matches
              if (userData.Password && userData.Password !== passwordForm.current) {
                  alert('La contraseña actual es incorrecta.');
                  setIsChangingPassword(false);
                  return;
              }
              
              // Update Password
              await updateDoc(userRef, {
                  Password: passwordForm.new
              });
              
              alert('Contraseña actualizada correctamente.');
              setShowChangePasswordModal(false);
              setPasswordForm({ current: '', new: '', confirm: '' });
          }
      } catch (error) {
          console.error("Error changing password:", error);
          alert('Error al cambiar la contraseña.');
      } finally {
          setIsChangingPassword(false);
      }
  };

  const handleLinkProfile = async () => {
    if (!user || !linkSearchTerm.trim()) return;
    
    setIsLinking(true);
    try {
        let targetUser = null;
        const emailQ = query(collection(db, 'Alumnos'), where('Email', '==', linkSearchTerm.trim()));
        const emailSnap = await getDocs(emailQ);
        
        if (!emailSnap.empty) {
            targetUser = { id: emailSnap.docs[0].id, ...emailSnap.docs[0].data() };
        } else {
            const idQ = query(collection(db, 'Alumnos'), where('ID_Alumno', '==', linkSearchTerm.trim()));
            const idSnap = await getDocs(idQ);
            if (!idSnap.empty) {
                targetUser = { id: idSnap.docs[0].id, ...idSnap.docs[0].data() };
            }
        }

        if (!targetUser) {
            alert('Usuario no encontrado. Verifica el Email o ID.');
            setIsLinking(false);
            return;
        }

        if (targetUser.id === user.ID_Alumno) {
            alert('No puedes vincularte a ti mismo.');
            setIsLinking(false);
            return;
        }

        await addDoc(collection(db, 'Solicitudes_Vinculacion'), {
            Email_Destino: targetUser.Email,
            Email_Solicitante: user.Email,
            Estado: 'Pendiente',
            Fecha: new Date().toISOString(),
            ID_Destino: targetUser.id,
            ID_Solicitante: user.ID_Alumno,
            ID_Solicitud: Math.random().toString(36).substring(2, 10)
        });

        alert(`Solicitud enviada a ${targetUser.Nombre || targetUser.Email}`);
        setShowLinkModal(false);
        setLinkSearchTerm('');

    } catch (error) {
        console.error("Error linking profile:", error);
        alert('Error al enviar la solicitud.');
    } finally {
        setIsLinking(false);
    }
  };

  return (
    <div className="space-y-6 pt-0 pb-24 relative" style={{ paddingTop: '0px' }}>
      <Header 
        title="Mi Perfil" 
      />

      {/* Profile Header */}
      <div className="flex flex-col items-center">
        <div className="relative group cursor-pointer" onClick={() => fileInputRef.current?.click()}>
          <div className="w-28 h-28 rounded-full bg-gradient-to-tr from-blue-400 to-purple-400 p-[3px] shadow-xl relative overflow-hidden">
            <img 
              src={user?.Foto_Alumno || `https://ui-avatars.com/api/?name=${user?.Nombre}&background=random`} 
              alt="Profile" 
              className={`w-full h-full rounded-full object-cover border-4 border-white transition-opacity ${uploading ? 'opacity-50' : ''}`}
              referrerPolicy="no-referrer"
            />
            {uploading && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                <Loader2 className="w-8 h-8 text-white animate-spin" />
              </div>
            )}
          </div>
          <button 
            type="button"
            className="absolute bottom-0 right-0 p-2 bg-gray-900 text-white rounded-full shadow-lg hover:bg-gray-800 transition-colors z-10"
          >
            <Camera size={16} />
          </button>
          
          <input 
            type="file" 
            ref={fileInputRef} 
            className="hidden" 
            accept="image/*" 
            onChange={handleFileSelect}
          />
        </div>
        <h2 className="text-xl font-bold text-gray-800 mt-4">{user?.Nombre}</h2>
        <span className={`px-3 py-1 text-xs font-bold rounded-full mt-2 uppercase tracking-wide ${user?.Estado === 'Activo' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
          {user?.Estado}
        </span>
        <p className="text-xs text-gray-400 mt-2">Toca la foto para cambiarla</p>
      </div>

      {/* Student Details Card */}
      <GlassCard className="p-6">
        <div className="flex items-center gap-3 mb-4">
            <div className="bg-purple-100 p-2 rounded-lg text-purple-600">
            <User size={20} />
            </div>
            <div>
            <h3 className="font-bold text-gray-800">Datos Personales</h3>
            <p className="text-xs text-gray-500">Información registrada</p>
            </div>
        </div>
        
        <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
            <div>
                <p className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Nombre Completo</p>
                <p className="text-sm font-bold text-[#2e2f43]">{user?.Nombre}</p>
            </div>
            <div>
                <p className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">ID Alumno</p>
                <p className="text-sm font-bold text-[#2e2f43]">{user?.ID_Alumno}</p>
            </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
            <div>
                <p className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Email</p>
                <p className="text-sm font-bold text-[#2e2f43] break-all">{user?.Email}</p>
            </div>
            <div>
                <p className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Teléfono</p>
                <p className="text-sm font-bold text-[#2e2f43]">{user?.Telefono || 'No registrado'}</p>
            </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
            <div>
                <p className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">DNI/NIE</p>
                <p className="text-sm font-bold text-[#2e2f43]">{user?.DNI || 'No registrado'}</p>
            </div>
            <div>
                <p className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Fecha Nacimiento</p>
                <p className="text-sm font-bold text-[#2e2f43]">
                    {user?.Fecha_Nacimiento ? (
                        typeof user.Fecha_Nacimiento === 'string' ? (
                            user.Fecha_Nacimiento.includes('T') ? user.Fecha_Nacimiento.split('T')[0] : user.Fecha_Nacimiento
                        ) : 'No registrada'
                    ) : 'No registrada'}
                </p>
            </div>
            </div>
        </div>
      </GlassCard>

      {/* Bolsa de Recuperaciones */}
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 mb-4">
        <div className="flex items-center gap-3 mb-4">
            <div className="bg-purple-100 p-2 rounded-lg text-purple-600">
                <Search size={20} />
            </div>
            <div>
                <h3 className="font-bold text-gray-800">Bolsa de Recuperaciones</h3>
                <p className="text-xs text-gray-500">Tickets disponibles para recuperar clases</p>
            </div>
        </div>

        {(() => {
            const hoy = new Date();
            const tickets = user?.bolsaRecuperaciones?.filter((ticket: any) => 
                ticket.usado === false && safeToDate(ticket.caducidad) >= hoy
            ) || [];

            if (tickets.length === 0) {
                return (
                    <div className="text-center p-6 bg-gray-50 rounded-xl border border-gray-100">
                        <p className="text-sm font-medium text-gray-500">No tienes tickets de recuperación disponibles.</p>
                    </div>
                );
            }

            return (
                <div className="space-y-3">
                    {tickets.map((ticket: any, index: number) => (
                        <div key={ticket.idAsistencia || index} className="p-4 bg-gray-50 rounded-xl border border-gray-200">
                            <div className="flex justify-between items-start mb-2">
                                <span className="text-xs font-black uppercase tracking-wider text-purple-600 bg-purple-100 px-2 py-1 rounded-md">
                                    {ticket.disciplina}
                                </span>
                                <span className="text-[10px] font-bold text-gray-400">
                                    Vence: {safeToDate(ticket.caducidad).toLocaleDateString('es-ES')}
                                </span>
                            </div>
                            <div className="flex items-center justify-between">
                                <p className="text-sm font-bold text-gray-800">{ticket.nivel}</p>
                                <p className="text-xs font-medium text-gray-600 capitalize">{ticket.modalidad}</p>
                            </div>
                        </div>
                    ))}
                </div>
            );
        })()}
      </div>

      {/* Actions */}
      <div className="space-y-4">
        {/* Añadir Curso Card */}
        <div className="bg-white rounded-[2.5rem] p-6 shadow-xl border border-gray-100/50 flex flex-col items-center justify-center text-center relative overflow-hidden">
          <div className="absolute top-0 inset-x-0 h-2 bg-[#ffba15]" />
          <div className="w-12 h-12 rounded-2xl bg-amber-50 flex items-center justify-center text-[#ffba15] mb-3">
            <BookOpen size={22} />
          </div>
          <h3 className="font-black text-[#2e2f43] uppercase tracking-wider text-xs mb-1">Inscribirse en Curso</h3>
          <p className="text-xs text-gray-500 mb-4 max-w-[240px] font-medium leading-relaxed">
            Inscríbete en nuevos cursos de salsa, bachata y otros estilos disponibles en la escuela.
          </p>
          <button 
            onClick={() => navigate('/courses')}
            className="w-full py-3.5 bg-[#2e2f43] hover:bg-[#2e2f43]/95 text-[#ffba15] rounded-2xl font-black text-xs uppercase tracking-widest transition-all shadow-md active:scale-[0.98] flex items-center justify-center gap-2"
          >
            <Plus size={14} />
            Explorar y Añadir Curso
          </button>
        </div>

        {/* Link Profile */}
        <button 
          onClick={() => setShowLinkModal(true)}
          className="w-full py-6 border-2 border-dashed border-gray-300 rounded-2xl flex flex-col items-center justify-center text-gray-400 hover:border-blue-400 hover:text-blue-500 hover:bg-blue-50/50 transition-all group gap-2"
        >
            <div className="bg-gray-100 p-3 rounded-full group-hover:bg-blue-100 transition-colors">
                <Plus size={24} className="text-gray-400 group-hover:text-blue-500 transition-colors" />
            </div>
            <span className="font-medium text-sm">Vincular Perfil</span>
        </button>

        {/* Status Management Card */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
            <div className="flex justify-between items-start mb-4">
                <div>
                    <h3 className="text-lg font-bold text-gray-800">Estado de Cuenta</h3>
                    <p className="text-xs text-gray-500">Gestiona tu estado en la academia</p>
                </div>
                <button onClick={() => setShowStatusInfoModal(true)} className="text-blue-500 hover:bg-blue-50 p-2 rounded-full transition-colors">
                    <Info size={20} />
                </button>
            </div>

            <div className={`p-4 rounded-xl mb-4 flex items-center gap-3 ${user?.Estado === 'Activo' ? 'bg-green-50 border border-green-100' : 'bg-gray-50 border border-gray-100'}`}>
                {user?.Estado === 'Activo' ? (
                    <CheckCircle className="text-green-500" size={24} />
                ) : (
                    <XCircle className="text-gray-400" size={24} />
                )}
                <div>
                    <p className={`font-bold ${user?.Estado === 'Activo' ? 'text-green-700' : 'text-gray-600'}`}>
                        {user?.Estado === 'Activo' ? 'Cuenta Activa' : 'Cuenta Inactiva'}
                    </p>
                    <p className="text-xs text-gray-500">
                        {user?.Estado === 'Activo' ? 'Tienes acceso completo a tus clases.' : 'Tu cuenta está en mantenimiento.'}
                    </p>
                </div>
            </div>

            <div className="space-y-2">
                <button 
                    onClick={() => user?.Estado === 'Activo' ? setShowBajaModal(true) : setShowAltaModal(true)}
                    className="w-full py-3 bg-gray-900 text-white rounded-xl font-bold hover:bg-gray-800 transition-colors flex justify-between items-center px-4"
                >
                    <span>Solicitar cambio a {user?.Estado === 'Activo' ? 'Inactivo' : 'Activo'}</span>
                    <ChevronRight size={16} />
                </button>
                
                {user?.Estado !== 'Activo' && (
                    <button 
                        onClick={() => setShowBajaDefinitivaModal(true)}
                        className="w-full py-3 bg-red-50 text-red-600 rounded-xl font-bold hover:bg-red-100 transition-colors flex justify-between items-center px-4 border border-red-100"
                    >
                        <span>Solicitar Baja Definitiva</span>
                        <AlertTriangle size={16} />
                    </button>
                )}
            </div>
        </div>

        {/* Change Password Card */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
            <div className="flex items-center gap-3 mb-4">
                <div className="bg-orange-100 p-2 rounded-lg text-orange-600">
                    <Lock size={20} />
                </div>
                <div>
                    <h3 className="font-bold text-gray-800">Seguridad</h3>
                    <p className="text-xs text-gray-500">Gestiona tu contraseña</p>
                </div>
            </div>
            <button 
                onClick={() => setShowChangePasswordModal(true)}
                className="w-full py-3 bg-gray-50 text-gray-700 rounded-xl font-bold hover:bg-gray-100 transition-colors border border-gray-200"
            >
                Cambiar Contraseña
            </button>
        </div>

        {/* Permissions Card */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
            <div className="flex items-center gap-3 mb-4">
                <div className="bg-blue-100 p-2 rounded-lg text-blue-600">
                    <Shield size={20} />
                </div>
                <div>
                    <h3 className="font-bold text-gray-800">Permisos y Privacidad</h3>
                    <p className="text-xs text-gray-500">Gestiona tus consentimientos</p>
                </div>
            </div>

            <div className="space-y-4">
                {/* Normativa - Mandatory & Locked */}
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-100 opacity-80">
                    <div className="flex items-center gap-3">
                        <div className="text-green-600">
                            <ShieldCheck size={20} />
                        </div>
                        <div>
                            <p className="text-xs font-bold text-[#2e2f43]">Normativa de la Escuela</p>
                            <p className="text-[10px] text-gray-500">Aceptada durante la inscripción</p>
                        </div>
                    </div>
                    <Lock size={14} className="text-gray-400" />
                </div>

                {/* WhatsApp - Toggleable but locked when active */}
                <div className="flex items-center justify-between p-3 bg-white rounded-xl border border-gray-100">
                    <div className="flex items-center gap-3">
                        <div className={cn("transition-colors", permissions.whatsapp ? "text-green-600" : "text-gray-400")}>
                            <MessageSquare size={20} />
                        </div>
                        <div>
                            <p className="text-xs font-bold text-[#2e2f43]">Comunidad de WhatsApp</p>
                            <p className="text-[10px] text-gray-500">Acceso a grupos y contenido de clase</p>
                        </div>
                    </div>
                    <button 
                        onClick={() => handleTogglePermission('whatsapp')}
                        className={cn(
                            "w-10 h-6 rounded-full transition-all relative flex items-center px-1",
                            permissions.whatsapp ? "bg-green-500" : "bg-gray-200"
                        )}
                    >
                        <motion.div 
                            animate={{ x: permissions.whatsapp ? 16 : 0 }}
                            className="w-4 h-4 bg-white rounded-full shadow-sm flex items-center justify-center"
                        >
                            {permissions.whatsapp && <Lock size={8} className="text-green-500" />}
                        </motion.div>
                    </button>
                </div>

                {/* Image Rights - Toggleable but locked when active */}
                <div className="flex items-center justify-between p-3 bg-white rounded-xl border border-gray-100">
                    <div className="flex items-center gap-3">
                        <div className={cn("transition-colors", permissions.imagen ? "text-blue-600" : "text-gray-400")}>
                            <ImageIcon size={20} />
                        </div>
                        <div className="flex-1 pr-2">
                            <p className="text-xs font-bold text-[#2e2f43]">Derechos de Imagen</p>
                            <p className="text-[10px] text-gray-500 leading-tight">Uso de fotos/vídeos en redes y archivo de la escuela</p>
                        </div>
                    </div>
                    <button 
                        onClick={() => handleTogglePermission('imagen')}
                        className={cn(
                            "w-10 h-6 rounded-full transition-all relative flex items-center px-1",
                            permissions.imagen ? "bg-blue-500" : "bg-gray-200"
                        )}
                    >
                        <motion.div 
                            animate={{ x: permissions.imagen ? 16 : 0 }}
                            className="w-4 h-4 bg-white rounded-full shadow-sm flex items-center justify-center"
                        >
                            {permissions.imagen && <Lock size={8} className="text-blue-500" />}
                        </motion.div>
                    </button>
                </div>
            </div>
            
            <div className="mt-4 p-3 bg-blue-50/50 rounded-xl border border-blue-100/50">
                <p className="text-[10px] text-blue-700 leading-relaxed italic">
                    * Tu foto de perfil se utiliza también en el sistema de registro de asistencia de la recepción.
                </p>
            </div>
        </div>

        {/* Logout Button */}
        <button 
            onClick={logout}
            className="w-full py-4 bg-red-500 text-white rounded-2xl font-bold shadow-lg shadow-red-500/30 hover:bg-red-600 transition-colors flex justify-center items-center gap-2"
        >
            <LogOut size={20} />
            Cerrar Sesión
        </button>
      </div>

      {/* Link Profile Modal */}
      <AnimatePresence>
        {showLinkModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={() => setShowLinkModal(false)}>
                <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    className="bg-white rounded-3xl p-6 shadow-2xl max-w-sm w-full border border-white/50 relative overflow-hidden"
                    onClick={e => e.stopPropagation()}
                >
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="text-xl font-bold text-[#2e2f43]">Vincular Perfil</h3>
                        <button onClick={() => setShowLinkModal(false)} className="p-2 bg-gray-100 rounded-full text-gray-500 hover:bg-gray-200">
                            <X size={18} />
                        </button>
                    </div>

                    <div className="space-y-4">
                        <p className="text-sm text-gray-500">
                            Introduce el Email o ID del alumno con el que quieres vincular tu cuenta, o escanea su código QR.
                        </p>
                        
                        {showScanner ? (
                            <div className="rounded-2xl overflow-hidden border border-gray-200 relative">
                                <Scanner 
                                    onScan={(result) => {
                                        if (result && result.length > 0) {
                                            setLinkSearchTerm(result[0].rawValue);
                                            setShowScanner(false);
                                        }
                                    }}
                                    onError={(error: any) => {
                                        if (error?.name === 'AbortError' || error?.message?.includes('interrupted')) return;
                                        console.error(error);
                                        if (error?.name === 'NotAllowedError') {
                                            alert('No se ha podido acceder a la cámara.');
                                        } else {
                                            alert('Error al acceder a la cámara.');
                                        }
                                        setShowScanner(false);
                                    }}
                                />
                                <button 
                                    onClick={() => setShowScanner(false)}
                                    className="absolute top-2 right-2 p-2 bg-black/50 text-white rounded-full hover:bg-black/70"
                                >
                                    <X size={16} />
                                </button>
                            </div>
                        ) : (
                            <button 
                                onClick={() => setShowScanner(true)}
                                className="w-full py-3 bg-gray-100 text-gray-700 rounded-xl font-bold hover:bg-gray-200 flex items-center justify-center gap-2 transition-colors"
                            >
                                <QrCode size={20} />
                                Escanear QR
                            </button>
                        )}

                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                            <input 
                                type="text" 
                                placeholder="Email o ID de Alumno"
                                value={linkSearchTerm}
                                onChange={(e) => setLinkSearchTerm(e.target.value)}
                                className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                            />
                        </div>

                        <button 
                            onClick={handleLinkProfile}
                            disabled={isLinking || !linkSearchTerm.trim()}
                            className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold shadow-lg shadow-blue-500/30 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-2"
                        >
                            {isLinking ? (
                                <>
                                    <Loader2 size={18} className="animate-spin" />
                                    Buscando...
                                </>
                            ) : (
                                'Enviar Solicitud'
                            )}
                        </button>
                    </div>
                </motion.div>
            </div>
        )}
      </AnimatePresence>

      {/* Status Info Modal */}
      <AnimatePresence>
        {showStatusInfoModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={() => setShowStatusInfoModal(false)}>
                <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    className="bg-white rounded-3xl p-6 shadow-2xl max-w-sm w-full border border-white/50 relative overflow-hidden"
                    onClick={e => e.stopPropagation()}
                >
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="text-xl font-bold text-[#2e2f43]">Información de Estados</h3>
                        <button onClick={() => setShowStatusInfoModal(false)} className="p-2 bg-gray-100 rounded-full text-gray-500 hover:bg-gray-200">
                            <X size={18} />
                        </button>
                    </div>
                    <div className="space-y-4">
                        <div className="bg-green-50 p-4 rounded-xl border border-green-100">
                            <h4 className="font-bold text-green-800 mb-1 flex items-center gap-2"><CheckCircle size={16}/> Activo</h4>
                            <p className="text-xs text-green-700">Acceso completo a clases, reserva de plaza y pago de cuota mensual completa.</p>
                        </div>
                        <div className="bg-gray-50 p-4 rounded-xl border border-gray-200">
                            <h4 className="font-bold text-gray-800 mb-1 flex items-center gap-2"><Shield size={16}/> Inactivo (Mantenimiento)</h4>
                            <p className="text-xs text-gray-600">Cuota reducida (10€/mes). Conservas tu plaza pero no tienes acceso a clases. Ideal para bajas temporales.</p>
                        </div>
                        <div className="bg-red-50 p-4 rounded-xl border border-red-100">
                            <h4 className="font-bold text-red-800 mb-1 flex items-center gap-2"><XCircle size={16}/> Baja Definitiva</h4>
                            <p className="text-xs text-red-700">Pierdes tu plaza y tu historial. Para volver tendrás que pagar matrícula de nuevo.</p>
                        </div>
                    </div>
                </motion.div>
            </div>
        )}
      </AnimatePresence>

      {/* Baja Temporal Modal (Active -> Inactive) */}
      <AnimatePresence>
        {showBajaModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={() => setShowBajaModal(false)}>
                <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    className="bg-white rounded-3xl p-6 shadow-2xl max-w-sm w-full border border-white/50 relative overflow-hidden"
                    onClick={e => e.stopPropagation()}
                >
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="text-xl font-bold text-[#2e2f43]">Solicitar Cambio a Inactivo</h3>
                        <button onClick={() => setShowBajaModal(false)} className="p-2 bg-gray-100 rounded-full text-gray-500 hover:bg-gray-200">
                            <X size={18} />
                        </button>
                    </div>

                    <div className="space-y-4">
                        <div className="bg-yellow-50 border border-yellow-100 rounded-2xl p-4 flex gap-3">
                            <AlertTriangle className="text-yellow-600 shrink-0" size={24} />
                            <p className="text-xs text-yellow-800 leading-relaxed">
                                Tu próxima cuota se convertirá en una <strong>cuota de mantenimiento (10€/mes)</strong>. Conservarás tu plaza pero no podrás asistir a clases hasta reactivar tu cuenta.
                            </p>
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                                Observaciones (Obligatorio)
                            </label>
                            <textarea 
                                value={bajaObservations}
                                onChange={(e) => setBajaObservations(e.target.value)}
                                placeholder="Indica el motivo..."
                                className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm min-h-[100px]"
                            />
                        </div>

                        <div className="flex gap-3 pt-2">
                            <button 
                                onClick={() => setShowBajaModal(false)}
                                className="flex-1 py-3 bg-gray-100 text-gray-600 rounded-xl font-bold hover:bg-gray-200 transition-colors"
                            >
                                Cancelar
                            </button>
                            <button 
                                onClick={handleRequestBajaTemporal}
                                disabled={isRequestingStatusChange || !bajaObservations.trim()}
                                className="flex-1 py-3 bg-gray-900 text-white rounded-xl font-bold shadow-lg hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-2"
                            >
                                {isRequestingStatusChange ? <Loader2 size={18} className="animate-spin" /> : 'Confirmar'}
                            </button>
                        </div>
                    </div>
                </motion.div>
            </div>
        )}
      </AnimatePresence>

      {/* Alta Modal (Inactive -> Active) */}
      <AnimatePresence>
        {showAltaModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={() => setShowAltaModal(false)}>
                <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    className="bg-white rounded-3xl p-6 shadow-2xl max-w-sm w-full border border-white/50 relative overflow-hidden"
                    onClick={e => e.stopPropagation()}
                >
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="text-xl font-bold text-[#2e2f43]">Solicitar Reactivación</h3>
                        <button onClick={() => setShowAltaModal(false)} className="p-2 bg-gray-100 rounded-full text-gray-500 hover:bg-gray-200">
                            <X size={18} />
                        </button>
                    </div>

                    <div className="space-y-4">
                        <p className="text-sm text-gray-600">
                            ¿Deseas solicitar la reactivación de tu cuenta? Volverás a tener acceso a las clases y se aplicará tu cuota mensual estándar en el próximo ciclo.
                        </p>

                        <div className="flex gap-3 pt-2">
                            <button 
                                onClick={() => setShowAltaModal(false)}
                                className="flex-1 py-3 bg-gray-100 text-gray-600 rounded-xl font-bold hover:bg-gray-200 transition-colors"
                            >
                                Cancelar
                            </button>
                            <button 
                                onClick={handleRequestAlta}
                                disabled={isRequestingStatusChange}
                                className="flex-1 py-3 bg-green-600 text-white rounded-xl font-bold shadow-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-2"
                            >
                                {isRequestingStatusChange ? <Loader2 size={18} className="animate-spin" /> : 'Confirmar'}
                            </button>
                        </div>
                    </div>
                </motion.div>
            </div>
        )}
      </AnimatePresence>

      {/* Baja Definitiva Modal */}
      <AnimatePresence>
        {showBajaDefinitivaModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={() => setShowBajaDefinitivaModal(false)}>
                <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    className="bg-white rounded-3xl p-6 shadow-2xl max-w-sm w-full border border-white/50 relative overflow-hidden"
                    onClick={e => e.stopPropagation()}
                >
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="text-xl font-bold text-red-600">Baja Definitiva</h3>
                        <button onClick={() => setShowBajaDefinitivaModal(false)} className="p-2 bg-gray-100 rounded-full text-gray-500 hover:bg-gray-200">
                            <X size={18} />
                        </button>
                    </div>

                    <div className="space-y-4">
                        <div className="bg-red-50 border border-red-100 rounded-2xl p-4 flex gap-3">
                            <AlertTriangle className="text-red-600 shrink-0" size={24} />
                            <p className="text-xs text-red-800 leading-relaxed">
                                <strong>¡Atención!</strong> Esta acción solicitará la baja definitiva de tu cuenta. Perderás tu plaza y historial. Si deseas volver en el futuro, deberás abonar la matrícula nuevamente.
                            </p>
                        </div>

                        <div className="flex gap-3 pt-2">
                            <button 
                                onClick={() => setShowBajaDefinitivaModal(false)}
                                className="flex-1 py-3 bg-gray-100 text-gray-600 rounded-xl font-bold hover:bg-gray-200 transition-colors"
                            >
                                Cancelar
                            </button>
                            <button 
                                onClick={handleRequestBajaDefinitiva}
                                disabled={isRequestingStatusChange}
                                className="flex-1 py-3 bg-red-600 text-white rounded-xl font-bold shadow-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-2"
                            >
                                {isRequestingStatusChange ? <Loader2 size={18} className="animate-spin" /> : 'Confirmar Baja'}
                            </button>
                        </div>
                    </div>
                </motion.div>
            </div>
        )}
      </AnimatePresence>

      {/* Change Password Modal */}
      <AnimatePresence>
        {showChangePasswordModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={() => setShowChangePasswordModal(false)}>
                <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    className="bg-white rounded-3xl p-6 shadow-2xl max-w-sm w-full border border-white/50 relative overflow-hidden"
                    onClick={e => e.stopPropagation()}
                >
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="text-xl font-bold text-[#2e2f43]">Cambiar Contraseña</h3>
                        <button onClick={() => setShowChangePasswordModal(false)} className="p-2 bg-gray-100 rounded-full text-gray-500 hover:bg-gray-200">
                            <X size={18} />
                        </button>
                    </div>

                    <div className="space-y-4">
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Contraseña Actual</label>
                            <input 
                                type="password"
                                value={passwordForm.current}
                                onChange={(e) => setPasswordForm({...passwordForm, current: e.target.value})}
                                className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Nueva Contraseña</label>
                            <input 
                                type="password"
                                value={passwordForm.new}
                                onChange={(e) => setPasswordForm({...passwordForm, new: e.target.value})}
                                className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Confirmar Contraseña</label>
                            <input 
                                type="password"
                                value={passwordForm.confirm}
                                onChange={(e) => setPasswordForm({...passwordForm, confirm: e.target.value})}
                                className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                            />
                        </div>

                        <button 
                            onClick={handleChangePassword}
                            disabled={isChangingPassword || !passwordForm.current || !passwordForm.new || !passwordForm.confirm}
                            className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold shadow-lg shadow-blue-500/30 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-2 mt-2"
                        >
                            {isChangingPassword ? <Loader2 size={18} className="animate-spin" /> : 'Actualizar Contraseña'}
                        </button>
                    </div>
                </motion.div>
            </div>
        )}
      </AnimatePresence>

      {/* Permission Warning Modal */}
      <AnimatePresence>
        {showPermissionWarning.type && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={() => setShowPermissionWarning({ type: null })}>
                <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    className="bg-white rounded-3xl p-6 shadow-2xl max-w-sm w-full border border-white/50 relative overflow-hidden"
                    onClick={e => e.stopPropagation()}
                >
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="text-xl font-bold text-[#2e2f43]">Desactivar Permiso</h3>
                        <button onClick={() => setShowPermissionWarning({ type: null })} className="p-2 bg-gray-100 rounded-full text-gray-500 hover:bg-gray-200">
                            <X size={18} />
                        </button>
                    </div>

                    <div className="space-y-4">
                        <div className="bg-red-50 border border-red-100 rounded-2xl p-4 flex gap-3">
                            <AlertTriangle className="text-red-600 shrink-0" size={24} />
                            <p className="text-xs text-red-800 leading-relaxed">
                                {showPermissionWarning.type === 'whatsapp' ? (
                                    "Si desactivas este permiso, podrías ser eliminado de los grupos de WhatsApp de tus clases y dejar de recibir contenido importante y avisos de última hora."
                                ) : (
                                    "Si desactivas este permiso, no podremos incluir tus fotos o vídeos en el archivo de la escuela ni en nuestras redes sociales, incluso en momentos de social dance o eventos."
                                )}
                            </p>
                        </div>

                        <p className="text-sm text-gray-600">¿Estás seguro de que deseas desactivar este permiso?</p>

                        <div className="flex gap-3 pt-2">
                            <button 
                                onClick={() => setShowPermissionWarning({ type: null })}
                                className="flex-1 py-3 bg-gray-100 text-gray-600 rounded-xl font-bold hover:bg-gray-200 transition-colors"
                            >
                                Cancelar
                            </button>
                            <button 
                                onClick={() => updatePermission(showPermissionWarning.type!, false)}
                                className="flex-1 py-3 bg-red-600 text-white rounded-xl font-bold shadow-lg hover:bg-red-700 transition-all"
                            >
                                Sí, desactivar
                            </button>
                        </div>
                    </div>
                </motion.div>
            </div>
        )}
      </AnimatePresence>
    </div>
  );
}
