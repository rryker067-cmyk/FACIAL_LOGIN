# Reconocimiento Facial

Proyecto dividido por responsabilidades para un sistema de identidad con reconocimiento facial.

## Frontend

La aplicación web vive en [frontend](frontend) y está construida con React, TypeScript y Vite.

```bash
cd frontend
npm install
npm run dev
```

Consulta la arquitectura, el contrato de FastAPI y las variables de entorno en [frontend/README.md](frontend/README.md).

## Autenticación y Supabase

El inicio de sesión con correo y contraseña se valida en el backend mediante
`supabase.auth.sign_in_with_password`; ya no existen credenciales hardcodeadas en
el frontend. Configura `SUPABASE_URL` y `SUPABASE_KEY` en `backend/.env` usando
la URL y la clave anónima de tu proyecto Supabase, y crea los usuarios desde
Supabase Auth.

El inicio de sesión facial calcula el embedding en el backend y consulta la
función RPC `match_face_1n` sobre la tabla `usuarios`. El acceso solo se concede
cuando Supabase devuelve una coincidencia mínima del 75%; cualquier valor
inferior se rechaza.

El modelo ArcFace de 512 dimensiones se coloca en
`backend/app/models/face_recognition.onnx`. Como el archivo pesa más de 100 MB,
el Dockerfile lo descarga automáticamente durante el build de Render cuando no
está incluido en el contexto.

## Próximos módulos

- `backend/`: API FastAPI, autenticación, validación y persistencia.
- `ml/`: modelos, embeddings, evaluación y versionado de inferencias.
- `infra/`: configuración de Supabase, despliegue y observabilidad.
