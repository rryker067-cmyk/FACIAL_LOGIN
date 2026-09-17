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

## Próximos módulos

- `backend/`: API FastAPI, autenticación, validación y persistencia.
- `ml/`: modelos, embeddings, evaluación y versionado de inferencias.
- `infra/`: configuración de Supabase, despliegue y observabilidad.
