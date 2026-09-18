# Documentación del proyecto

Este directorio centraliza la documentación del proyecto para mantener la carpeta raíz enfocada en la app y la configuración necesaria.

## Estructura recomendada

- `backend/`: lógica del backend, API y autenticación.
- `frontend/`: aplicación React + Vite.
- `docs/`: documentación del proyecto y guías técnicas.
- `Dockerfile`: contenedor de la aplicación.
- `requirements.txt`: dependencias Python.

## Visión general

La aplicación combina un backend en FastAPI con un frontend en React para un sistema de autenticación con reconocimiento facial, validación de liveness y persistencia con Supabase.

## Puntos de entrada

- Backend: `backend/app/main.py`
- Frontend: `frontend/src/main.tsx`
- Variables de entorno: `.env.example` y `frontend/.env.example`

## Documentación completa

La guía técnica, el modelo de datos, los endpoints, los flujos de cámara,
Supabase, despliegue, seguridad y fases de mantenimiento están documentados en
[documentacion-completa.md](documentacion-completa.md).
