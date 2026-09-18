import { appConfig } from '../config/env'
import { emptyPerson, PersonRecord } from '../types/person'

async function requestJson<T>(endpoint: string, body?: Record<string, unknown>, method = 'POST', extraHeaders: Record<string, string> = {}): Promise<T> {
  if (appConfig.usesDemoRecognition) {
    const error = new Error('La API de reconocimiento no está configurada. Define VITE_API_URL.') as Error & { code?: string }
    error.code = 'API_NOT_CONFIGURED'
    throw error
  }

  const response = await fetch(`${appConfig.apiUrl}${endpoint}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    const detail = error?.detail
    const apiError = new Error(
      typeof detail === 'string'
        ? detail
        : detail?.message ?? 'No se pudo completar la solicitud al backend',
    ) as Error & { code?: string; status?: number }
    apiError.code = typeof detail === 'object' ? detail?.error : undefined
    apiError.status = response.status
    throw apiError
  }

  return response.json() as Promise<T>
}

export async function recognizeFace(image: string): Promise<PersonRecord> {
  const result = await requestJson<Record<string, string | number>>('/api/v1/face-recognition/recognize', { image })
  return {
    ...emptyPerson,
    ...Object.fromEntries(Object.entries(result).map(([key, value]) => [key, String(value)])),
  }
}

export async function listUsers(): Promise<Array<PersonRecord & { id: string; email?: string; imagen_url?: string }>> {
  return requestJson('/api/v1/users', undefined, 'GET')
}

const authHeaders = (): Record<string, string> => {
  const token = localStorage.getItem('veris_access_token')
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export type AuditEvent = {
  id: string
  event_type: string
  user_id?: string | null
  similarity?: number | null
  success: boolean
  source: string
  message?: string | null
  error_code?: string | null
  metadata?: Record<string, unknown> | null
  created_at: string
}

export async function listAuditEvents(): Promise<AuditEvent[]> {
  return requestJson('/api/v1/auth/history', undefined, 'GET', authHeaders())
}

export async function verifyUserFace(userId: string, imagen_base64: string): Promise<{ verification_token: string; expires_in: number }> {
  return requestJson(`/api/v1/users/${userId}/verify-face`, { imagen_base64 }, 'POST', authHeaders())
}

export async function updateUser(userId: string, data: Record<string, unknown>, verificationToken: string): Promise<Record<string, unknown>> {
  return requestJson(`/api/v1/users/${userId}`, data, 'PATCH', {
    ...authHeaders(),
    'X-Face-Verification-Token': verificationToken,
  })
}

export async function deleteUser(userId: string, verificationToken: string): Promise<void> {
  await requestJson(`/api/v1/users/${userId}`, undefined, 'DELETE', {
    ...authHeaders(),
    'X-Face-Verification-Token': verificationToken,
  })
}

export type DashboardStats = {
  registered_count: number
  validation_count: number
  recognized_count: number
  unrecognized_count: number
  recognition_rate: number
  activity_by_day: Record<string, number>
  recent_events: Array<{
    id: string
    user_id?: string | null
    similarity: number
    recognized: boolean
    source: string
    created_at: string
  }>
}

export async function getDashboardStats(): Promise<DashboardStats> {
  return requestJson('/api/v1/dashboard/stats', undefined, 'GET')
}

export async function loginWithFace(image: string): Promise<{
  access_token: string
  user_id: string
  nombre: string
  match_percentage: string
  email?: string | null
  dni?: string | null
  edad?: number | null
  telefono?: string | null
}> {
  return requestJson('/api/v1/auth/login-face', { imagen_base64: image })
}

export async function loginWithCredentials(email: string, password: string): Promise<{
  access_token: string
  user_id: string
  nombre: string
  role: string
}> {
  return requestJson('/api/v1/auth/login', { email, password })
}

export async function registerUserWithFace(data: {
  nombre: string
  apellido: string
  edad: number
  telefono: string
  email?: string
  dni?: string
  imagenes_base64: string[]
}): Promise<{ id: string; nombre: string; apellido: string; imagen_url: string; validation_score?: number; sample_count?: number }> {
  return requestJson('/api/v1/users/register', data)
}
