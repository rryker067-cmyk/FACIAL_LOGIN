const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000'

export const appConfig = {
  apiUrl,
  usesDemoRecognition: !import.meta.env.VITE_API_URL,
} as const
