
import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from 'react'
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
  Edit3,
  Trash2,
  Save,
  LogOut,
} from 'lucide-react'
import Field from '../components/Field'
import { appConfig } from '../config/env'
import { AuditEvent, DashboardStats, deleteUser, getDashboardStats, listAuditEvents, listUsers, recognizeFace, updateUser, verifyUserFace } from '../services/recognitionApi'
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

const getDocumentKindFromName = (name: string, type = ''): string => {
  const lowerName = name.toLowerCase()
  if (type.startsWith('image/') || /\.(png|jpe?g|webp|gif|bmp|svg)$/i.test(lowerName)) return 'image'
  if (type === 'application/pdf' || lowerName.endsWith('.pdf')) return 'pdf'
  if (type.includes('word') || lowerName.endsWith('.doc') || lowerName.endsWith('.docx')) return 'word'
  if (type.includes('sheet') || lowerName.endsWith('.xls') || lowerName.endsWith('.xlsx')) return 'excel'
  if (type.includes('powerpoint') || lowerName.endsWith('.ppt') || lowerName.endsWith('.pptx')) return 'powerpoint'
  return 'other'
}

const getDocumentKind = (file: Pick<File, 'name' | 'type'>): string => getDocumentKindFromName(file.name, file.type)

const isAllowedDocumentationFile = (file: File): boolean => {
  const kind = getDocumentKind(file)
  return ['image', 'pdf', 'word', 'excel', 'powerpoint'].includes(kind)
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

const deleteStoredDocument = async (id: string): Promise<void> => {
  const db = await openDocumentDb()
  return new Promise((resolve, reject) => {
    const request = db.transaction(DOCUMENT_STORE, 'readwrite').objectStore(DOCUMENT_STORE).delete(id)
    request.onsuccess = () => resolve()
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
  user: { name: string; role: string } | null;
  onLogout: () => void;
}

export default function Dashboard({ user, onLogout }: DashboardProps) {
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
  const [dashboardStats, setDashboardStats] = useState<DashboardStats | null>(null)
  const [faceMatch, setFaceMatch] = useState(0)
  const [registrationConfidence, setRegistrationConfidence] = useState(0)
  const [documents, setDocuments] = useState<StoredDocument[]>([])
  const [documentError, setDocumentError] = useState<string | null>(null)
  const [documentFilter, setDocumentFilter] = useState<'all' | 'pdf' | 'image' | 'word' | 'excel' | 'powerpoint'>('all')
  const [selectedDocument, setSelectedDocument] = useState<StoredDocument | null>(null)
  const [pendingDocumentUpload, setPendingDocumentUpload] = useState<File | null>(null)
  const [pendingDocumentDelete, setPendingDocumentDelete] = useState<StoredDocument | null>(null)
  const [documentActionBusy, setDocumentActionBusy] = useState(false)
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([])
  const [selectedUser, setSelectedUser] = useState<FacialUser | null>(null)
  const [userAction, setUserAction] = useState<'edit' | 'delete'>('edit')
  const [editForm, setEditForm] = useState<FacialUser | null>(null)
  const [verificationToken, setVerificationToken] = useState<string | null>(null)
  const [verifyCameraOpen, setVerifyCameraOpen] = useState(false)
  const [verifyBusy, setVerifyBusy] = useState(false)
  const [verifyError, setVerifyError] = useState<string | null>(null)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [globalSearch, setGlobalSearch] = useState('')
  const [successfulEventsVisible, setSuccessfulEventsVisible] = useState(10)
  const [failedEventsVisible, setFailedEventsVisible] = useState(10)
  const [lastDashboardSync, setLastDashboardSync] = useState<string | null>(null)
  const [dashboardSyncing, setDashboardSyncing] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const verifyVideoRef = useRef<HTMLVideoElement>(null)
  const verifyStreamRef = useRef<MediaStream | null>(null)

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setSidebarOpen(false)
      setNotificationsOpen(false)
      setHelpOpen(false)
      if (!documentActionBusy) {
        setPendingDocumentUpload(null)
        setPendingDocumentDelete(null)
      }
      if (selectedUser) {
        closeVerifyCamera()
        setSelectedUser(null)
      }
    }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [documentActionBusy, selectedUser])

  useEffect(() => () => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    verifyStreamRef.current?.getTracks().forEach((track) => track.stop())
  }, [])

  useEffect(() => {
    if (verifyCameraOpen && verifyVideoRef.current && verifyStreamRef.current) {
      verifyVideoRef.current.srcObject = verifyStreamRef.current
      void verifyVideoRef.current.play().catch(() => undefined)
    }
  }, [verifyCameraOpen])

  useEffect(() => {
    if (isCameraOpen && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current
      void videoRef.current.play().catch(() => undefined)
    }
  }, [isCameraOpen])

  const applyDashboardData = (users: Array<PersonRecord & { id: string; email?: string; imagen_url?: string }>, stats: DashboardStats, events: AuditEvent[]) => {
    setRegisteredUsers(users.map((registeredUser) => ({
      ...registeredUser,
      edad: String(registeredUser.edad ?? ''),
      telefono: registeredUser.telefono || '',
      dni: registeredUser.dni || '',
    })))
    setDashboardStats(stats)
    setAuditEvents(events)
    setValidationHistory(stats.recent_events.map((event) => ({
      name: event.recognized
        ? (users.find((registeredUser) => registeredUser.id === event.user_id)?.nombre || 'Rostro reconocido')
        : 'Rostro no reconocido',
      time: event.created_at,
      match: `${Math.round((event.similarity ?? 0) * 100)}%`,
      status: event.recognized ? 'success' : 'failed',
    })))
  }

  const refreshDashboardData = async () => {
    setDashboardSyncing(true)
    try {
      const [users, stats, events] = await Promise.all([listUsers(), getDashboardStats(), listAuditEvents()])
      applyDashboardData(users, stats, events)
      setLastDashboardSync(new Date().toISOString())
    } finally {
      setDashboardSyncing(false)
    }
  }

  useEffect(() => {
    void refreshDashboardData().catch(() => {
      setRecognitionNotice('No se pudieron cargar las métricas desde Supabase.')
    })
    const refreshTimer = window.setInterval(() => {
      void refreshDashboardData().catch(() => {
        setRecognitionNotice('No se pudo actualizar el estado en tiempo real desde Supabase.')
      })
    }, 15000)
    return () => window.clearInterval(refreshTimer)
  }, [])

  const closeVerifyCamera = () => {
    verifyStreamRef.current?.getTracks().forEach((track) => track.stop())
    verifyStreamRef.current = null
    if (verifyVideoRef.current) {
      verifyVideoRef.current.srcObject = null
    }
    setVerifyCameraOpen(false)
  }

  const openUserVerification = (user: FacialUser, action: 'edit' | 'delete' = 'edit') => {
    setSelectedUser(user)
    setUserAction(action)
    setEditForm({ ...user })
    setVerificationToken(null)
    setVerifyError(null)
    closeVerifyCamera()
  }

  const startVerifyCamera = async () => {
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('getUserMedia no está disponible en este navegador.')
      }
      closeVerifyCamera()
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, facingMode: 'user' } })
      verifyStreamRef.current = stream
      setVerifyCameraOpen(true)
    } catch {
      setVerifyError('No se pudo acceder a la cámara para confirmar la identidad.')
      closeVerifyCamera()
    }
  }

  const verifySelectedUser = async () => {
    if (!selectedUser?.id || !verifyVideoRef.current) {
      setVerifyError('La cámara no está lista para verificar la identidad.')
      return
    }

    const video = verifyVideoRef.current
    if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !video.videoWidth || !video.videoHeight) {
      setVerifyError('La cámara todavía no está lista.')
      return
    }

    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth || 640
    canvas.height = video.videoHeight || 480
    const context = canvas.getContext('2d')
    if (!context) {
      setVerifyError('No se pudo preparar la captura para la verificación.')
      return
    }

    context.save()
    context.translate(canvas.width, 0)
    context.scale(-1, 1)
    context.drawImage(video, 0, 0, canvas.width, canvas.height)
    context.restore()

    setVerifyBusy(true)
    setVerifyError(null)
    try {
      const result = await verifyUserFace(selectedUser.id, canvas.toDataURL('image/jpeg', 0.92))
      setVerificationToken(result.verification_token)
      closeVerifyCamera()
    } catch (error: any) {
      setVerifyError(error?.message || 'El rostro no coincide con el perfil seleccionado.')
    } finally {
      setVerifyBusy(false)
    }
  }

  const saveSelectedUser = async () => {
    if (!selectedUser?.id || !editForm || !verificationToken) return
    try {
      const updated = await updateUser(selectedUser.id, {
        nombre: editForm.nombre,
        apellido: editForm.apellido,
        edad: Number(editForm.edad) || null,
        dni: editForm.dni,
        telefono: editForm.telefono,
        email: editForm.email || null,
      }, verificationToken)
      setSelectedUser((current) => current ? { ...current, ...updated } : current)
      setEditForm((current) => current ? { ...current, ...updated } : current)
      await refreshDashboardData()
      setRecognitionNotice('Datos actualizados correctamente.')
    } catch (error: any) {
      setVerifyError(error?.message || 'No se pudieron actualizar los datos.')
    }
  }

  const removeSelectedUser = async () => {
    if (!selectedUser?.id || !verificationToken || !window.confirm(`¿Eliminar a ${selectedUser.nombre} ${selectedUser.apellido}?`)) return
    try {
      await deleteUser(selectedUser.id, verificationToken)
      await refreshDashboardData()
      setSelectedUser(null)
      setEditForm(null)
      setRecognitionNotice('Perfil eliminado correctamente.')
    } catch (error: any) {
      setVerifyError(error?.message || 'No se pudo eliminar el perfil.')
    }
  }

  const documentationPreviewUrl = useMemo(() => selectedDocument ? URL.createObjectURL(selectedDocument.blob) : null, [selectedDocument])

  useEffect(() => {
    loadDocuments().then(setDocuments).catch(() => setDocumentError('No se pudo cargar la documentación guardada.'))
  }, [])

  useEffect(() => () => {
    if (documentationPreviewUrl) URL.revokeObjectURL(documentationPreviewUrl)
  }, [documentationPreviewUrl])

  useEffect(() => {
    if (!isCameraOpen) {
      setFaceMatch(0)
      setRegistrationConfidence(0)
      return
    }

    setFaceMatch(0)
    setRegistrationConfidence(0)
  }, [isCameraOpen])

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
      setForm(emptyPerson)
      setFaceMatch(0)
      setRegistrationConfidence(0)
      setRecognitionError(null)
      setRecognitionNotice(null)
      setIsSaved(false)
      void recognizeFaceFromImage(reader.result)
    }
    reader.onerror = () => {
      setRecognitionError('No se pudo leer la imagen seleccionada.')
    }
    reader.readAsDataURL(file)
  }

  const openCamera = async () => {
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('getUserMedia no está disponible en este navegador.')
      }
      setRecognitionError(null)
      closeCamera()
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: 'user' },
      })
      streamRef.current = stream
      setIsCameraOpen(true)
    } catch {
      setIsCameraOpen(false)
      setRecognitionError('No se pudo acceder a la cámara. Verifica los permisos del navegador.')
      closeCamera()
    }
  }

  const closeCamera = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
    setIsCameraOpen(false)
  }

  const capturePhoto = () => {
    const video = videoRef.current
    if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !video.videoWidth || !video.videoHeight) {
      setRecognitionError('La cámara todavía no está lista. Espera a que aparezca la imagen e inténtalo de nuevo.')
      return
    }
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth || 640
    canvas.height = video.videoHeight || 480
    const context = canvas.getContext('2d')
    if (!context) {
      setRecognitionError('No se pudo preparar la captura de la cámara.')
      return
    }
    context.save()
    context.translate(canvas.width, 0)
    context.scale(-1, 1)
    context.drawImage(video, 0, 0, canvas.width, canvas.height)
    context.restore()
    const image = canvas.toDataURL('image/jpeg', 0.9)
    setPreview(image)
    closeCamera()
    void recognizeFaceFromImage(image)
  }

  const recognizeFaceFromImage = async (image = preview) => {
    if (!image) return
    setIsRecognizing(true)
    setRecognitionError(null)
    try {
      const result = await recognizeFace(image)
      const recognizedPerson: PersonRecord = {
        ...emptyPerson,
        nombre: result.nombre,
        apellido: result.apellido,
        edad: result.edad,
        dni: result.dni,
        telefono: result.telefono,
        email: result.email || '',
        imagen_url: result.imagen_url || '',
        similarity: result.similarity || '0',
      }
      setForm(recognizedPerson)
      const match = Math.min(100, Math.max(0, Number.parseFloat(result.similarity || '0') * 100))
      const isAcceptedMatch = Boolean(result.nombre) && match >= 75
      setRecognitionNotice(isAcceptedMatch ? null : 'No se encontró al usuario en la base de datos.')
      if (isAcceptedMatch && result.imagen_url) setPreview(result.imagen_url)
      setFaceMatch(isAcceptedMatch ? match : 0)
      setRegistrationConfidence(isAcceptedMatch ? Math.round(match) : 0)
      try {
        await refreshDashboardData()
      } catch {
        setRecognitionNotice('Reconocimiento completado, pero no se pudo actualizar el resumen desde Supabase.')
      }
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

    if (!isAllowedDocumentationFile(file)) {
      setDocumentError('Solo se permiten archivos PDF, Word, Excel, PowerPoint, PNG y otras imágenes.')
      return
    }

    setDocumentError(null)
    setPendingDocumentUpload(file)
  }

  const confirmDocumentationUpload = async () => {
    if (!pendingDocumentUpload) return
    setDocumentActionBusy(true)
    try {
      const saved = await storeDocument(pendingDocumentUpload)
      setDocuments((current) => [saved, ...current])
      setSelectedDocument(saved)
      setPendingDocumentUpload(null)
      setDocumentError(null)
    } catch {
      setDocumentError('No se pudo guardar el documento de forma persistente.')
    } finally {
      setDocumentActionBusy(false)
    }
  }

  const confirmDocumentationDelete = async () => {
    if (!pendingDocumentDelete) return
    setDocumentActionBusy(true)
    try {
      await deleteStoredDocument(pendingDocumentDelete.id)
      setDocuments((current) => current.filter((document) => document.id !== pendingDocumentDelete.id))
      setSelectedDocument((current) => current?.id === pendingDocumentDelete.id ? null : current)
      setPendingDocumentDelete(null)
      setDocumentError(null)
    } catch {
      setDocumentError('No se pudo eliminar el documento guardado.')
    } finally {
      setDocumentActionBusy(false)
    }
  }

  const openDocumentationInNewTab = (document: StoredDocument) => {
    const url = URL.createObjectURL(document.blob)
    const win = window.open(url, '_blank', 'noopener,noreferrer')
    if (win) {
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } else {
      URL.revokeObjectURL(url)
    }
  }

  const downloadDocumentation = (document: StoredDocument) => {
    const url = URL.createObjectURL(document.blob)
    const anchor = window.document.createElement('a')
    anchor.href = url
    anchor.download = document.name
    anchor.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const formatDocumentSize = (size: number) => `${Math.max(1, Math.round(size / 1024))} KB`

  const getDocumentLabel = (document: StoredDocument) => {
    const kind = getDocumentKindFromName(document.name, document.type)
    if (kind === 'pdf') return 'PDF'
    if (kind === 'image') return 'Imagen'
    if (kind === 'word') return 'Word'
    if (kind === 'excel') return 'Excel'
    if (kind === 'powerpoint') return 'PowerPoint'
    return 'Archivo'
  }

  const normalizedSearch = globalSearch.trim().toLocaleLowerCase('es')
  const matchesSearch = (value: string) => !normalizedSearch || value.toLocaleLowerCase('es').includes(normalizedSearch)
  const filteredRegisteredUsers = registeredUsers.filter((registeredUser) => matchesSearch(`${registeredUser.nombre} ${registeredUser.apellido} ${registeredUser.dni || ''} ${registeredUser.email || ''}`))
  const filteredAuditEvents = auditEvents.filter((event) => matchesSearch(`${event.event_type} ${event.source} ${event.message || ''} ${event.error_code || ''} ${event.user_id || ''}`))
  const successfulEvents = filteredAuditEvents.filter((event) => event.success)
  const failedEvents = filteredAuditEvents.filter((event) => !event.success)
  const visibleSuccessfulEvents = successfulEvents.slice(0, successfulEventsVisible)
  const visibleFailedEvents = failedEvents.slice(0, failedEventsVisible)

  useEffect(() => {
    setSuccessfulEventsVisible(10)
    setFailedEventsVisible(10)
  }, [globalSearch])
  const filteredDocuments = documents.filter((document) => {
    if (documentFilter === 'all') return true
    return getDocumentKindFromName(document.name, document.type) === documentFilter
  }).filter((document) => matchesSearch(`${document.name} ${getDocumentLabel(document)}`))

  const documentSummary = {
    total: documents.length,
    pdf: documents.filter((document) => getDocumentKindFromName(document.name, document.type) === 'pdf').length,
    image: documents.filter((document) => getDocumentKindFromName(document.name, document.type) === 'image').length,
    word: documents.filter((document) => getDocumentKindFromName(document.name, document.type) === 'word').length,
    excel: documents.filter((document) => getDocumentKindFromName(document.name, document.type) === 'excel').length,
    powerpoint: documents.filter((document) => getDocumentKindFromName(document.name, document.type) === 'powerpoint').length,
  }

  const recognizedCount = dashboardStats?.recognized_count ?? validationHistory.filter((item) => item.status === 'success').length
  const failedCount = dashboardStats?.unrecognized_count ?? validationHistory.filter((item) => item.status === 'failed').length
  const validationCount = dashboardStats?.validation_count ?? validationHistory.length
  const registeredCount = dashboardStats?.registered_count ?? registeredUsers.length
  const recognitionRate = dashboardStats?.recognition_rate ?? (validationHistory.length
    ? Math.round((recognizedCount / validationHistory.length) * 100)
    : 0)
  const alerts = auditEvents.filter((event) => !event.success)
  const utilityRate = validationCount ? Math.round((recognizedCount / validationCount) * 100) : 0
  const rejectionRate = validationCount ? Math.round((failedCount / validationCount) * 100) : 0
  const integrationRecentEvents = auditEvents.slice(0, 10)
  const chartValues = Array.from({ length: 7 }, (_, index) => {
    const day = new Date()
    day.setDate(day.getDate() - (6 - index))
    const label = day.toLocaleDateString('es-PE', { weekday: 'short' }).slice(0, 3)
    const dayKey = day.toISOString().slice(0, 10)
    const count = dashboardStats?.activity_by_day[dayKey] ?? validationHistory.filter((item) => {
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
  const latestEvent = auditEvents[0]
  const formatDate = (value: string) => {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' })
  }

  const tabContext: Record<string, { eyebrow: string; title: string; description: string; steps: string[] }> = {
    resumen: { eyebrow: 'OPERACIONES / IDENTIDAD', title: 'Resumen operativo', description: 'Supervisa el estado de la identidad biométrica y la actividad reciente.', steps: ['Actividad', 'Rendimiento', 'Resumen'] },
    reconocer: { eyebrow: 'OPERACIONES / RECONOCIMIENTO', title: 'Reconocer un rostro', description: 'Captura una imagen y compárala con los perfiles almacenados en Supabase.', steps: ['Capturar imagen', 'Verificar datos', 'Resultado'] },
    personas: { eyebrow: 'DIRECTORIO / SUPABASE', title: 'Personas registradas', description: 'Consulta los perfiles biométricos que existen actualmente en la base de datos.', steps: ['Consultar perfiles', 'Revisar datos', 'Directorio'] },
    historial: { eyebrow: 'AUDITORÍA / VALIDACIONES', title: 'Historial de validaciones', description: 'Revisa los intentos de reconocimiento y sus resultados.', steps: ['Recibir evento', 'Validar rostro', 'Auditar resultado'] },
    documentacion: { eyebrow: 'RECURSOS / DOCUMENTACIÓN', title: 'Documentación', description: 'Consulta y administra los archivos disponibles para la operación.', steps: ['Seleccionar archivo', 'Guardar documento', 'Consultar archivo'] },
    integraciones: { eyebrow: 'CONFIGURACIÓN / SERVICIOS', title: 'Integraciones', description: 'Comprueba el estado de los servicios que sostienen la plataforma.', steps: ['Configurar API', 'Conectar Supabase', 'Verificar estado'] },
    seguridad: { eyebrow: 'CONTROL / SEGURIDAD', title: 'Seguridad', description: 'Consulta las medidas activas para proteger sesiones, imágenes y biometría.', steps: ['Autenticar', 'Proteger datos', 'Registrar actividad'] },
  }
  const context = tabContext[activeSection] || tabContext.resumen
  const contextMetrics = activeSection === 'personas'
    ? [registeredCount, registeredUsers.filter((user) => user.email).length, registeredUsers.filter((user) => user.dni).length, registeredUsers.filter((user) => user.imagen_url).length]
    : activeSection === 'documentacion'
      ? [documents.length, documents.filter((item) => item.type === 'application/pdf').length, documents.filter((item) => item.type.startsWith('image/')).length, 'Local']
      : activeSection === 'historial'
      ? [validationCount, recognizedCount, failedCount, `${recognitionRate}%`]
        : activeSection === 'reconocer'
          ? [`${faceMatch}%`, `${registrationConfidence}%`, form.nombre ? 'OK' : '—', form.nombre ? 'Reconocido' : 'Pendiente']
          : ['—', '—', '—', '—']

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
          <div className="topbar-search"><Search size={17} /><input aria-label="Buscar en el registro" value={globalSearch} onChange={(event) => setGlobalSearch(event.target.value)} placeholder="Buscar en el registro..." />{globalSearch && <button type="button" className="topbar-search-clear" aria-label="Limpiar búsqueda" onClick={() => setGlobalSearch('')}><X size={14} /></button>}</div>
          <div className="topbar-actions">
            <button className="icon-button" aria-label="Ayuda" onClick={() => setHelpOpen((current) => !current)}><CircleHelp size={19} /></button>
            <button className="icon-button notification-button" aria-label="Notificaciones" onClick={() => setNotificationsOpen((current) => !current)}><Bell size={19} />{alerts.length > 0 && <i />}</button>
            
            <div className="profile">
              <div className="profile-avatar">{(user?.name || 'U').split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase()}</div>
              <div><b>{user?.name || 'Usuario'}</b><span>{user?.role || 'Sesión activa'}</span></div>
              <ChevronDown size={15} />
            </div>
            <button className="logout-button" type="button" onClick={onLogout} title="Cerrar sesión"><LogOut size={16} /><span>Cerrar sesión</span></button>
          </div>
        </header>

        <div className="content-wrap" id="resumen">
          <div className="page-heading"><div><div className="eyebrow"><span /> {context.eyebrow}</div><h1>{context.title}</h1><p>{context.description}</p></div><div className="heading-meta"><span className="live-dot" /> {appConfig.usesDemoRecognition ? 'API no configurada' : 'API conectada'} <small>FastAPI · Supabase</small></div></div>

          <section className={`dashboard-overview ${activeSection === 'resumen' ? '' : 'dashboard-section-hidden'}`} aria-label="Resumen de métricas">
            <div className="metric-card metric-card--success"><span className="metric-label">Personas registradas</span><strong>{registeredCount}</strong><small><UsersRound size={12} /> perfiles biométricos</small></div>
            <div className="metric-card"><span className="metric-label">Validaciones</span><strong>{validationCount}</strong><small><Activity size={12} /> intentos procesados</small></div>
            <div className="metric-card"><span className="metric-label">Tasa de reconocimiento</span><strong>{recognitionRate}%</strong><small><CheckCircle2 size={12} /> coincidencias exitosas</small></div>
            <div className="metric-card"><span className="metric-label">No reconocidos</span><strong>{failedCount}</strong><small><Clock3 size={12} /> requieren registro</small></div>
          </section>

          <section className={`analytics-grid ${activeSection === 'resumen' ? '' : 'dashboard-section-hidden'}`} aria-label="Analítica facial">
            <div className="panel analytics-panel"><div className="panel-heading compact-heading"><div><span className="section-kicker">ACTIVIDAD</span><h2>Actividad de los últimos 7 días</h2></div><BarChart3 size={19} /></div><div className="bar-chart">{chartValues.map((item) => <div className="bar-column" key={item.label}><span>{item.count}</span><div className="bar-track"><i style={{ height: `${Math.max((item.count / maxChartValue) * 100, item.count ? 12 : 4)}%` }} /></div><small>{item.label}</small></div>)}</div></div>
            <div className="panel analytics-panel"><div className="panel-heading compact-heading"><div><span className="section-kicker">ESTADO</span><h2>Rendimiento del servicio</h2></div><Server size={19} /></div><div className="service-health"><div><span className="health-icon"><CheckCircle2 size={17} /></span><div><b>API de reconocimiento</b><small>{appConfig.usesDemoRecognition ? 'API no configurada' : dashboardStats ? 'Conectada y operativa' : 'Sin respuesta'}</small></div><strong>{appConfig.usesDemoRecognition || !dashboardStats ? '—' : 'OK'}</strong></div><div><span className="health-icon"><Database size={17} /></span><div><b>Persistencia de usuarios</b><small>{dashboardStats ? 'Datos cargados desde Supabase' : 'Sin respuesta de Supabase'}</small></div><strong>{dashboardStats ? 'OK' : '—'}</strong></div></div></div>
          </section>

          <div className="steps" aria-label={`Contexto de ${context.title}`}><div className="step step--active"><span>01</span><b>{context.steps[0]}</b></div><div className="step-line" /><div className={`step ${preview || activeSection !== 'reconocer' ? 'step--active' : ''}`}><span>02</span><b>{context.steps[1]}</b></div><div className="step-line" /><div className={`step ${isSaved || activeSection !== 'reconocer' ? 'step--active' : ''}`}><span>03</span><b>{context.steps[2]}</b></div></div>

          <div className="metrics-row" aria-label={`Métricas de ${context.title}`}>
            {['Métrica principal', 'Datos asociados', 'Estado actual', 'Resultado'].map((fallbackLabel, index) => (
              <div className="metric-card" key={fallbackLabel}>
                <span className="metric-label">{activeSection === 'reconocer' ? ['Coincidencia', 'Calidad facial', 'Modelo', 'Estado'][index] : activeSection === 'personas' ? ['Total de perfiles', 'Con correo', 'Con DNI', 'Con foto'][index] : activeSection === 'historial' ? ['Eventos', 'Reconocidos', 'No reconocidos', 'Tasa de éxito'][index] : fallbackLabel}</span>
                <strong>{contextMetrics[index]}</strong>
                <small>{activeSection === 'personas' ? 'Datos de Supabase' : 'Datos de esta pestaña'}</small>
              </div>
            ))}
          </div>

          <section className={`recognition-grid ${activeSection === 'reconocer' ? '' : 'dashboard-section-hidden'}`} id="reconocer">
            <div className="panel capture-panel"><div className="panel-heading"><div><span className="section-kicker">PASO 01</span><h2>Imagen de identificación</h2></div><div className="dashboard-camera-switch"><span>{isCameraOpen ? 'ON' : 'OFF'}</span><button type="button" className={`camera-toggle-switch ${isCameraOpen ? 'active' : ''}`} onClick={isCameraOpen ? closeCamera : () => void openCamera()} aria-label={isCameraOpen ? 'Apagar cámara' : 'Encender cámara'}><span className="switch-thumb" /></button></div></div>
              <div className={`capture-stage ${preview ? 'capture-stage--preview' : ''} ${isCameraOpen ? 'capture-stage--camera' : ''}`}>
                {isCameraOpen ? (
                  <>
                    <video ref={videoRef} autoPlay playsInline muted className="dashboard-camera-video" />
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
              <button className="recognize-button" onClick={() => void recognizeFaceFromImage()} disabled={!preview || isRecognizing}>{isRecognizing ? <><span className="spinner" /> Analizando rostro...</> : <><ScanFace size={18} /> Reconocer y completar datos</>}</button>
              {recognitionError && <p className="recognition-error" role="alert">{recognitionError}</p>}
              <form onSubmit={saveRecord}><div className="form-grid"><Field label="Nombre" value={form.nombre} onChange={(value) => updateField('nombre', value)} placeholder="Ej. Valentina" /><Field label="Apellido" value={form.apellido} onChange={(value) => updateField('apellido', value)} placeholder="Ej. Rojas" /><Field label="Edad" value={form.edad} onChange={(value) => updateField('edad', value)} placeholder="Años" type="number" /><Field label="DNI" value={form.dni} onChange={(value) => updateField('dni', value)} placeholder="8 dígitos" /><Field wide label="Correo electrónico" value={form.email || ''} onChange={(value) => updateField('email', value)} placeholder="correo@empresa.com" /><Field wide label="Número de teléfono" value={form.telefono} onChange={(value) => updateField('telefono', value)} placeholder="+51 000 000 000" /></div><div className="form-footer"><span className="required-note">* Campos requeridos</span><button type="submit" className="button button--primary" disabled={!form.nombre || !form.apellido || !form.dni}>{isSaved ? <><Check size={16} /> Guardado</> : <><Database size={16} /> Guardar registro</>}</button></div></form>
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
              {latestEvent ? (
                <div className="recent-event-summary">
                  <b>{latestEvent.event_type} · {latestEvent.source}</b>
                  <span>
                    {latestEvent.message || (latestEvent.success ? 'Operación correcta' : latestEvent.error_code || 'Intento fallido')}
                    {' · '}
                    {formatDate(latestEvent.created_at)}
                  </span>
                  <strong className={latestEvent.success ? '' : 'history-result--failed'}>
                    {latestEvent.similarity == null ? '—' : `${Math.round(latestEvent.similarity * 100)}%`}
                  </strong>
                </div>
              ) : <div className="empty-state">Aún no hay registros recibidos.</div>}
            </div>
          </section>

          <section className={`history-grid ${activeSection === 'historial' ? '' : 'dashboard-section-hidden'}`} id="historial">
            <div className="panel history-panel">
              <div className="panel-heading compact-heading">
                <div>
                  <span className="section-kicker">HISTORIAL</span>
                  <h2>Procesos registrados</h2>
                </div>
                <span className="history-total-badge">Total: {filteredAuditEvents.length}</span>
              </div>

              <div className="history-columns">
                <div className="history-group">
                  <div className="history-group-heading">
                    <div>
                      <b>Procesos exitosos</b>
                      <span>{successfulEvents.length} registros</span>
                    </div>
                    <span className="history-group-status history-group-status--success">Correctos</span>
                  </div>
                  <div className="history-list">
                    {visibleSuccessfulEvents.length ? visibleSuccessfulEvents.map((row) => (
                      <div className="history-item" key={row.id}>
                        <div className="history-name">
                          <div className="mini-avatar">OK</div>
                          <div>
                            <b>{row.event_type} · {row.source}</b>
                            <span>{row.message || 'Operación correcta'} · Usuario: {row.user_id || 'no identificado'} · {formatDate(row.created_at)}</span>
                            {row.metadata && <small className="history-metadata">{JSON.stringify(row.metadata)}</small>}
                          </div>
                        </div>
                        <strong>{row.similarity == null ? '—' : `${Math.round(row.similarity * 100)}%`}</strong>
                      </div>
                    )) : <div className="empty-state">{globalSearch ? 'No hay procesos exitosos que coincidan con la búsqueda.' : 'Aún no hay procesos exitosos.'}</div>}
                  </div>
                  {successfulEventsVisible < successfulEvents.length && <button type="button" className="history-more-button" onClick={() => setSuccessfulEventsVisible((current) => current + 10)}>Ver 10 procesos exitosos más</button>}
                </div>

                <div className="history-group">
                  <div className="history-group-heading">
                    <div>
                      <b>Errores y procesos fallidos</b>
                      <span>{failedEvents.length} registros</span>
                    </div>
                    <span className="history-group-status history-group-status--failed">Revisar</span>
                  </div>
                  <div className="history-list">
                    {visibleFailedEvents.length ? visibleFailedEvents.map((row) => (
                      <div className="history-item" key={row.id}>
                        <div className="history-name">
                          <div className="mini-avatar mini-avatar--failed">!</div>
                          <div>
                            <b>{row.event_type} · {row.source}</b>
                            <span>{row.message || row.error_code || 'Intento fallido'} · Código: {row.error_code || 'sin código'} · Usuario: {row.user_id || 'no identificado'} · {formatDate(row.created_at)}</span>
                            {row.metadata && <small className="history-metadata">{JSON.stringify(row.metadata)}</small>}
                          </div>
                        </div>
                        <strong className="history-result--failed">{row.similarity == null ? '—' : `${Math.round(row.similarity * 100)}%`}</strong>
                      </div>
                    )) : <div className="empty-state">{globalSearch ? 'No hay errores que coincidan con la búsqueda.' : 'No hay errores registrados.'}</div>}
                  </div>
                  {failedEventsVisible < failedEvents.length && <button type="button" className="history-more-button history-more-button--failed" onClick={() => setFailedEventsVisible((current) => current + 10)}>Ver 10 errores más</button>}
                </div>
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
            {filteredRegisteredUsers.length ? <div className="people-grid">{filteredRegisteredUsers.map((user, index) => <div className="person-card person-card--interactive" key={user.id || `${user.dni}-${index}`}><button className="person-card-main" type="button" onClick={() => openUserVerification(user)}><div className="person-photo">{user.imagen_url ? <img src={user.imagen_url} alt={`Foto de ${user.nombre} ${user.apellido}`} /> : <span>{`${user.nombre?.[0] || ''}${user.apellido?.[0] || ''}`.toUpperCase()}</span>}</div><div><b>{user.nombre} {user.apellido}</b><span>{user.dni || 'Sin DNI'} · {user.email || 'Sin correo'}</span></div><Edit3 size={17} /></button><button className="icon-button person-card-delete" type="button" aria-label={`Eliminar a ${user.nombre} ${user.apellido}`} title="Eliminar persona" onClick={() => openUserVerification(user, 'delete')}><Trash2 size={17} /></button></div>)}</div> : <div className="empty-state">{globalSearch ? 'No hay personas que coincidan con la búsqueda.' : 'Todavía no hay personas registradas. Usa “Reconocer rostro” para crear el primer perfil.'}</div>}
          </section>

          {selectedUser && <div className="user-editor-backdrop" role="presentation" onClick={() => { closeVerifyCamera(); setSelectedUser(null) }}>
            <section className="user-editor panel" role="dialog" aria-modal="true" aria-labelledby="user-editor-title" onClick={(event) => event.stopPropagation()}>
              <div className="panel-heading compact-heading"><div><span className="section-kicker">CONTROL FACIAL</span><h2 id="user-editor-title">{userAction === 'delete' ? 'Confirmar eliminación' : 'Confirmar identidad'}</h2></div><button className="icon-button" type="button" aria-label="Cerrar" onClick={() => { closeVerifyCamera(); setSelectedUser(null) }}><X size={18} /></button></div>
              <div className="selected-user-summary"><div className="person-photo person-photo--large">{selectedUser.imagen_url ? <img src={selectedUser.imagen_url} alt="Foto registrada" /> : <span>{`${selectedUser.nombre?.[0] || ''}${selectedUser.apellido?.[0] || ''}`.toUpperCase()}</span>}</div><div><b>{selectedUser.nombre} {selectedUser.apellido}</b><span>{userAction === 'delete' ? 'Confirma tu identidad para eliminar este perfil.' : 'Compara tu rostro con la foto registrada para continuar.'}</span></div></div>
              {!verificationToken ? <div className="verification-stage">{verifyCameraOpen ? <><video ref={verifyVideoRef} autoPlay playsInline muted /><div className="video-focus" /><button className="button button--primary" type="button" onClick={() => void verifySelectedUser()} disabled={verifyBusy}>{verifyBusy ? 'Validando...' : <><ScanFace size={16} /> Confirmar rostro</>}</button></> : <button className="button button--dark" type="button" onClick={() => void startVerifyCamera()}><Camera size={16} /> {userAction === 'delete' ? 'Escanear para eliminar' : 'Escanear para editar'}</button>}</div> : <div className="verified-notice"><CheckCircle2 size={18} /> Identidad confirmada. {userAction === 'delete' ? 'Puedes eliminar este perfil.' : 'Puedes editar o eliminar este perfil.'}</div>}
              {verifyError && <p className="recognition-error" role="alert">{verifyError}</p>}
              {verificationToken && editForm && (userAction === 'delete' ? <div className="editor-form"><p className="delete-warning">Esta acción eliminará permanentemente el perfil y sus datos biométricos.</p><div className="editor-actions"><button className="button button--outline button--danger" type="button" onClick={() => void removeSelectedUser()}><Trash2 size={16} /> Eliminar perfil</button></div></div> : <div className="editor-form"><div className="form-grid"><Field label="Nombre" placeholder="Nombre" value={editForm.nombre} onChange={(value) => setEditForm({ ...editForm, nombre: value })} /><Field label="Apellido" placeholder="Apellido" value={editForm.apellido} onChange={(value) => setEditForm({ ...editForm, apellido: value })} /><Field label="Edad" placeholder="Edad" value={editForm.edad} onChange={(value) => setEditForm({ ...editForm, edad: value })} type="number" /><Field label="DNI" placeholder="DNI" value={editForm.dni} onChange={(value) => setEditForm({ ...editForm, dni: value })} /><Field wide label="Correo electrónico" placeholder="correo@empresa.com" value={editForm.email || ''} onChange={(value) => setEditForm({ ...editForm, email: value })} /><Field wide label="Teléfono" placeholder="Teléfono" value={editForm.telefono} onChange={(value) => setEditForm({ ...editForm, telefono: value })} /></div><div className="editor-actions"><button className="button button--outline button--danger" type="button" onClick={() => void removeSelectedUser()}><Trash2 size={16} /> Eliminar</button><button className="button button--primary" type="button" onClick={() => void saveSelectedUser()}><Save size={16} /> Guardar cambios</button></div></div>)}
            </section>
          </div>}

          <section className={`dashboard-info-grid ${activeSection !== 'documentacion' && activeSection !== 'integraciones' && activeSection !== 'seguridad' ? 'dashboard-section-hidden' : ''}`}>
            <div className={`panel dashboard-section ${activeSection === 'documentacion' ? '' : 'dashboard-section-hidden'}`} id="documentacion">
              <div className="panel-heading compact-heading"><div><span className="section-kicker">GUÍA Y ARCHIVOS</span><h2>Documentación corporativa</h2></div><BookOpen size={19} /></div>

              <div className="info-cards" style={{ marginBottom: 16 }}>
                <div><b>1. Centralización</b><span>Todo el material operativo se guarda en un repositorio interno del dashboard.</span></div>
                <div><b>2. Soporte completo</b><span>PDF, imágenes, Office y presentaciones quedan disponibles para revisión.</span></div>
                <div><b>3. Acceso seguro</b><span>Se permiten abrir, verificar y descargar documentos sin salir del entorno.</span></div>
                <div><b>4. Gestión de archivos</b><span>Usa la papelera de cada archivo para eliminarlo. La subida y el borrado siempre requieren confirmación.</span></div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 12, marginBottom: 18 }}>
                {[
                  { key: 'all', label: 'Todos', value: documentSummary.total },
                  { key: 'pdf', label: 'PDF', value: documentSummary.pdf },
                  { key: 'image', label: 'Imágenes', value: documentSummary.image },
                  { key: 'word', label: 'Word', value: documentSummary.word },
                  { key: 'excel', label: 'Excel', value: documentSummary.excel },
                  { key: 'powerpoint', label: 'PowerPoint', value: documentSummary.powerpoint },
                ].map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setDocumentFilter(item.key as typeof documentFilter)}
                    className={`button ${documentFilter === item.key ? 'button--dark' : 'button--outline'}`}
                    style={{ justifyContent: 'space-between', width: '100%' }}
                  >
                    <span>{item.label}</span>
                    <strong>{item.value}</strong>
                  </button>
                ))}
              </div>

              <div className="capture-actions" style={{ marginBottom: 18 }}>
                <label className="button button--dark"><FileImage size={16} /> Subir documentos<input type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,.doc,.docx,.xls,.xlsx,.ppt,.pptx,application/pdf,image/png,image/jpeg,image/webp,image/gif,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation" onChange={handleDocumentationUpload} /></label>
                <span className="capture-note"><ShieldCheck size={15} /> Se conserva en el navegador para revisión operativa.</span>
              </div>

              {documentError && <p className="recognition-error" role="alert">{documentError}</p>}

              {selectedDocument && (
                <div style={{ marginBottom: 18, border: '1px solid rgba(148, 163, 184, 0.25)', borderRadius: 12, background: 'rgba(15, 23, 42, 0.92)', padding: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
                    <div>
                      <div className="section-kicker" style={{ marginBottom: 4 }}>VISTA PREVIA</div>
                      <b>{selectedDocument.name}</b>
                    </div>
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                      <button type="button" className="button button--dark" onClick={() => openDocumentationInNewTab(selectedDocument)}><ExternalLink size={15} /> Abrir</button>
                      <button type="button" className="button button--outline" onClick={() => downloadDocumentation(selectedDocument)}><FileImage size={15} /> Descargar</button>
                      <button type="button" className="button button--outline" onClick={() => setSelectedDocument(null)}>Cerrar</button>
                    </div>
                  </div>
                  {selectedDocument.type.startsWith('image/') || /\.(png|jpe?g|webp|gif|bmp|svg)$/i.test(selectedDocument.name) ? (
                    <img src={documentationPreviewUrl ?? ''} alt={selectedDocument.name} style={{ width: '100%', maxHeight: 360, objectFit: 'contain', borderRadius: 10, background: '#0b1220', display: 'block' }} />
                  ) : selectedDocument.type === 'application/pdf' || /\.pdf$/i.test(selectedDocument.name) ? (
                    <iframe src={documentationPreviewUrl ?? ''} title={selectedDocument.name} style={{ width: '100%', height: 420, borderRadius: 10, border: 'none', background: 'white' }} />
                  ) : (
                    <div style={{ display: 'grid', placeItems: 'center', minHeight: 220, border: '1px dashed rgba(148, 163, 184, 0.45)', borderRadius: 10, background: 'rgba(15, 23, 42, 0.72)', textAlign: 'center', padding: 18 }}>
                      <div style={{ display: 'grid', placeItems: 'center', gap: 12 }}>
                        <FileText size={28} />
                        <div>
                          <b>{selectedDocument.name}</b>
                          <p style={{ margin: '6px 0 0', color: '#cbd5e1' }}>Este tipo de archivo no admite vista previa embebida en el navegador; puedes abrirlo o descargarlo para revisarlo.</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {filteredDocuments.length ? (
                <div className="people-grid">
                  {filteredDocuments.map((document) => (
                    <div className="person-card document-card" key={document.id}>
                      <button className="person-card-main" type="button" onClick={() => setSelectedDocument(document)}>
                        <div className="review-avatar">
                          {getDocumentKindFromName(document.name, document.type) === 'pdf' ? <FileText size={18} /> : getDocumentKindFromName(document.name, document.type) === 'image' ? <FileImage size={18} /> : <FileText size={18} />}
                        </div>
                        <div>
                          <b>{document.name}</b>
                          <span>{getDocumentLabel(document)} · {formatDocumentSize(document.size)} · {new Date(document.createdAt).toLocaleDateString('es-PE')}</span>
                        </div>
                        <ExternalLink size={17} />
                      </button>
                      <button className="icon-button person-card-delete" type="button" aria-label={`Eliminar ${document.name}`} title="Eliminar documento" onClick={() => setPendingDocumentDelete(document)}><Trash2 size={17} /></button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty-state">No hay documentos de este tipo cargados. Sube archivos para dejar disponible la documentación del sistema.</div>
              )}
            </div>
            <div className={`panel dashboard-section ${activeSection === 'integraciones' ? '' : 'dashboard-section-hidden'}`} id="integraciones">
              <div className="panel-heading compact-heading"><div><span className="section-kicker">SERVICIOS</span><h2>Integraciones</h2></div><ExternalLink size={19} /></div>
              <div className="integration-live-header">
                <div>
                  <b>Monitor de reconocimiento en tiempo real</b>
                  <span>{lastDashboardSync ? `Última sincronización: ${formatDate(lastDashboardSync)}` : 'Esperando datos del backend'}</span>
                </div>
                <button type="button" className="button button--outline integration-refresh-button" onClick={() => void refreshDashboardData()} disabled={dashboardSyncing}>
                  <Activity size={14} /> {dashboardSyncing ? 'Sincronizando...' : 'Actualizar ahora'}
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginTop: 14 }}>
                <div style={{ background: 'rgba(15, 23, 42, 0.72)', border: '1px solid rgba(148, 163, 184, 0.22)', borderRadius: 16, padding: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(14, 165, 233, 0.12)', display: 'grid', placeItems: 'center', color: '#7dd3fc' }}><Database size={18} /></div>
                      <div>
                        <b>Supabase</b>
                        <small style={{ display: 'block', color: '#94a3b8' }}>Base de datos</small>
                      </div>
                    </div>
                    <span className="status-pill">{appConfig.usesDemoRecognition ? 'Configurar' : 'Conectado'}</span>
                  </div>
                  <p style={{ margin: 0, color: '#cbd5e1', lineHeight: 1.6 }}>Persistencia de usuarios, autenticación y almacenamiento seguro de metadatos biométricos.</p>
                </div>

                <div style={{ background: 'rgba(15, 23, 42, 0.72)', border: '1px solid rgba(148, 163, 184, 0.22)', borderRadius: 16, padding: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(16, 185, 129, 0.12)', display: 'grid', placeItems: 'center', color: '#34d399' }}><Server size={18} /></div>
                      <div>
                        <b>FastAPI</b>
                        <small style={{ display: 'block', color: '#94a3b8' }}>Servicio principal</small>
                      </div>
                    </div>
                    <span className="status-pill">{appConfig.usesDemoRecognition ? 'Demo' : 'Operativo'}</span>
                  </div>
                  <p style={{ margin: 0, color: '#cbd5e1', lineHeight: 1.6 }}>API de reconocimiento facial, validación y lógica de negocio para la identidad digital corporativa.</p>
                </div>
              </div>
              <div className="integration-metrics-grid">
                <div className="integration-metric integration-metric--neutral"><span>Total de intentos</span><strong>{validationCount}</strong><small>Eventos persistidos en Supabase</small></div>
                <div className="integration-metric integration-metric--success"><span>Registros exitosos</span><strong>{recognizedCount}</strong><small>{utilityRate}% de utilidad del reconocimiento</small></div>
                <div className="integration-metric integration-metric--failed"><span>Registros rechazados</span><strong>{failedCount}</strong><small>{rejectionRate}% de rechazo</small></div>
                <div className="integration-metric integration-metric--info"><span>Personas registradas</span><strong>{registeredCount}</strong><small>Perfiles biométricos actuales</small></div>
              </div>
              <div className="integration-log">
                <div className="integration-log-heading">
                  <div><b>Log reciente de registros</b><span>Se actualiza automáticamente cada 15 segundos</span></div>
                  <span className={`integration-live-status ${dashboardSyncing ? 'integration-live-status--syncing' : ''}`}><i /> {dashboardSyncing ? 'Sincronizando' : 'En tiempo real'}</span>
                </div>
                {integrationRecentEvents.length ? <div className="integration-log-list">{integrationRecentEvents.map((event) => (
                  <div className="integration-log-row" key={event.id}>
                    <span className={`integration-log-indicator ${event.success ? 'integration-log-indicator--success' : 'integration-log-indicator--failed'}`}>{event.success ? 'OK' : '!'}</span>
                    <div><b>{event.success ? 'Registro exitoso' : 'Registro rechazado'}</b><span>{event.message || event.error_code || 'Reconocimiento facial'} · {formatDate(event.created_at)}</span></div>
                    <strong className={event.success ? '' : 'history-result--failed'}>{event.similarity == null ? '—' : `${Math.round(event.similarity * 100)}%`}</strong>
                  </div>
                ))}</div> : <div className="empty-state">No hay registros de reconocimiento en Supabase.</div>}
              </div>
            </div>

            <div className={`panel dashboard-section ${activeSection === 'seguridad' ? '' : 'dashboard-section-hidden'}`} id="seguridad">
              <div className="panel-heading compact-heading"><div><span className="section-kicker">CONTROL</span><h2>Seguridad</h2></div><ShieldCheck size={19} /></div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginTop: 14 }}>
                <div style={{ background: 'rgba(15, 23, 42, 0.72)', border: '1px solid rgba(148, 163, 184, 0.22)', borderRadius: 16, padding: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(16, 185, 129, 0.12)', display: 'grid', placeItems: 'center', color: '#34d399' }}><CheckCircle2 size={18} /></div>
                    <b>Autenticación</b>
                  </div>
                  <p style={{ margin: 0, color: '#cbd5e1', lineHeight: 1.6 }}>Las imágenes se procesan con confirmación explícita y cada acceso queda registrado en la auditoría del sistema.</p>
                </div>

                <div style={{ background: 'rgba(15, 23, 42, 0.72)', border: '1px solid rgba(148, 163, 184, 0.22)', borderRadius: 16, padding: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(244, 114, 182, 0.12)', display: 'grid', placeItems: 'center', color: '#f9a8d4' }}><ShieldCheck size={18} /></div>
                    <b>Protección</b>
                  </div>
                  <p style={{ margin: 0, color: '#cbd5e1', lineHeight: 1.6 }}>Sesiones protegidas con validación facial, control de toma de decisiones y trazabilidad para cada operación.</p>
                </div>
              </div>
            </div>
          </section>
        </div>
      </main>
      {(pendingDocumentUpload || pendingDocumentDelete) && (
        <div className="document-confirm-backdrop" role="presentation" onClick={() => { if (!documentActionBusy) { setPendingDocumentUpload(null); setPendingDocumentDelete(null) } }}>
          <section className="document-confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="document-confirm-title" onClick={(event) => event.stopPropagation()}>
            <div className="panel-heading compact-heading">
              <div>
                <span className="section-kicker">DOCUMENTACIÓN</span>
                <h2 id="document-confirm-title">{pendingDocumentUpload ? 'Confirmar subida' : 'Confirmar eliminación'}</h2>
              </div>
              <button className="icon-button" type="button" aria-label="Cerrar confirmación" disabled={documentActionBusy} onClick={() => { setPendingDocumentUpload(null); setPendingDocumentDelete(null) }}><X size={18} /></button>
            </div>
            <div className="document-confirm-icon">{pendingDocumentUpload ? <Upload size={22} /> : <Trash2 size={22} />}</div>
            <p>{pendingDocumentUpload ? `¿Quieres guardar “${pendingDocumentUpload.name}” en la documentación local?` : `¿Quieres eliminar “${pendingDocumentDelete?.name}”? Esta acción no se puede deshacer.`}</p>
            <div className="editor-actions">
              <button className="button button--outline" type="button" disabled={documentActionBusy} onClick={() => { setPendingDocumentUpload(null); setPendingDocumentDelete(null) }}>Cancelar</button>
              <button className={`button ${pendingDocumentUpload ? 'button--primary' : 'button--danger'}`} type="button" disabled={documentActionBusy} onClick={() => void (pendingDocumentUpload ? confirmDocumentationUpload() : confirmDocumentationDelete())}>
                {documentActionBusy ? <span className="spinner" /> : pendingDocumentUpload ? <><Upload size={16} /> Confirmar subida</> : <><Trash2 size={16} /> Eliminar archivo</>}
              </button>
            </div>
          </section>
        </div>
      )}
      {notificationsOpen && <aside className="notifications-drawer" aria-label="Alertas del sistema">
        <div className="notifications-heading"><div><span className="section-kicker">CENTRO DE ALERTAS</span><h2>Alertas presentadas</h2></div><button className="icon-button" type="button" aria-label="Cerrar alertas" onClick={() => setNotificationsOpen(false)}><X size={18} /></button></div>
        {alerts.length ? <div className="notifications-list">{alerts.map((event) => <div className="notification-item" key={event.id}><span className="notification-icon"><Bell size={15} /></span><div><b>{event.event_type} · {event.source}</b><span>{event.message || event.error_code || 'Intento fallido registrado'}</span><small>{formatDate(event.created_at)}</small></div></div>)}</div> : <div className="empty-state">No hay alertas registradas.</div>}
      </aside>}
      {helpOpen && <aside className="help-drawer" aria-label="Ayuda del dashboard">
        <div className="notifications-heading"><div><span className="section-kicker">CENTRO DE AYUDA</span><h2>Guía rápida</h2></div><button className="icon-button" type="button" aria-label="Cerrar ayuda" onClick={() => setHelpOpen(false)}><X size={18} /></button></div>
        <div className="help-list">
          <div><span className="help-step">01</span><div><b>Reconoce un rostro</b><p>Sube una imagen o activa la cámara para iniciar el análisis.</p></div></div>
          <div><span className="help-step">02</span><div><b>Revisa el resultado</b><p>Consulta la coincidencia, confianza y datos recuperados.</p></div></div>
          <div><span className="help-step">03</span><div><b>Gestiona documentos</b><p>Abre Documentación para subir, consultar o eliminar archivos.</p></div></div>
          <div><span className="help-step">Esc</span><div><b>Cierra ventanas</b><p>Pulsa Escape para cerrar paneles, modales y menús abiertos.</p></div></div>
        </div>
      </aside>}
    </div>
  )
}