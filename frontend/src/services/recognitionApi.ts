import { appConfig } from '../config/env'
import { emptyPerson, PersonRecord } from '../types/person'

async function requestJson<T>(endpoint: string, body: Record<string, unknown>): Promise<T> {
  if (appConfig.usesDemoRecognition) {
    await new Promise((resolve) => window.setTimeout(resolve, 700))
    return { ...(emptyPerson as T) } as T
  }

  const response = await fetch(`${appConfig.apiUrl}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
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
  return { ...emptyPerson, ...Object.fromEntries(Object.entries(result).map(([key, value]) => [key, String(value)])) }
}

export async function loginWithFace(image: string): Promise<{ access_token: string; user_id: string; nombre: string; match_percentage: string }> {
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
  imagen_base64: string
}): Promise<{ id: string; nombre: string; apellido: string; imagen_url: string }> {
  return requestJson('/api/v1/users/register', data)
}
