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
La documentación técnica completa está en
[docs/documentacion-completa.md](docs/documentacion-completa.md).

## Autenticación y Supabase

El inicio de sesión con correo y contraseña se valida en el backend mediante
`supabase.auth.sign_in_with_password`; ya no existen credenciales hardcodeadas en
el frontend. Configura `SUPABASE_URL` y `SUPABASE_KEY` en Render usando la URL y
la clave `service_role` de tu proyecto Supabase. Esta clave solo debe existir en
el backend; nunca la expongas en variables `VITE_*` ni en el navegador.

Antes del primer despliegue, ejecuta [supabase/recognition_events.sql](supabase/recognition_events.sql)
en el SQL Editor de Supabase. Ese script crea la tabla de auditoría que registra
los accesos correctos, los intentos fallidos y las verificaciones faciales.

El inicio de sesión facial calcula el embedding en el backend y consulta la
función RPC `match_face_1n` sobre la tabla `usuarios`. El acceso solo se concede
cuando Supabase devuelve una coincidencia mínima del 75%; cualquier valor
inferior se rechaza.

El modelo ArcFace de 512 dimensiones se coloca en
`backend/app/models/face_recognition.onnx`. Como el archivo pesa más de 100 MB,
el Dockerfile lo descarga automáticamente durante el build de Render cuando no
está incluido en el contexto.

Las fotografías de registro se guardan en Supabase Storage, en un bucket público
llamado `avatars`. Si ese bucket no existe, el registro se rechaza y no se crea
un usuario con una imagen de reemplazo.

## Próximos módulos

- `backend/`: API FastAPI, autenticación, validación y persistencia.
- `ml/`: modelos, embeddings, evaluación y versionado de inferencias.
- `infra/`: configuración de Supabase, despliegue y observabilidad.
