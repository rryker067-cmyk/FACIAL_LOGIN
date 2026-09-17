
import { ChangeEvent, FormEvent, useEffect, useRef, useState } from 'react'
import {
  Bell,
  Camera,
  Check,
  ChevronDown,
  CircleHelp,
  ClipboardList,
  Database,
  FileImage,
  Fingerprint,
  LayoutDashboard,
  Menu,
  ScanFace,
  Search,
  ShieldCheck,
  Upload,
  UsersRound,
  X,
} from 'lucide-react'
import Field from '../components/Field'
import { appConfig } from '../config/env'
import { recognizeFace } from '../services/recognitionApi'
import { emptyPerson, PersonRecord } from '../types/person'

const navItems = [
  { label: 'Resumen', icon: LayoutDashboard },
  { label: 'Reconocer rostro', icon: ScanFace, active: true },
  { label: 'Personas registradas', icon: UsersRound },
  { label: 'Historial', icon: ClipboardList },
]

const reviewQueue: Array<{ name: string; status: string; risk: string; id: string }> = []
const validationHistory: Array<{ name: string; time: string; match: string }> = []
const auditTrail: Array<{ action: string; user: string; time: string }> = []

interface DashboardProps {
  onLogout: () => void;
}

export default function Dashboard({ onLogout }: DashboardProps) {
  const [form, setForm] = useState<PersonRecord>(emptyPerson)
  const [preview, setPreview] = useState<string | null>(null)
  const [isCameraOpen, setIsCameraOpen] = useState(false)
  const [isSaved, setIsSaved] = useState(false)
  const [isRecognizing, setIsRecognizing] = useState(false)
  const [recognitionError, setRecognitionError] = useState<string | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  useEffect(() => () => streamRef.current?.getTracks().forEach((track) => track.stop()), [])

  const updateField = (field: keyof PersonRecord, value: string) => {
    setForm((current) => ({ ...current, [field]: value }))
    setIsSaved(false)
  }

  const handleFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    setPreview(URL.createObjectURL(file))
    setIsSaved(false)
  }

  const openCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true })
      streamRef.current = stream
      setIsCameraOpen(true)
      window.setTimeout(() => {
        if (videoRef.current) videoRef.current.srcObject = stream
      }, 0)
    } catch {
      setIsCameraOpen(false)
    }
  }

  const closeCamera = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    setIsCameraOpen(false)
  }

  const capturePhoto = () => {
    const video = videoRef.current
    if (!video) return
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth || 640
    canvas.height = video.videoHeight || 480
    canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height)
    setPreview(canvas.toDataURL('image/jpeg', 0.9))
    closeCamera()
  }

  const recognizeFaceFromImage = async () => {
    if (!preview) return
    setIsRecognizing(true)
    setRecognitionError(null)
    try {
      const result = await recognizeFace(preview)
      setForm(result)
    } catch {
      setRecognitionError('No se pudo conectar con el servicio de reconocimiento. Revisa FastAPI e inténtalo de nuevo.')
    } finally {
      setIsRecognizing(false)
    }
  }

  const saveRecord = (event: FormEvent) => {
    event.preventDefault()
    setIsSaved(true)
  }

  return (
    <div className="app-shell">
      <aside className={`sidebar ${sidebarOpen ? 'sidebar--open' : ''}`}>
        <div className="brand">
          <div className="brand-mark"><Fingerprint size={20} strokeWidth={2.5} /></div>
          <div><strong>veris</strong><span>identidad simple</span></div>
          <button className="icon-button sidebar-close" aria-label="Cerrar menú" onClick={() => setSidebarOpen(false)}><X size={18} /></button>
        </div>
        <div className="workspace-switcher"><div className="workspace-avatar">R</div><div><b>Registro central</b><span>Workspace privado</span></div><ChevronDown size={15} /></div>
        <nav className="main-nav" aria-label="Navegación principal">
          <span className="nav-label">Espacio de trabajo</span>
          {navItems.map(({ label, icon: Icon, active }) => <a className={`nav-item ${active ? 'nav-item--active' : ''}`} href="#reconocer" key={label} onClick={() => setSidebarOpen(false)}><Icon size={18} /><span>{label}</span>{active && <i />}</a>)}
          <span className="nav-label nav-label--spaced">Configuración</span>
          <a className="nav-item" href="#reconocer" onClick={() => setSidebarOpen(false)}><FileImage size={18} /><span>Documentación</span></a>
          <a className="nav-item" href="#integraciones"><Database size={18} /><span>Integraciones</span></a>
          <a className="nav-item" href="#seguridad"><ShieldCheck size={18} /><span>Seguridad</span></a>
        </nav>
        <div className="sidebar-foot"><div className="status-dot" /><div><b>Servicios operativos</b><span>Última sincronización: ahora</span></div></div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <button className="icon-button menu-button" aria-label="Abrir menú" onClick={() => setSidebarOpen(true)}><Menu size={21} /></button>
          <div className="topbar-search"><Search size={17} /><input aria-label="Buscar" placeholder="Buscar en el registro..." /></div>
          <div className="topbar-actions">
            <button className="icon-button" aria-label="Ayuda"><CircleHelp size={19} /></button>
            <button className="icon-button notification-button" aria-label="Notificaciones"><Bell size={19} /><i /></button>
            
            {/* Botón de perfil con cierre de sesión integrado */}
            <div className="profile" onClick={onLogout} title="Hacer clic para cerrar sesión" style={{ cursor: 'pointer' }}>
              <div className="profile-avatar">AM</div>
              <div><b>Andrea M.</b><span>Administradora (Salir)</span></div>
              <ChevronDown size={15} />
            </div>
          </div>
        </header>

        <div className="content-wrap" id="reconocer">
          <div className="page-heading"><div><div className="eyebrow"><span /> OPERACIONES / IDENTIDAD</div><h1>Reconocer un rostro</h1><p>Captura una imagen para identificar y registrar los datos de una persona.</p></div><div className="heading-meta"><span className="live-dot" /> {appConfig.usesDemoRecognition ? 'Modo demo' : 'API conectada'} <small>FastAPI · Supabase</small></div></div>

          <div className="steps" aria-label="Progreso del registro"><div className="step step--active"><span>01</span><b>Capturar imagen</b></div><div className="step-line" /><div className={`step ${preview ? 'step--active' : ''}`}><span>02</span><b>Verificar datos</b></div><div className="step-line" /><div className={`step ${isSaved ? 'step--active' : ''}`}><span>03</span><b>Guardar registro</b></div></div>

          <div className="metrics-row" aria-label="Métricas operativas">
            <div className="metric-card">
              <span className="metric-label">Precisión</span>
              <strong>—</strong>
              <small>Sin datos disponibles</small>
            </div>
            <div className="metric-card">
              <span className="metric-label">Calidad facial</span>
              <strong>—</strong>
              <small>Sin imagen analizada</small>
            </div>
            <div className="metric-card">
              <span className="metric-label">Modelo</span>
              <strong>—</strong>
              <small>Pendiente de conexión</small>
            </div>
            <div className="metric-card">
              <span className="metric-label">Estado</span>
              <strong>Listo</strong>
              <small>Esperando un registro</small>
            </div>
          </div>

          <section className="recognition-grid">
            <div className="panel capture-panel"><div className="panel-heading"><div><span className="section-kicker">PASO 01</span><h2>Imagen de identificación</h2></div><span className="secure-badge"><ShieldCheck size={14} /> Privada</span></div>
              <div className={`capture-stage ${preview ? 'capture-stage--preview' : ''} ${isCameraOpen ? 'capture-stage--camera' : ''}`}>
                {isCameraOpen ? (
                  <>
                    <video ref={videoRef} autoPlay playsInline muted />
                    <div className="video-focus" />
                    <div className="camera-inline-controls">
                      <button className="button button--primary" onClick={capturePhoto}><Camera size={17} /> Capturar</button>
                      <button className="button button--outline" onClick={closeCamera}><X size={15} /> Cerrar</button>
                    </div>
                  </>
                ) : preview ? (
                  <><img src={preview} alt="Vista previa del rostro seleccionado" /><div className="image-overlay"><span><Check size={14} /> Imagen lista</span><button onClick={() => setPreview(null)} aria-label="Quitar imagen"><X size={15} /></button></div></>
                ) : (
                  <><div className="scan-corner scan-corner--tl" /><div className="scan-corner scan-corner--tr" /><div className="scan-corner scan-corner--bl" /><div className="scan-corner scan-corner--br" /><div className="capture-placeholder"><div className="face-icon"><ScanFace size={43} strokeWidth={1.4} /></div><b>Aún no hay una imagen</b><span>Sube una foto clara o usa tu cámara</span></div><div className="capture-grid" /></>
                )}
              </div>
              <div className="capture-actions"><label className="button button--dark"><Upload size={16} /> Subir imagen<input type="file" accept="image/*" onChange={handleFile} /></label><button className="button button--outline" onClick={openCamera}><Camera size={16} /> Usar cámara</button></div>
              <div className="capture-note"><ShieldCheck size={15} /><span>La imagen se procesa de forma segura y solo se conserva con tu confirmación.</span></div>
            </div>

            <div className="panel details-panel"><div className="panel-heading"><div><span className="section-kicker">PASO 02</span><h2>Datos personales</h2></div><span className="match-badge"><span /> Coincidencia lista</span></div>
              <button className="recognize-button" onClick={recognizeFaceFromImage} disabled={!preview || isRecognizing}>{isRecognizing ? <><span className="spinner" /> Analizando rostro...</> : <><ScanFace size={18} /> Reconocer y completar datos</>}</button>
              {recognitionError && <p className="recognition-error" role="alert">{recognitionError}</p>}
              <form onSubmit={saveRecord}><div className="form-grid"><Field label="Nombre" value={form.nombre} onChange={(value) => updateField('nombre', value)} placeholder="Ej. Valentina" /><Field label="Apellido" value={form.apellido} onChange={(value) => updateField('apellido', value)} placeholder="Ej. Rojas" /><Field label="Edad" value={form.edad} onChange={(value) => updateField('edad', value)} placeholder="Años" type="number" /><Field label="DNI" value={form.dni} onChange={(value) => updateField('dni', value)} placeholder="8 dígitos" /><Field wide label="Número de teléfono" value={form.telefono} onChange={(value) => updateField('telefono', value)} placeholder="+51 000 000 000" /></div><div className="form-footer"><span className="required-note">* Campos requeridos</span><button type="submit" className="button button--primary" disabled={!form.nombre || !form.apellido || !form.dni}>{isSaved ? <><Check size={16} /> Guardado</> : <><Database size={16} /> Guardar registro</>}</button></div></form>
            </div>
          </section>

          <section className="operations-grid">
            <div className="panel verification-panel">
              <div className="panel-heading compact-heading">
                <div>
                  <span className="section-kicker">VERIFICACIÓN</span>
                  <h2>Resultado DeepFace</h2>
                </div>
                <span className="status-pill">Sin análisis</span>
              </div>

              <div className="score-row">
                <div>
                  <span className="score-label">Confianza de coincidencia</span>
                  <strong>—</strong>
                </div>
                <span className="score-badge score-badge--empty">Pendiente</span>
              </div>

              <div className="progress-stack">
                <div className="progress-item">
                  <div className="progress-meta"><span>Calidad facial</span><b>—</b></div>
                  <div className="progress-bar"><i style={{ width: '0%' }} /></div>
                </div>
                <div className="progress-item">
                  <div className="progress-meta"><span>Liveness</span><b>—</b></div>
                  <div className="progress-bar"><i style={{ width: '0%' }} /></div>
                </div>
                <div className="progress-item">
                  <div className="progress-meta"><span>Robustez</span><b>—</b></div>
                  <div className="progress-bar"><i style={{ width: '0%' }} /></div>
                </div>
              </div>

              <div className="attribute-grid">
                <span>Modelo: pendiente</span>
                <span>Backend: FastAPI</span>
                <span>Persistencia: Supabase</span>
                <span>Estado: esperando datos</span>
              </div>
            </div>

            <div className="panel confidence-panel">
              <div className="panel-heading compact-heading">
                <div>
                  <span className="section-kicker">PREDICCIÓN</span>
                  <h2>Confianza del último registro</h2>
                </div>
                <span className="status-pill">Sin registro</span>
              </div>

              <div className="confidence-score">
                <div>
                  <span className="score-label">Estimación</span>
                  <strong>—</strong>
                </div>
                <div className="confidence-circle">
                  <span>—</span>
                </div>
              </div>

              <div className="progress-stack confidence-stack">
                <div className="progress-item">
                  <div className="progress-meta"><span>Coincidencia facial</span><b>—</b></div>
                  <div className="progress-bar"><i style={{ width: '0%' }} /></div>
                </div>
                <div className="progress-item">
                  <div className="progress-meta"><span>Resultado estimado</span><b>—</b></div>
                  <div className="progress-bar"><i style={{ width: '0%' }} /></div>
                </div>
              </div>

              <div className="confidence-footer">
                <span>Se calculará al recibir un registro</span>
                <button type="button" className="button button--outline" disabled>Reevaluar</button>
              </div>
            </div>

            <div className="panel review-panel">
              <div className="panel-heading compact-heading">
                <div>
                  <span className="section-kicker">REVISIÓN</span>
                  <h2>Cola manual</h2>
                </div>
                <span className="status-pill">0 casos</span>
              </div>

              <div className="review-list">
                {reviewQueue.length ? reviewQueue.map((item) => (
                  <div className="review-item" key={item.id}>
                    <div className="review-person">
                      <div className="review-avatar">{item.name.split(' ').map((part) => part[0]).join('').slice(0, 2)}</div>
                      <div>
                        <b>{item.name}</b>
                        <span>{item.id}</span>
                      </div>
                    </div>
                    <div className="review-meta">
                      <span className={`risk-tag risk-tag--${item.risk.toLowerCase()}`}>{item.risk}</span>
                      <small>{item.status}</small>
                    </div>
                  </div>
                )) : <div className="empty-state">No hay casos pendientes de revisión.</div>}
              </div>
            </div>
          </section>

          <section className="bottom-grid">
            <div className="info-band">
              <div className="info-icon"><FileImage size={19} /></div>
              <div><b>Recomendaciones para una mejor coincidencia</b><span>Usa una imagen frontal, con buena iluminación y sin accesorios que cubran el rostro.</span></div>
            </div>

            <div className="recent-panel">
              <div><span className="section-kicker">ACTIVIDAD RECIENTE</span><h2>Último registro</h2></div>
              <div className="empty-state">Aún no hay registros recibidos.</div>
            </div>
          </section>

          <section className="history-grid">
            <div className="panel history-panel">
              <div className="panel-heading compact-heading">
                <div>
                  <span className="section-kicker">HISTORIAL</span>
                  <h2>Validaciones recientes</h2>
                </div>
              </div>

              <div className="history-list">
                {validationHistory.length ? validationHistory.map((row) => (
                  <div className="history-item" key={row.name}>
                    <div className="history-name">
                      <div className="mini-avatar">{row.name.split(' ').map((part) => part[0]).join('').slice(0, 2)}</div>
                      <div>
                        <b>{row.name}</b>
                        <span>{row.time}</span>
                      </div>
                    </div>
                    <strong>{row.match}</strong>
                  </div>
                )) : <div className="empty-state">El historial aparecerá después de la primera validación.</div>}
              </div>
            </div>

            <div className="panel audit-panel">
              <div className="panel-heading compact-heading">
                <div>
                  <span className="section-kicker">AUDITORÍA</span>
                  <h2>Actividad del sistema</h2>
                </div>
              </div>

              <div className="audit-list">
                {auditTrail.length ? auditTrail.map((entry) => (
                  <div className="audit-item" key={`${entry.action}-${entry.time}`}>
                    <div className="audit-dot" />
                    <div>
                      <b>{entry.action}</b>
                      <span>{entry.user} · {entry.time}</span>
                    </div>
                  </div>
                )) : <div className="empty-state">Sin actividad registrada.</div>}
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  )
}