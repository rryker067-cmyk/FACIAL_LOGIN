const normalizeApiUrl = (value: string) => {
  if (!value) return 'http://localhost:8000'

  const withoutTrailingSlash = value.trim().replace(/\/+$/, '')
  return withoutTrailingSlash.replace(/\/api(?:\/v\d+)?$/, '')
}

const apiUrl = normalizeApiUrl(import.meta.env.VITE_API_URL || 'http://localhost:8000')

export const appConfig = {
  apiUrl,
  usesDemoRecognition: !import.meta.env.VITE_API_URL,
} as const
