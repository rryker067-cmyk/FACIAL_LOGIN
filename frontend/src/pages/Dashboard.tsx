
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
  FileText,
  Fingerprint,
  LayoutDashboard,
  Menu,
  ScanFace,
  Search,
  ShieldCheck,
  Upload,
  UsersRound,
  X,
  Activity,
  BarChart3,
  BookOpen,
  CheckCircle2,
  Clock3,
  ExternalLink,
  Server,
} from 'lucide-react'
import Field from '../components/Field'
import { appConfig } from '../config/env'
import { listUsers, recognizeFace } from '../services/recognitionApi'
import { emptyPerson, PersonRecord } from '../types/person'

const navItems = [
  { id: 'resumen', label: 'Resumen', icon: LayoutDashboard },
  { id: 'reconocer', label: 'Reconocer rostro', icon: ScanFace },
  { id: 'personas', label: 'Personas registradas', icon: UsersRound },
  { id: 'historial', label: 'Historial', icon: ClipboardList },
]

type FacialUser = PersonRecord & { id?: string; email?: string; avatar?: string }
type Validation = { name: string; time: string; match: string; status: 'success' | 'failed' }
type StoredDocument = { id: string; name: string; type: string; size: number; blob: Blob; createdAt: string }

const DOCUMENT_DB = 'veris-documentation'
const DOCUMENT_STORE = 'documents'

const openDocumentDb = (): Promise<IDBDatabase> => new Promise((resolve, reject) => {
  const request = indexedDB.open(DOCUMENT_DB, 1)
  request.onupgradeneeded = () => request.result.createObjectStore(DOCUMENT_STORE, { keyPath: 'id' })
  request.onsuccess = () => resolve(request.result)
  request.onerror = () => reject(request.error)
})

const loadDocuments = async (): Promise<StoredDocument[]> => {
  const db = await openDocumentDb()
  return new Promise((resolve, reject) => {
    const request = db.transaction(DOCUMENT_STORE, 'readonly').objectStore(DOCUMENT_STORE).getAll()
    request.onsuccess = () => resolve((request.result as StoredDocument[]).sort((a, b) => b.createdAt.localeCompare(a.createdAt)))
    request.onerror = () => reject(request.error)
  })
}

const storeDocument = async (file: File): Promise<StoredDocument> => {
  const document: StoredDocument = {
    id: crypto.randomUUID(),
    name: file.name,
    type: file.type,
    size: file.size,
    blob: file,
    createdAt: new Date().toISOString(),
  }
  const db = await openDocumentDb()
  return new Promise((resolve, reject) => {
    const request = db.transaction(DOCUMENT_STORE, 'readwrite').objectStore(DOCUMENT_STORE).put(document)
    request.onsuccess = () => resolve(document)
    request.onerror = () => reject(request.error)
  })
}

