import React, { useState } from 'react';
import { Fingerprint, ShieldCheck, Lock, User, Mail, Loader2, ArrowLeft, ScanFace } from 'lucide-react';
import AntiBotCaptcha from '../components/AntiBotCaptcha';
import FacialModal from '../components/FacialModal'; // <--- Importamos el componente
import { promptGoogleAccountSelection } from '../services/googleAuthService';
import './Login.css';
import { loginWithCredentials } from '../services/recognitionApi';

interface LoginProps {
  onLoginSuccess: (userData: { name: string; role: string }) => void;
  onBackToHome: () => void;
}

export default function Login({ onLoginSuccess, onBackToHome }: LoginProps) {
  const [isRegistering, setIsRegistering] = useState(false);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isHumanVerified, setIsHumanVerified] = useState(false);
  
  // Estado para controlar la ventana modal de biometría facial
  const [showFacialModal, setShowFacialModal] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!isHumanVerified) {
      setError('Por favor, complete la verificación anti-bot correctamente.');
      return;
    }

    setIsLoading(true);

    try {
      if (isRegistering) {
        setError('El registro de cuentas debe realizarse mediante Supabase Auth antes de iniciar sesión.');
        return;
      }

      const result = await loginWithCredentials(username, password);
      const userData = { name: result.nombre, role: result.role };
      localStorage.setItem('veris_session', JSON.stringify(userData));
      localStorage.setItem('veris_access_token', result.access_token);
      onLoginSuccess(userData);
    } catch (err: any) {
      setError(err?.message || 'No se pudo validar la sesión con Supabase.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError('');
    try {
      setIsLoading(true);
      const googleAccount = await promptGoogleAccountSelection();
      
      const userData = { 
        name: googleAccount.name, 
        role: 'Operador Google Workspace' 
      };

      localStorage.setItem('veris_session', JSON.stringify(userData));
      setIsLoading(false);
      onLoginSuccess(userData);
    } catch (err: any) {
      setIsLoading(false);
      if (err.message && !err.message.includes('cancelado')) {
        setError(err.message);
      }
    }
  };

  // Abre el modal de biometría facial
  const handleFacialLogin = () => {
    setError('');
    setShowFacialModal(true);
  };

  const handleFacialSuccess = (userData: { name: string; role: string }) => {
    localStorage.setItem('veris_session', JSON.stringify(userData));
    setShowFacialModal(false);
    onLoginSuccess(userData);
  };

  return (
    <div className="login-container">
      <div className="login-card">
        
        <div className="login-header-top">
          <div className="login-icon-box">
            <Fingerprint size={26} strokeWidth={2.2} />
          </div>
          <button type="button" onClick={onBackToHome} className="login-back-btn">
            <ArrowLeft size={14} /> Volver al inicio
          </button>
        </div>

        <div className="login-titles">
          <h1>{isRegistering ? 'Crear Nueva Cuenta' : 'Panel de Acceso'}</h1>
          <p>{isRegistering ? 'Regístrese para solicitar autorización en el sistema.' : 'Autenticación corporativa para control y gestión de identidades.'}</p>
        </div>

        <div className="login-tabs">
          <button 
            type="button" 
            onClick={() => { setIsRegistering(false); setError(''); }}
            className={`login-tab-btn ${!isRegistering ? 'active' : ''}`}
          >
            Iniciar Sesión
          </button>
          <button 
            type="button" 
            onClick={() => { setIsRegistering(true); setError(''); }}
            className={`login-tab-btn ${isRegistering ? 'active' : ''}`}
          >
            Registrarse
          </button>
        </div>

        {error && (
          <div className="login-error">
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#f87171' }} />
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="login-form-group">
            <label className="login-label">Correo electrónico de Supabase</label>
            <div className="login-input-wrapper">
              <span className="login-input-icon"><User size={16} /></span>
              <input 
                type="text" 
                value={username} 
                onChange={(e) => setUsername(e.target.value)}
                placeholder="correo@empresa.com"
                className="login-input"
                required
                disabled={isLoading}
              />
            </div>
          </div>

          {isRegistering && (
            <div className="login-form-group">
              <label className="login-label">Correo Electrónico</label>
              <div className="login-input-wrapper">
                <span className="login-input-icon"><Mail size={16} /></span>
                <input 
                  type="email" 
                  value={email} 
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="correo@empresa.com"
                  className="login-input"
                  required
                  disabled={isLoading}
                />
              </div>
            </div>
          )}

          <div className="login-form-group">
            <label className="login-label">Contraseña</label>
            <div className="login-input-wrapper">
              <span className="login-input-icon"><Lock size={16} /></span>
              <input 
                type="password" 
                value={password} 
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="login-input"
                required
                disabled={isLoading}
              />
            </div>
          </div>

          <AntiBotCaptcha onVerified={setIsHumanVerified} />

          <button type="submit" disabled={isLoading} className="login-submit-btn">
            {isLoading ? (
              <><Loader2 size={18} className="animate-spin" /> Procesando...</>
            ) : isRegistering ? (
              'Registrar Cuenta'
            ) : (
              'Iniciar Sesión'
            )}
          </button>
        </form>

        {!isRegistering && (
          <>
            <div className="login-divider">
              <span>o continuar con</span>
            </div>

            <button 
              type="button" 
              onClick={handleGoogleLogin}
              disabled={isLoading}
              className="login-google-btn"
            >
              <svg width="16" height="16" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z"/>
                <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.13 0-5.78-2.11-6.73-4.96H1.18v3.15C3.15 21.32 7.22 24 12 24z"/>
                <path fill="#FBBC05" d="M5.27 14.24c-.25-.72-.38-1.49-.38-2.24s.13-1.52.38-2.24V6.6H1.18C.43 8.13 0 9.87 0 12s.43 3.87 1.18 5.4l4.09-3.16z"/>
                <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.22 0 3.15 2.68 1.18 6.6l4.09 3.15c.95-2.85 3.6-4.96 6.73-4.96z"/>
              </svg>
              Continuar con Google
            </button>

            <button 
              type="button" 
              onClick={handleFacialLogin}
              disabled={isLoading}
              className="login-facial-btn"
            >
              <ScanFace size={18} /> Biometría Facial
            </button>
          </>
        )}

        <div className="login-footer">
          <ShieldCheck size={14} style={{ color: '#10b981' }} />
          <span>Seguridad corporativa cifrada</span>
        </div>

      </div>

      {/* Renderizado condicional del modal de Biometría Facial */}
      {showFacialModal && (
        <FacialModal 
          onClose={() => setShowFacialModal(false)}
          onSuccess={handleFacialSuccess}
        />
      )}
    </div>
  );
}