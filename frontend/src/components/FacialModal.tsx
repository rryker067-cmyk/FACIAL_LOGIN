import { useState, useRef, useEffect } from 'react';
import { Camera, CameraOff, X, CheckCircle, AlertCircle, Loader2, UserPlus, LogIn, ShieldCheck, Zap } from 'lucide-react';
import { loginWithFace, registerUserWithFace } from '../services/recognitionApi';
import './FacialModal.css';

interface FacialModalProps {
  onClose: () => void;
  onSuccess: (userData: { name: string; role: string }) => void;
}

export default function FacialModal({ onClose, onSuccess }: FacialModalProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [cameraActive, setCameraActive] = useState(true);
  
  // Campos del formulario
  const [registerName, setRegisterName] = useState('');
  const [registerEmail, setRegisterEmail] = useState('');
  const [registerPhone, setRegisterPhone] = useState('');
  const [registerDni, setRegisterDni] = useState('');
  const [registerAge, setRegisterAge] = useState('');

  const [scanning, setScanning] = useState(false);
  const [status, setStatus] = useState<'idle' | 'scanning' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  // Imagen fija capturada
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [matchedUser, setMatchedUser] = useState<any>(null);
  const [faceMatch, setFaceMatch] = useState(0);
  const [registrationConfidence, setRegistrationConfidence] = useState(0);
  const [duplicateNotice, setDuplicateNotice] = useState(false);

  useEffect(() => {
    if (!cameraActive) {
      setFaceMatch(0);
      setRegistrationConfidence(0);
      return;
    }

    setFaceMatch(0);
    setRegistrationConfidence(0);
  }, [cameraActive, mode]);

  useEffect(() => {
    if (cameraActive) {
      startCamera();
    } else {
      stopCamera();
    }
    return () => {
      stopCamera();
    };
  }, [cameraActive, mode]);

  const startCamera = async () => {
    try {
      setMessage('');
      const mediaStream = await navigator.mediaDevices.getUserMedia({ 
        video: { width: 640, height: 480, facingMode: 'user' } 
      });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }

    } catch (err) {
      console.error('Error al acceder a la cámara:', err);
      setMessage('No se pudo acceder a la cámara. Verifique los permisos.');
      setStatus('error');
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
  };

  const toggleCamera = () => {
    if (cameraActive) {
      stopCamera();
      setCameraActive(false);
    } else {
      setCameraActive(true);
    }
  };

  const captureSnapshot = (): string => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      throw new Error('La cámara todavía no está lista. Espere un momento e inténtelo de nuevo.');
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    if (!canvas.width || !canvas.height) {
      throw new Error('No se pudo obtener una imagen válida de la cámara.');
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('No se pudo preparar la captura de la cámara.');
    }

    ctx.save();
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    ctx.restore();
    return canvas.toDataURL('image/jpeg', 0.92);
  };

  const runLoginScan = () => {
    if (!cameraActive) {
      setStatus('error');
      setMessage('Encienda la cámara para escanear el rostro.');
      return;
    }

    setScanning(true);
    setStatus('scanning');
    setMessage('Escaneando rostro...');

    window.setTimeout(async () => {
      try {
        setScanning(false);
        const snapshotUrl = captureSnapshot();
        setCapturedImage(snapshotUrl);

        const result = await loginWithFace(snapshotUrl);
        const matchedName = result.nombre || 'Usuario identificado';
        const parsedMatch = Number.parseFloat(result.match_percentage) || 0;
        if (parsedMatch < 75) {
          throw Object.assign(new Error('Acceso denegado: se requiere una coincidencia facial mínima del 75%.'), {
            code: 'FACE_MATCH_BELOW_REQUIRED',
            status: 401,
          });
        }
        localStorage.setItem('veris_access_token', result.access_token);
        setFaceMatch(Math.min(100, Math.round(parsedMatch)));
        setRegistrationConfidence(Math.min(100, Math.max(80, Math.round(parsedMatch + 4))));
        setRegisterName(matchedName.split(' ')[0] || matchedName);
        setMatchedUser({ name: matchedName, role: 'Operador Biométrico' });

        setStatus('success');
        setMessage(`¡Coincidencia detectada en tiempo real! ${result.match_percentage}`);

        setTimeout(() => {
          stopCamera();
          onSuccess({ name: matchedName, role: 'Operador Biométrico' });
        }, 2000);
      } catch (error: any) {
        if (error?.code === 'FACE_NOT_RECOGNIZED' || error?.status === 401) {
          setScanning(false);
          setStatus('error');
          setMessage('No reconocimos este rostro. Verifica la imagen o cambia a Registrarse.');
          return;
        }

        setStatus('error');
        setMessage(error?.message || 'No se pudo verificar el rostro contra la base de datos.');
      }
    }, 2500);
  };

  // Acción para capturar foto en Modo Registrarse (botón debajo del cuadro)
  const handleCaptureRegistration = () => {
    if (!cameraActive) {
      setMessage('Encienda la cámara para tomar la captura.');
      setStatus('error');
      return;
    }

    try {
      const snapshotUrl = captureSnapshot();
      setCapturedImage(snapshotUrl);
      setFaceMatch(0);
      setRegistrationConfidence(0);
      setStatus('success');
      setMessage('¡Fotografía capturada con éxito! Se verificará contra la base de datos al guardar.');
    } catch (error: any) {
      setStatus('error');
      setMessage(error?.message || 'No se pudo capturar la fotografía de la cámara.');
    }
  };

  const handleSaveRegistration = async () => {
    if (!registerName.trim() || !registerDni.trim() || !registerEmail.trim()) {
      setMessage('Por favor, complete los campos obligatorios (*).');
      setStatus('error');
      return;
    }

    if (!capturedImage) {
      setMessage('Tome una fotografía antes de guardar el registro.');
      setStatus('error');
      return;
    }

    const imageToSave = capturedImage;
    const newUserData = {
      name: registerName.trim(),
      email: registerEmail.trim(),
      phone: registerPhone.trim() || '+51 900 000 000',
      dni: registerDni.trim(),
      age: registerAge.trim() || '30',
      role: 'Operador Registrado',
      avatar: imageToSave
    };

    try {
      try {
        const existingMatch = await loginWithFace(imageToSave);
        const existingSimilarity = Number.parseFloat(existingMatch.match_percentage) || 0;
        if (existingSimilarity >= 75) {
          setDuplicateNotice(true);
          setStatus('error');
          setMessage('Este rostro ya está registrado. Inicie sesión.');
          return;
        }
      } catch (error: any) {
        if (error?.status !== 401 && error?.code !== 'FACE_NOT_RECOGNIZED') {
          throw error;
        }
      }

      const response = await registerUserWithFace({
        nombre: registerName.trim().split(' ')[0] || registerName.trim(),
        apellido: registerName.trim().split(' ').slice(1).join(' ') || 'Registrado',
        edad: Number(registerAge.trim() || 30),
        telefono: registerPhone.trim() || '+51 900 000 000',
        email: registerEmail.trim(),
        dni: registerDni.trim(),
        imagen_base64: imageToSave,
      });

      const facialUsers = JSON.parse(localStorage.getItem('veris_facial_users') || '[]');
      facialUsers.push({ ...newUserData, id: response.id, avatar: response.imagen_url || imageToSave });
      localStorage.setItem('veris_facial_users', JSON.stringify(facialUsers));

      setStatus('success');
      setMessage('¡Registro guardado exitosamente!');

      setTimeout(() => {
        stopCamera();
        onSuccess({ name: newUserData.name, role: newUserData.role });
      }, 1800);
    } catch (error: any) {
      if (error?.code === 'USER_ALREADY_REGISTERED' || error?.status === 409) {
        setDuplicateNotice(true);
        setStatus('error');
        setMessage('Este usuario ya está registrado. Inicie sesión.');
        return;
      }
      if (error?.code === 'AVATAR_STORAGE_UNAVAILABLE') {
        setStatus('error');
        setMessage('No se pudo guardar la foto real. Verifique que exista el bucket "avatars" en Supabase Storage.');
        return;
      }
      setStatus('error');
      setMessage(error?.message || 'No se pudo guardar el registro en Supabase. Revisa la configuración del backend.');
    }
  };

  return (
    <div className="facial-modal-overlay">
      <div className="facial-modal-card-wide">
        
        <div className="facial-modal-header">
          <div className="facial-modal-title">
            <Camera size={20} className="text-emerald-400" />
            <span>Credencial y Biometría Facial</span>
          </div>
          <button type="button" onClick={() => { stopCamera(); onClose(); }} className="facial-close-btn">
            <X size={18} />
          </button>
        </div>

        <canvas ref={canvasRef} style={{ display: 'none' }} />

        {/* Pestañas Superiores */}
        <div className="facial-tabs">
          <button 
            type="button" 
            onClick={() => { setMode('login'); setCapturedImage(null); setDuplicateNotice(false); setMessage(''); setStatus('idle'); }}
            className={`facial-tab-btn ${mode === 'login' ? 'active' : ''}`}
          >
            <LogIn size={14} /> Iniciar Sesión
          </button>
          <button 
            type="button" 
            onClick={() => { setMode('register'); setCapturedImage(null); setDuplicateNotice(false); setMessage(''); setStatus('idle'); }}
            className={`facial-tab-btn ${mode === 'register' ? 'active' : ''}`}
          >
            <UserPlus size={14} /> Registrarse
          </button>
        </div>

        {/* Contenedor Principal en 2 Columnas */}
        <div className="facial-main-grid">
          
          {/* COLUMNA 1: Cámara + Interruptor ON/OFF + Botón Capturar */}
          <div className="facial-col-camera">
            <div className="facial-col-header-row">
              <div className="facial-col-title-group">
                <span>PASO 01</span>
                <strong>Imagen de identificación</strong>
              </div>
              
              {/* Interruptor ON/OFF de la cámara */}
              <div className="camera-switch-wrapper">
                <span className="switch-label">{cameraActive ? 'ON' : 'OFF'}</span>
                <button 
                  type="button" 
                  onClick={toggleCamera} 
                  className={`camera-toggle-switch ${cameraActive ? 'active' : ''}`}
                  title="Encender / Apagar cámara"
                >
                  <span className="switch-thumb"></span>
                </button>
              </div>
            </div>

            {/* Cuadro de la cámara o imagen congelada */}
            <div className="facial-camera-container-box">
              {capturedImage && mode === 'register' ? (
                <img src={capturedImage} alt="Captura Rostro" className="facial-video-feed" />
              ) : cameraActive ? (
                <>
                  <video 
                    ref={videoRef} 
                    autoPlay 
                    playsInline 
                    muted 
                    className="facial-video-feed" 
                  />
                  <div className={`facial-scan-overlay ${scanning ? 'active' : ''}`}>
                    <div className="scan-corner top-left"></div>
                    <div className="scan-corner top-right"></div>
                    <div className="scan-corner bottom-left"></div>
                    <div className="scan-corner bottom-right"></div>
                    {scanning && <div className="scan-laser-line"></div>}
                  </div>
                </>
              ) : (
                <div className="camera-offline-state">
                  <CameraOff size={32} className="text-gray-500" />
                  <span>Cámara apagada</span>
                </div>
              )}

              {status === 'error' && (
                <div className="facial-status-banner error">
                  <AlertCircle size={16} />
                  <span>{message}</span>
                </div>
              )}
            </div>

            <div className="facial-metrics" aria-label="Métricas de análisis facial">
              <div className="facial-metric">
                <div className="facial-metric-heading">
                  <span>Coincidencia con usuario registrado</span>
                  <strong>{faceMatch}%</strong>
                </div>
                <div className={`facial-progress-track ${scanning ? 'is-flowing' : ''}`}>
                  <i style={{ width: `${faceMatch}%` }} />
                </div>
                <small>{scanning ? 'Comparando rasgos en tiempo real...' : faceMatch ? 'Coincidencia calculada' : 'Enciende la cámara para iniciar'}</small>
              </div>
              <div className="facial-metric">
                <div className="facial-metric-heading">
                  <span>Seguridad y confianza del registro</span>
                  <strong>{registrationConfidence}%</strong>
                </div>
                <div className={`facial-progress-track facial-progress-track--confidence ${scanning ? 'is-flowing' : ''}`}>
                  <i style={{ width: `${registrationConfidence}%` }} />
                </div>
                <small>{registrationConfidence >= 90 ? 'Detalle suficiente para reconocer el rostro' : 'Analizando calidad, iluminación y presencia facial'}</small>
              </div>
            </div>

            {/* Botón de Capturar Debajo del Cuadro (Solo en Registro) */}
            {mode === 'register' && (
              <button 
                type="button" 
                onClick={handleCaptureRegistration}
                className="facial-capture-btn-under"
              >
                <Camera size={16} /> Tomar fotografía
              </button>
            )}
            
            <p className="facial-cam-legend">
              {mode === 'login' ? 'Pulsa “Escanear ahora” para verificar el rostro.' : 'Capture su foto para el registro biométrico.'}
            </p>
          </div>

          {/* COLUMNA 2: Datos Personales (Autocompletados en tiempo real o editables) */}
          <div className="facial-col-form">
            <div className="facial-col-title flex-between">
              <div>
                <span>PASO 02</span>
                <strong>     Datos personales</strong>
              </div>
              {status === 'success' && (
                <span className="badge-success-pill">
                  <CheckCircle size={12} /> {mode === 'login' ? 'Reconocido' : 'Listo'}
                </span>
              )}
            </div>

            {mode === 'login' && (
              <div className="realtime-info-banner">
                <Zap size={14} className="text-emerald-400" />
                <span>La cámara está lista. El escaneo es manual.</span>
              </div>
            )}

            <div className="facial-form-fields-container">
              <div className="facial-row-inputs">
                <div className="facial-input-group">
                  <label className="facial-label">Nombre *</label>
                  <input 
                    type="text" 
                    value={registerName}
                    onChange={(e) => setRegisterName(e.target.value)}
                    placeholder="Ej. Valentina"
                    className="facial-input-field"
                    disabled={mode === 'login'}
                  />
                </div>
                <div className="facial-input-group">
                  <label className="facial-label">Correo electrónico *</label>
                  <input 
                    type="email" 
                    value={registerEmail}
                    onChange={(e) => setRegisterEmail(e.target.value)}
                    placeholder="correo@empresa.com"
                    className="facial-input-field"
                    disabled={mode === 'login'}
                  />
                </div>
              </div>

              <div className="facial-row-inputs">
                <div className="facial-input-group">
                  <label className="facial-label">DNI / ID *</label>
                  <input 
                    type="text" 
                    value={registerDni}
                    onChange={(e) => setRegisterDni(e.target.value)}
                    placeholder="8 dígitos"
                    className="facial-input-field"
                    disabled={mode === 'login'}
                  />
                </div>
                <div className="facial-input-group">
                  <label className="facial-label">Edad</label>
                  <input 
                    type="number" 
                    value={registerAge}
                    onChange={(e) => setRegisterAge(e.target.value)}
                    placeholder="Años"
                    className="facial-input-field"
                    disabled={mode === 'login'}
                  />
                </div>
              </div>

              <div className="facial-input-group">
                <label className="facial-label">Número de teléfono</label>
                <input 
                  type="text" 
                  value={registerPhone}
                  onChange={(e) => setRegisterPhone(e.target.value)}
                  placeholder="+51 000 000 000"
                  className="facial-input-field"
                  disabled={mode === 'login'}
                />
              </div>
            </div>

            {/* Pie de acción */}
            <div className="facial-form-footer">
              <span className="facial-required-note">* Campos requeridos</span>
              
              {mode === 'register' && (
                <button 
                  type="button" 
                  onClick={handleSaveRegistration}
                  className="facial-save-btn"
                >
                  <ShieldCheck size={16} /> Guardar registro
                </button>
              )}
              {mode === 'login' && (
                <button type="button" onClick={runLoginScan} className="facial-save-btn" disabled={scanning}>
                  <ShieldCheck size={16} /> {scanning ? 'Escaneando...' : 'Escanear ahora'}
                </button>
              )}
            </div>

          </div>

        </div>

      </div>
      {duplicateNotice && (
        <div className="facial-duplicate-toast" role="alert">
          <CheckCircle size={20} />
          <div>
            <strong>Usuario detectado</strong>
            <span>Este usuario ya está registrado, inicie sesión.</span>
          </div>
          <button type="button" onClick={() => setDuplicateNotice(false)} aria-label="Cerrar aviso"><X size={16} /></button>
        </div>
      )}
    </div>
  );
}