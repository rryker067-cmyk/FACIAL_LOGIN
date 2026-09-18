export type PersonRecord = {
  nombre: string
  apellido: string
  edad: string
  dni: string
  telefono: string
  email?: string
  imagen_url?: string
  similarity?: string
  created_at?: string
}

export const emptyPerson: PersonRecord = {
  nombre: '',
  apellido: '',
  edad: '',
  dni: '',
  telefono: '',
  similarity: '0',
}
