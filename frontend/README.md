# Frontend de Reconocimiento Facial

Dashboard operativo construido con React, TypeScript, Vite y `lucide-react`.

## Desarrollo

```bash
cd frontend
npm install
npm run dev
```

## Variables de entorno

Copia `frontend/.env.example` como `frontend/.env.local` y define `VITE_API_URL`
para conectar FastAPI. En producción debe apuntar a la URL pública del backend,
por ejemplo `https://reconocimiento-facial-wgp4.onrender.com/api`. Vite no lee
el `.env` de la raíz cuando se ejecuta desde `frontend/`. Sin esa variable, las
operaciones de reconocimiento fallan explícitamente y no se generan datos
simulados.

## Estructura

- `src/components`: piezas visuales reutilizables.
- `src/config`: configuración de entorno y endpoints.
- `src/services`: comunicación con FastAPI y futuros adaptadores de Supabase.
- `src/types`: contratos de datos del dominio.
- `src/App.tsx`: composición de la pantalla principal.
- `src/styles.css`: sistema visual y responsive.

## Contrato esperado de reconocimiento

`POST {VITE_API_URL}/api/v1/face-recognition/recognize`

```json
{ "image": "data:image/jpeg;base64,..." }
```

La respuesta debe incluir cualquier combinación de `nombre`, `apellido`, `edad`, `dni` y `telefono`.
