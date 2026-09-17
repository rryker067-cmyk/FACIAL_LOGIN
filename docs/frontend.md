# Frontend

## Ejecución

```bash
cd frontend
npm install
npm run dev
```

## Variables de entorno

Copia `frontend/.env.example` como `.env.local` y define `VITE_API_URL`.

## Estructura principal

- `src/components`: componentes reutilizables.
- `src/pages`: pantallas de la aplicación.
- `src/services`: conexión con la API.
- `src/config`: configuración de entorno.
- `src/types`: tipos del dominio.

## API esperada

`POST {VITE_API_URL}/api/v1/face-recognition/recognize`

```json
{ "image": "data:image/jpeg;base64,..." }
```