const readStorage = <T,>(key: string, fallback: T): T => {
  try {
    const value = localStorage.getItem(key)
    return value ? JSON.parse(value) as T : fallback
  } catch {
    return fallback
  }
}

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
  const [recognitionNotice, setRecognitionNotice] = useState<string | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [activeSection, setActiveSection] = useState('resumen')
  const [registeredUsers, setRegisteredUsers] = useState<FacialUser[]>([])
  const [validationHistory, setValidationHistory] = useState<Validation[]>([])
  const [faceMatch, setFaceMatch] = useState(0)
  const [registrationConfidence, setRegistrationConfidence] = useState(0)
  const [documents, setDocuments] = useState<StoredDocument[]>([])
  const [documentError, setDocumentError] = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  useEffect(() => () => streamRef.current?.getTracks().forEach((track) => track.stop()), [])

  useEffect(() => {
    listUsers()
      .then((users) => setRegisteredUsers(users.map((user) => ({
        ...user,
        edad: String(user.edad ?? ''),
        telefono: user.telefono || '',
        dni: user.dni || '',
      }))))
      .catch(() => setRecognitionNotice('No se pudieron cargar los usuarios desde Supabase.'))
    setValidationHistory(readStorage<Validation[]>('veris_validation_history', []))
  }, [])

  useEffect(() => {
    loadDocuments().then(setDocuments).catch(() => setDocumentError('No se pudo cargar la documentación guardada.'))
  }, [])

  useEffect(() => {
    if (!isCameraOpen) {
      setFaceMatch(0)
      setRegistrationConfidence(0)
      return
    }

    setFaceMatch(0)
    setRegistrationConfidence(0)
  }, [isCameraOpen])

  const saveValidation = (entry: Validation) => {
    const next = [entry, ...validationHistory].slice(0, 50)
    setValidationHistory(next)
    localStorage.setItem('veris_validation_history', JSON.stringify(next))
  }

  const selectSection = (section: string) => {
    setActiveSection(section)
    setSidebarOpen(false)
    window.setTimeout(() => document.getElementById(section)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0)
  }

  const updateField = (field: keyof PersonRecord, value: string) => {
    setForm((current) => ({ ...current, [field]: value }))
    setIsSaved(false)
  }

  const handleFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        setRecognitionError('No se pudo leer la imagen seleccionada.')
        return
      }
      setPreview(reader.result)
      setRecognitionError(null)
      setIsSaved(false)
    }
    reader.onerror = () => {
      setRecognitionError('No se pudo leer la imagen seleccionada.')
    }
    reader.readAsDataURL(file)
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
      const match = Math.min(100, Math.max(0, Number.parseFloat(result.similarity || '0') * 100))
      const isAcceptedMatch = Boolean(result.nombre) && match >= 75
      setRecognitionNotice(isAcceptedMatch ? null : 'No se encontró al usuario en la base de datos.')
      if (isAcceptedMatch && result.imagen_url) setPreview(result.imagen_url)
      setFaceMatch(isAcceptedMatch ? match : 0)
      setRegistrationConfidence(isAcceptedMatch ? Math.round(match) : 0)
      saveValidation({
        name: isAcceptedMatch ? `${result.nombre} ${result.apellido}` : 'Rostro no reconocido',
        time: new Date().toISOString(),
        match: `${isAcceptedMatch ? Math.round(match) : 0}%`,
        status: isAcceptedMatch ? 'success' : 'failed',
      })
    } catch {
      setRecognitionError('No se pudo conectar con el servicio de reconocimiento. Revisa FastAPI e inténtalo de nuevo.')
    } finally {
      setIsRecognizing(false)
    }
  }

  const saveRecord = (event: FormEvent) => {
    event.preventDefault()
    setRecognitionNotice('Los datos mostrados son de solo lectura y se sincronizan desde Supabase.')
    setIsSaved(Boolean(form.nombre))
  }

  const handleDocumentationUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    if (!file.type.startsWith('image/') && file.type !== 'application/pdf') {
      setDocumentError('Solo se permiten archivos PDF o imágenes.')
      return
    }

    try {
      const saved = await storeDocument(file)
      setDocuments((current) => [saved, ...current])
      setDocumentError(null)
    } catch {
      setDocumentError('No se pudo guardar el documento de forma persistente.')
    }
  }

  const downloadDocumentation = (document: StoredDocument) => {
    const url = URL.createObjectURL(document.blob)
    const anchor = window.document.createElement('a')
    anchor.href = url
    anchor.download = document.name
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const formatDocumentSize = (size: number) => `${Math.max(1, Math.round(size / 1024))} KB`

  const recognizedCount = validationHistory.filter((item) => item.status === 'success').length
  const failedCount = validationHistory.filter((item) => item.status === 'failed').length
  const recognitionRate = validationHistory.length
    ? Math.round((recognizedCount / validationHistory.length) * 100)
    : 0
  const chartValues = Array.from({ length: 7 }, (_, index) => {
    const day = new Date()
    day.setDate(day.getDate() - (6 - index))
    const label = day.toLocaleDateString('es-PE', { weekday: 'short' }).slice(0, 3)
    const count = validationHistory.filter((item) => {
      const itemDate = new Date(item.time)
      return itemDate.toDateString() === day.toDateString()
    }).length
    return { label, count }
  })
  const maxChartValue = Math.max(...chartValues.map((item) => item.count), 1)
  const reviewQueue = validationHistory.filter((item) => item.status === 'failed').slice(0, 5).map((item, index) => ({
    name: item.name,
    status: 'Pendiente',
    risk: 'medio',
    id: `REV-${index + 1}`,
  }))
  const auditTrail = validationHistory.slice(0, 6).map((item) => ({
    action: item.status === 'success' ? 'Rostro validado' : 'Rostro no reconocido',
    user: item.name,
    time: item.time,
  }))
  const formatDate = (value: string) => {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' })
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
          {navItems.map(({ id, label, icon: Icon }) => <a className={`nav-item ${activeSection === id ? 'nav-item--active' : ''}`} href={`#${id}`} key={label} onClick={(event) => { event.preventDefault(); selectSection(id) }}><Icon size={18} /><span>{label}</span>{activeSection === id && <i />}</a>)}
          <span className="nav-label nav-label--spaced">Configuración</span>
          <a className={`nav-item ${activeSection === 'documentacion' ? 'nav-item--active' : ''}`} href="#documentacion" onClick={(event) => { event.preventDefault(); selectSection('documentacion') }}><FileImage size={18} /><span>Documentación</span></a>
          <a className={`nav-item ${activeSection === 'integraciones' ? 'nav-item--active' : ''}`} href="#integraciones" onClick={(event) => { event.preventDefault(); selectSection('integraciones') }}><Database size={18} /><span>Integraciones</span></a>
          <a className={`nav-item ${activeSection === 'seguridad' ? 'nav-item--active' : ''}`} href="#seguridad" onClick={(event) => { event.preventDefault(); selectSection('seguridad') }}><ShieldCheck size={18} /><span>Seguridad</span></a>
        </nav>
        <div className="sidebar-foot"><div className="status-dot" /><div><b>Servicios operativos</b><span>Última sincronización: ahora</span></div></div>
      </aside>

      <main className="main-content">
        {recognitionNotice && (
          <div className="dashboard-warning-toast" role="alert">
            <span>!</span>
            <div><strong>No se encontró al usuario</strong><small>{recognitionNotice}</small></div>
            <button type="button" onClick={() => setRecognitionNotice(null)} aria-label="Cerrar alerta">×</button>
          </div>
        )}
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

        <div className="content-wrap" id="resumen">
          <div className="page-heading"><div><div className="eyebrow"><span /> OPERACIONES / IDENTIDAD</div><h1>{activeSection === 'resumen' ? 'Resumen operativo' : activeSection === 'personas' ? 'Personas registradas' : activeSection === 'historial' ? 'Historial de validaciones' : activeSection === 'documentacion' ? 'Documentación' : activeSection === 'integraciones' ? 'Integraciones' : activeSection === 'seguridad' ? 'Seguridad' : 'Reconocer un rostro'}</h1><p>{activeSection === 'resumen' ? 'Supervisa el estado de la identidad biométrica y la actividad reciente.' : 'Gestiona la operación de reconocimiento facial desde un solo lugar.'}</p></div><div className="heading-meta"><span className="live-dot" /> {appConfig.usesDemoRecognition ? 'Modo demo' : 'API conectada'} <small>FastAPI · Supabase</small></div></div>

          <section className={`dashboard-overview ${activeSection === 'resumen' ? '' : 'dashboard-section-hidden'}`} aria-label="Resumen de métricas">
            <div className="metric-card metric-card--success"><span className="metric-label">Personas registradas</span><strong>{registeredUsers.length}</strong><small><UsersRound size={12} /> perfiles biométricos</small></div>
            <div className="metric-card"><span className="metric-label">Validaciones</span><strong>{validationHistory.length}</strong><small><Activity size={12} /> intentos procesados</small></div>
            <div className="metric-card"><span className="metric-label">Tasa de reconocimiento</span><strong>{recognitionRate}%</strong><small><CheckCircle2 size={12} /> coincidencias exitosas</small></div>
            <div className="metric-card"><span className="metric-label">No reconocidos</span><strong>{failedCount}</strong><small><Clock3 size={12} /> requieren registro</small></div>
          </section>

          <section className={`analytics-grid ${activeSection === 'resumen' ? '' : 'dashboard-section-hidden'}`} aria-label="Analítica facial">
            <div className="panel analytics-panel"><div className="panel-heading compact-heading"><div><span className="section-kicker">ACTIVIDAD</span><h2>Validaciones de los últimos 7 días</h2></div><BarChart3 size={19} /></div><div className="bar-chart">{chartValues.map((item) => <div className="bar-column" key={item.label}><span>{item.count}</span><div className="bar-track"><i style={{ height: `${Math.max((item.count / maxChartValue) * 100, item.count ? 12 : 4)}%` }} /></div><small>{item.label}</small></div>)}</div></div>
            <div className="panel analytics-panel"><div className="panel-heading compact-heading"><div><span className="section-kicker">ESTADO</span><h2>Rendimiento del servicio</h2></div><Server size={19} /></div><div className="service-health"><div><span className="health-icon"><CheckCircle2 size={17} /></span><div><b>API de reconocimiento</b><small>{appConfig.usesDemoRecognition ? 'Modo demo activo' : 'Conectada y operativa'}</small></div><strong>100%</strong></div><div><span className="health-icon"><Database size={17} /></span><div><b>Persistencia de usuarios</b><small>{registeredUsers.length ? 'Datos disponibles localmente' : 'Sin perfiles registrados'}</small></div><strong>{registeredUsers.length ? 'OK' : '—'}</strong></div></div></div>
          </section>

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

          <section className={`recognition-grid ${activeSection === 'reconocer' ? '' : 'dashboard-section-hidden'}`} id="reconocer">
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
              <div className="dashboard-face-metrics" aria-label="Métricas de análisis facial">
                <div className="dashboard-face-metric">
                  <div className="dashboard-face-metric__header"><span>Coincidencia con usuario registrado</span><b>{faceMatch}%</b></div>
                  <div className={`dashboard-face-progress ${isCameraOpen ? 'dashboard-face-progress--flowing' : ''}`}><i style={{ width: `${faceMatch}%` }} /></div>
                  <small>{isCameraOpen ? 'Comparando rasgos en tiempo real...' : faceMatch ? 'Coincidencia calculada' : 'Enciende la cámara para iniciar'}</small>
                </div>
                <div className="dashboard-face-metric">
                  <div className="dashboard-face-metric__header"><span>Seguridad y confianza del registro</span><b>{registrationConfidence}%</b></div>
                  <div className={`dashboard-face-progress dashboard-face-progress--confidence ${isCameraOpen ? 'dashboard-face-progress--flowing' : ''}`}><i style={{ width: `${registrationConfidence}%` }} /></div>
                  <small>{registrationConfidence >= 90 ? 'Detalle suficiente para reconocer el rostro' : 'Analizando calidad e iluminación'}</small>
                </div>
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

          <section className={`operations-grid ${activeSection === 'reconocer' ? '' : 'dashboard-section-hidden'}`}>
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

          <section className={`bottom-grid ${activeSection === 'resumen' ? '' : 'dashboard-section-hidden'}`}>
            <div className="info-band">
              <div className="info-icon"><FileImage size={19} /></div>
              <div><b>Recomendaciones para una mejor coincidencia</b><span>Usa una imagen frontal, con buena iluminación y sin accesorios que cubran el rostro.</span></div>
            </div>

            <div className="recent-panel">
              <div><span className="section-kicker">ACTIVIDAD RECIENTE</span><h2>Último registro</h2></div>
              <div className="empty-state">Aún no hay registros recibidos.</div>
            </div>
          </section>

          <section className={`history-grid ${activeSection === 'historial' ? '' : 'dashboard-section-hidden'}`} id="historial">
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
                        <span>{formatDate(row.time)}</span>
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
                      <span>{entry.user} · {formatDate(entry.time)}</span>
                    </div>
                  </div>
                )) : <div className="empty-state">Sin actividad registrada.</div>}
              </div>
            </div>
          </section>

          <section className={`panel dashboard-section ${activeSection === 'personas' ? '' : 'dashboard-section-hidden'}`} id="personas">
            <div className="panel-heading compact-heading"><div><span className="section-kicker">DIRECTORIO</span><h2>Personas registradas</h2></div><span className="status-pill">{registeredUsers.length} perfiles</span></div>
            {registeredUsers.length ? <div className="people-grid">{registeredUsers.map((user, index) => <div className="person-card" key={user.id || `${user.dni}-${index}`}><div className="review-avatar">{`${user.nombre?.[0] || ''}${user.apellido?.[0] || ''}`.toUpperCase()}</div><div><b>{user.nombre} {user.apellido}</b><span>{user.dni || 'Sin DNI'} · {user.email || 'Sin correo'}</span></div><CheckCircle2 size={17} /></div>)}</div> : <div className="empty-state">Todavía no hay personas registradas. Usa “Reconocer rostro” para crear el primer perfil.</div>}
          </section>

          <section className={`dashboard-info-grid ${activeSection !== 'documentacion' && activeSection !== 'integraciones' && activeSection !== 'seguridad' ? 'dashboard-section-hidden' : ''}`}>
            <div className={`panel dashboard-section ${activeSection === 'documentacion' ? '' : 'dashboard-section-hidden'}`} id="documentacion">
              <div className="panel-heading compact-heading"><div><span className="section-kicker">GUÍA Y ARCHIVOS</span><h2>Documentación</h2></div><BookOpen size={19} /></div>
              <div className="info-cards"><div><b>1. Captura una imagen</b><span>Usa una foto frontal, nítida y con buena iluminación.</span></div><div><b>2. Verifica los datos</b><span>El sistema consulta la coincidencia facial y completa el formulario.</span></div><div><b>3. Guarda el registro</b><span>Los perfiles y documentos quedan disponibles para futuras validaciones.</span></div></div>
              <div className="capture-actions">
                <label className="button button--dark"><FileImage size={16} /> Subir PDF o imagen<input type="file" accept="application/pdf,image/*" onChange={handleDocumentationUpload} /></label>
                <span className="capture-note"><ShieldCheck size={15} /> Se conserva aunque cierres la página.</span>
              </div>
              {documentError && <p className="recognition-error" role="alert">{documentError}</p>}
              {documents.length ? <div className="people-grid">{documents.map((document) => <button className="person-card" type="button" key={document.id} onClick={() => downloadDocumentation(document)}><div className="review-avatar">{document.type === 'application/pdf' ? <FileText size={18} /> : <FileImage size={18} />}</div><div><b>{document.name}</b><span>{document.type === 'application/pdf' ? 'PDF' : 'Imagen'} · {formatDocumentSize(document.size)}</span></div><ExternalLink size={17} /></button>)}</div> : <div className="empty-state">No hay documentos guardados. Puedes subir archivos PDF o imágenes.</div>}
            </div>
            <div className={`panel dashboard-section ${activeSection === 'integraciones' ? '' : 'dashboard-section-hidden'}`} id="integraciones"><div className="panel-heading compact-heading"><div><span className="section-kicker">SERVICIOS</span><h2>Integraciones</h2></div><ExternalLink size={19} /></div><div className="integration-list"><div><Database size={17} /><span><b>Supabase</b><small>Persistencia de usuarios y embeddings</small></span><em>{appConfig.usesDemoRecognition ? 'Configurar' : 'Conectado'}</em></div><div><Server size={17} /><span><b>FastAPI</b><small>API de reconocimiento facial</small></span><em>{appConfig.usesDemoRecognition ? 'Demo' : 'Operativo'}</em></div></div></div>
            <div className={`panel dashboard-section ${activeSection === 'seguridad' ? '' : 'dashboard-section-hidden'}`} id="seguridad"><div className="panel-heading compact-heading"><div><span className="section-kicker">CONTROL</span><h2>Seguridad</h2></div><ShieldCheck size={19} /></div><div className="security-summary"><CheckCircle2 size={18} /><span>Las imágenes se procesan con confirmación explícita y el acceso se registra en el historial.</span></div><div className="security-summary"><ShieldCheck size={18} /><span>Sesión protegida con autenticación facial y token de acceso.</span></div></div>
          </section>
        </div>
      </main>
    </div>
  )
}