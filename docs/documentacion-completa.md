# Documentación completa — Sistema de autenticación facial

## 1. Arquitectura propuesta

El sistema utiliza una arquitectura de tres capas:

```text
React + TypeScript + Vite
             │
             │ HTTP/JSON y data URLs de cámara
             ▼
FastAPI + Python
  ├── Validación de calidad de imagen
  ├── Extracción de embedding facial con ONNX/ArcFace
  ├── Autenticación con Supabase Auth
  └── Consultas vectoriales con pgvector
             │
             ▼
Supabase
  ├── Auth
  ├── PostgreSQL: tabla usuarios
  ├── RPC match_face_1n
  └── Storage: bucket avatars
```

React solamente captura la imagen, muestra el resultado y consume la API. La
imagen, la contraseña y el embedding no se validan de forma definitiva en el
navegador. La decisión de autenticación se toma en FastAPI y Supabase.

### Objetivos funcionales

- Registrar usuarios desde una fotografía capturada por la cámara.
- Evitar registros duplicados por rostro, correo o DNI.
- Validar correo y contraseña contra Supabase Auth.
- Validar el rostro contra embeddings almacenados en Supabase.
- Exigir una similitud facial mínima del 75%.
- Mostrar los datos del usuario reconocido antes de abrir el dashboard.
- Cargar usuarios y fotografías desde Supabase, sin datos biométricos simulados.
- Rechazar explícitamente la operación si Supabase no está configurado.

## 2. Estructura del proyecto

```text
FACIAL_LOGIN/
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── config.py
│   │   ├── api/v1/
│   │   │   ├── router.py
│   │   │   ├── auth.py
│   │   │   └── users.py
│   │   ├── core/
│   │   │   ├── face_embedder.py
│   │   │   ├── liveness.py
│   │   │   └── security.py
│   │   ├── db/
│   │   │   ├── supabase_client.py
│   │   │   └── repositories/user_repository.py
│   │   ├── schemas/
│   │   │   ├── auth.py
│   │   │   └── user.py
│   │   └── models/face_recognition.onnx
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── FacialModal.tsx
│   │   │   ├── AntiBotCaptcha.tsx
│   │   │   └── Field.tsx
│   │   ├── pages/
│   │   │   ├── Login.tsx
│   │   │   ├── Dashboard.tsx
│   │   │   └── Home.tsx
│   │   ├── services/recognitionApi.ts
│   │   ├── config/env.ts
│   │   ├── types/person.ts
│   │   └── App.tsx
│   ├── .env.example
│   └── package.json
├── docs/
│   ├── README.md
│   └── documentacion-completa.md
├── Dockerfile
├── render.yaml
├── requirements.txt
└── README.md
```

## 3. Librerías y tecnologías utilizadas

Esta aplicación está enfocada en autenticación facial. No ejecuta SciPy ni
NLTK y no necesita esas librerías para registrar, comparar o identificar
rostros.

### 3.1 Backend Python

Las dependencias están declaradas en `requirements.txt`.

| Librería | Versión | Uso en el reconocimiento facial |
|---|---:|---|
| `fastapi` | `0.111.0` | Define los endpoints REST, valida solicitudes y devuelve respuestas HTTP |
| `uvicorn[standard]` | `0.30.1` | Servidor ASGI para ejecutar FastAPI en desarrollo y producción |
| `pydantic` | `2.7.4` | Modelos y validación de los payloads de login, registro e imágenes |
| `pydantic-settings` | `2.3.4` | Carga y valida variables de entorno del backend |
| `onnxruntime` | `1.30.0` | Ejecuta el modelo ArcFace ONNX para producir embeddings faciales |
| `opencv-python-headless` | `4.10.0.82` | Decodifica imágenes, detecta rostros y calcula controles de calidad |
| `numpy` | `1.26.4` | Manipula matrices, normaliza vectores y calcula la norma L2 |
| `supabase` | `2.5.1` | Conecta con Auth, PostgreSQL, RPC y Storage de Supabase |
| `python-jose[cryptography]` | `3.3.0` | Firma los JWT de sesión emitidos después del reconocimiento |
| `python-multipart` | `0.0.9` | Soporte de formularios multipart para FastAPI y futuras cargas |

### 3.2 Frontend React

Las dependencias están declaradas en `frontend/package.json`.

| Librería | Versión declarada | Uso |
|---|---:|---|
| `react` | `latest` | Componentes y estado de la interfaz |
| `react-dom` | `latest` | Renderizado de React en el navegador |
| `typescript` | `latest` | Tipado estático del frontend |
| `vite` | `latest` | Servidor de desarrollo y empaquetado de producción |
| `@vitejs/plugin-react` | `latest` | Integración de React y JSX/TSX con Vite |
| `lucide-react` | `latest` | Iconos de cámara, usuario, estado y dashboard |
| `@types/react` | `latest` | Tipos TypeScript para React |
| `@types/react-dom` | `latest` | Tipos TypeScript para React DOM |

El frontend usa `fetch` nativo para comunicarse con FastAPI. No incorpora un
SDK de Supabase en el navegador: las operaciones sensibles se ejecutan desde
el backend.

### 3.3 APIs nativas del navegador

Además de las dependencias npm, se utilizan APIs estándar del navegador:

- `navigator.mediaDevices.getUserMedia`: acceso a la cámara de vídeo.
- `HTMLVideoElement`: muestra el vídeo en tiempo real.
- `HTMLCanvasElement`: captura un fotograma y lo convierte en JPEG/PNG.
- `fetch`: envía las imágenes y recibe los perfiles reconocidos.
- `localStorage`: conserva temporalmente el historial local del dashboard.
- `IndexedDB`: conserva documentos cargados en el navegador.

### 3.4 Servicios externos

| Servicio | Uso |
|---|---|
| Supabase Auth | Verificación de correo y contraseña |
| Supabase PostgreSQL | Usuarios y embeddings faciales |
| Supabase pgvector | Comparación vectorial 1:N |
| Supabase Storage | Fotografías reales en el bucket `avatars` |
| Render | Ejecución y despliegue del backend |
| Vercel u hosting estático | Despliegue del frontend |

### 3.5 Librerías estándar y utilidades

El backend también utiliza módulos estándar de Python: `base64` para
decodificar imágenes, `uuid` para nombrar archivos, `logging` para errores,
`pathlib` para rutas, `shutil`, `urllib.request` y `zipfile` para descargar y
extraer el modelo ONNX, `datetime` para expiración de tokens y `typing` para
anotaciones.

## 4. Componentes y responsabilidades

| Componente | Responsabilidad |
|---|---|
| `frontend` | Interfaz, cámara, formularios y dashboard |
| `FacialModal` | Registro, previsualización, retoma de fotografía e inicio facial |
| `Dashboard` | Reconocimiento desde cámara, métricas y datos de usuarios |
| `recognitionApi.ts` | Cliente HTTP tipado para FastAPI |
| `FastAPI` | Orquestación de validación, inferencia y persistencia |
| `LightweightLiveness` | Decodificación, resolución, desenfoque e iluminación |
| `FaceEmbedder` | Modelo ONNX y vector normalizado de 512 dimensiones |
| `UserRepository` | Acceso exclusivo a Supabase y Storage |
| `Supabase Auth` | Correo, contraseña y sesión de credenciales |
| `PostgreSQL/pgvector` | Almacenamiento y búsqueda de embeddings |
| `Supabase Storage` | Fotografías reales de los usuarios |

## 5. Modelo de datos en Supabase

La tabla principal utilizada por la aplicación es `usuarios`. Debe contener
como mínimo:

```sql
create extension if not exists vector;

create table public.usuarios (
    id uuid primary key default gen_random_uuid(),
    nombre varchar(150) not null,
    apellido varchar(150) not null,
    edad integer not null check (edad between 18 and 120),
    telefono varchar(50) not null,
    email varchar(200),
    dni varchar(50),
    imagen_url text not null,
    face_embedding vector(512) not null,
    created_at timestamptz not null default now()
);

create index usuarios_email_idx on public.usuarios (lower(email));
create index usuarios_dni_idx on public.usuarios (dni);
```

Para que el resumen operativo sea persistente y consistente entre sesiones,
también debe existir la tabla de eventos de reconocimiento:

```sql
create table public.recognition_events (
    id uuid primary key default gen_random_uuid(),
    user_id uuid references public.usuarios(id) on delete set null,
    similarity numeric(6,5) not null default 0,
    recognized boolean not null,
    source varchar(30) not null default 'dashboard',
    created_at timestamptz not null default now()
);

create index recognition_events_created_at_idx
    on public.recognition_events (created_at desc);
```

El backend registra los intentos reconocidos y no reconocidos desde los
endpoints de reconocimiento facial y login facial. El endpoint
`GET /api/v1/dashboard/stats` calcula desde Supabase los perfiles, intentos,
porcentaje de coincidencias, no reconocidos y actividad diaria combinando altas
de usuarios y validaciones.

La contraseña no se almacena en `usuarios`. Las credenciales pertenecen a
Supabase Auth. La columna `face_embedding` contiene el vector generado por
ArcFace y normalizado con norma L2.

### Restricciones importantes

- La dimensión debe ser exactamente `512`.
- No se deben insertar embeddings de 128 dimensiones.
- `imagen_url` debe apuntar a una fotografía real del bucket `avatars`.
- El registro solo acepta una data URL con prefijo `data:image/...`.
- El correo y el DNI se comprueban antes de insertar.

## 6. Función RPC de búsqueda facial

La aplicación llama a `match_face_1n`. La función debe recibir el vector y el
umbral, y devolver como mínimo un identificador y la similitud:

```sql
create or replace function public.match_face_1n(
    query_embedding vector(512),
    match_threshold float
)
returns table (
    id uuid,
    similarity float
)
language sql
stable
as $$
    select
        u.id,
        1 - (u.face_embedding <=> query_embedding) as similarity
    from public.usuarios u
    where 1 - (u.face_embedding <=> query_embedding) >= match_threshold
    order by u.face_embedding <=> query_embedding
    limit 1;
$$;
```

La implementación también acepta el nombre `user_id` si el RPC existente lo
devuelve. Después de la coincidencia, el backend consulta la fila completa de
`usuarios` para recuperar correo, DNI, teléfono, edad e imagen.

## 7. Autenticación y autorización

### 6.1 Inicio con correo y contraseña

1. El usuario introduce correo y contraseña.
2. React llama a `POST /api/v1/auth/login`.
3. FastAPI normaliza el correo a minúsculas.
4. FastAPI ejecuta `supabase.auth.sign_in_with_password`.
5. Supabase devuelve el token o rechaza las credenciales.
6. El backend responde con el token, el ID, el nombre y el rol.

No existen credenciales hardcodeadas en el frontend.

### 6.2 Inicio con rostro

1. El usuario activa la cámara.
2. React captura una fotografía.
3. El backend verifica calidad y liveness básico.
4. ArcFace genera un embedding de 512 dimensiones.
5. Supabase ejecuta `match_face_1n`.
6. Solo se acepta una similitud igual o superior a `0.75`.
7. FastAPI obtiene el perfil completo desde `usuarios`.
8. Se genera un JWT de aplicación.
9. React muestra las credenciales reconocidas durante cinco segundos.
10. Se abre el dashboard.

Una similitud menor al 75% produce `401 FACE_NOT_RECOGNIZED`.

## 8. Registro de un usuario

El flujo de registro es:

```text
Abrir cámara
    │
    ▼
Capturar fotografía sin detener el vídeo
    │
    ├── Usar esta foto
    └── Tomar otra
    │
    ▼
POST /api/v1/users/register
    │
    ├── Imagen capturada por cámara
    ├── Calidad y liveness
    ├── Embedding de 512 dimensiones
    ├── Duplicado facial >= 75%
    ├── Duplicado de email/DNI
    ├── Subida a Storage
    └── Inserción en usuarios
```

La vista previa lateral permite confirmar la imagen antes de enviarla. Si no
existe el bucket `avatars`, el backend devuelve un error y no utiliza una
imagen de sustitución.

## 9. Validación de calidad y liveness

`LightweightLiveness` realiza validaciones previas al modelo:

- Decodificación Base64.
- Resolución mínima de `160 x 160`.
- Desenfoque mediante varianza del Laplaciano.
- Umbral de desenfoque: `60.0`.
- Brillo medio entre `40` y `220`.

Estos controles son validaciones de calidad y presencia básica, no sustituyen
un sistema avanzado de detección anti-spoofing. Una foto borrosa, muy oscura,
sobreexpuesta o demasiado pequeña se rechaza con `422`.

## 10. Fotografías y Supabase Storage

Crear un bucket público llamado `avatars` en Supabase Storage. La aplicación
guarda los archivos con este patrón:

```text
avatars/users/<uuid>.jpg
avatars/users/<uuid>.png
```

Se recomienda permitir:

- `SELECT` público para mostrar la imagen del perfil.
- `INSERT` únicamente mediante el flujo controlado del backend.
- Políticas de actualización y eliminación restringidas al administrador.

La aplicación no usa imágenes de Unsplash ni URLs de reemplazo.

## 11. API del backend

La API base es `/api/v1`.

### Salud del servicio

```http
GET /health
```

Respuesta:

```json
{
  "status": "healthy",
  "service": "Biometric Enterprise Auth API",
  "version": "1.0.0",
  "supabase_configured": true,
  "face_model_loaded": true
}
```

### Credenciales

```http
POST /api/v1/auth/login
Content-Type: application/json
```

```json
{
  "email": "persona@example.com",
  "password": "********"
}
```

Respuesta exitosa:

```json
{
  "access_token": "eyJ...",
  "token_type": "bearer",
  "user_id": "uuid",
  "nombre": "Persona",
  "role": "Usuario"
}
```

### Login facial

```http
POST /api/v1/auth/login-face
Content-Type: application/json
```

```json
{
  "imagen_base64": "data:image/jpeg;base64,..."
}
```

Respuesta exitosa:

```json
{
  "access_token": "eyJ...",
  "token_type": "bearer",
  "user_id": "uuid",
  "nombre": "Nombre Apellido",
  "match_percentage": "86.42%",
  "email": "persona@example.com",
  "dni": "12345678",
  "edad": 25,
  "telefono": "999999999"
}
```

### Reconocimiento para dashboard

```http
POST /api/v1/face-recognition/recognize
Content-Type: application/json
```

```json
{
  "image": "data:image/jpeg;base64,..."
}
```

Cuando encuentra una persona, devuelve nombre, datos personales, `imagen_url`
y `similarity`. Cuando no encuentra una coincidencia, devuelve campos vacíos y
similitud `0`; el frontend muestra una alerta amarilla.

### Usuarios

```http
GET  /api/v1/users
POST /api/v1/users/register
```

Registro:

```json
{
  "nombre": "Ana",
  "apellido": "Pérez",
  "edad": 25,
  "telefono": "999999999",
  "email": "ana@example.com",
  "dni": "12345678",
  "imagen_base64": "data:image/jpeg;base64,..."
}
```

## 12. Respuestas de error

| Código | Error | Causa |
|---:|---|---|
| 400 | Imagen inválida | Base64 no decodificable |
| 401 | `INVALID_CREDENTIALS` | Correo o contraseña incorrectos |
| 401 | `FACE_NOT_RECOGNIZED` | Similitud facial menor al 75% |
| 409 | `USER_ALREADY_REGISTERED` | Rostro, correo o DNI duplicado |
| 422 | `CAMERA_IMAGE_REQUIRED` | Registro sin imagen real de cámara |
| 422 | Error de calidad | Imagen pequeña, borrosa o con mala iluminación |
| 503 | `SUPABASE_NOT_CONFIGURED` | Backend sin URL o clave válida |
| 503 | `AVATAR_STORAGE_UNAVAILABLE` | Bucket o políticas de Storage incorrectas |
| 500 | Error interno | Fallo inesperado de procesamiento |

El frontend conserva el mensaje del backend y no sustituye un error con datos
falsos.

## 13. Contrato de configuración

### Backend: `backend/.env`

```env
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_KEY=<supabase-anon-key>
JWT_SECRET=<secret-largo-y-aleatorio>
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=480
ALLOWED_ORIGINS=https://<frontend-domain>,http://localhost:5173
```

El backend lee `.env` y `backend/.env`. No se deben subir valores reales al
repositorio. `SUPABASE_KEY` debe ser la clave anónima para las operaciones
previstas por la API; las claves de servicio deben mantenerse únicamente en
el servidor y nunca exponerse a Vite.

### Frontend: `frontend/.env.local`

```env
VITE_API_URL=https://<backend-domain>/api
```

Vite expone al navegador todas las variables con prefijo `VITE_`. Por eso no se
debe colocar `SUPABASE_KEY`, `JWT_SECRET` ni ninguna clave privada en el
frontend.

Si falta `VITE_API_URL`, el cliente marca la API como no configurada y las
operaciones reales fallan explícitamente; no se genera reconocimiento de
demostración.

## 14. Integración frontend

`recognitionApi.ts` centraliza las llamadas HTTP. La configuración normaliza
URLs como:

```text
https://backend.example.com/api
https://backend.example.com/api/v1
https://backend.example.com
```

El resultado de reconocimiento se transforma al tipo `PersonRecord`. El
dashboard:

- carga usuarios con `GET /api/v1/users`;
- captura desde la cámara;
- ejecuta reconocimiento automáticamente;
- completa los campos personales;
- sustituye la captura por `imagen_url` de Supabase;
- muestra alerta amarilla si no hay coincidencia;
- calcula las métricas de perfiles a partir de los datos cargados.

La transición de login facial al dashboard espera cinco segundos para que el
usuario pueda revisar la identidad reconocida.

## 15. Dashboard y métricas

El dashboard contiene las secciones:

- **Resumen:** cantidad de perfiles, validaciones, tasa de reconocimiento y
  no reconocidos.
- **Reconocer:** cámara, coincidencia, calidad, modelo y estado.
- **Personas:** datos y fotografías provenientes de Supabase.
- **Historial:** eventos de validación almacenados en el navegador.

### Estado actual de persistencia

Los perfiles, fotografías y métricas de reconocimiento se consultan desde
Supabase. Los eventos se almacenan en `recognition_events`, por lo que el
historial no se pierde al cerrar la página ni depende del navegador usado.
La documentación cargada por el operador se conserva en IndexedDB con el
contenido binario del archivo, de modo que permanece disponible después de
cerrar y volver a abrir la página en el mismo navegador y perfil. Para
compartir documentación entre dispositivos debe migrarse ese flujo a un bucket
de Supabase Storage con políticas de acceso equivalentes.

## 16. Flujo completo de reconocimiento

```text
Usuario
  │
  ▼
React/Webcam captura data:image/...
  │
  ▼
POST /api/v1/face-recognition/recognize
  │
  ▼
FastAPI decodifica y valida calidad
  │
  ▼
OpenCV detecta el rostro más grande
  │
  ▼
ONNX/ArcFace genera vector normalizado de 512 dimensiones
  │
  ▼
Supabase RPC match_face_1n
  │
  ├── similarity < 0.75 → no reconocido
  │
  └── similarity >= 0.75
          │
          ▼
     SELECT usuarios por id
          │
          ▼
     Perfil e imagen de Supabase
          │
          ▼
     Dashboard autocompletado
```

## 17. Modelo facial y despliegue

El backend utiliza `w600k_mbf.onnx`, distribuido dentro de `buffalo_s.zip`.
Este modelo produce embeddings de 512 dimensiones y se ejecuta con
`CPUExecutionProvider`.

El `Dockerfile` descarga el modelo cuando no está disponible en la imagen.
Durante el despliegue se limita el uso de ONNX Runtime a un hilo intraoperativo
y uno interoperativo para reducir el consumo de memoria en Render.

Variables de salud que deben comprobarse:

```text
supabase_configured = true
face_model_loaded = true
```

## 18. Desarrollo local

### Backend

```bash
cd /workspaces/FACIAL_LOGIN
/workspaces/FACIAL_LOGIN/.venv/bin/python -m uvicorn backend.app.main:app \
  --reload --host 0.0.0.0 --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Abrir `http://localhost:5173`. El backend debe permitir ese origen en
`ALLOWED_ORIGINS`.

### Verificaciones

```bash
/workspaces/FACIAL_LOGIN/.venv/bin/python -m compileall -q backend/app
cd frontend && npm run build
git diff --check
```

## 19. Producción con Render y frontend estático

### Backend

1. Configurar el servicio web de Render con el repositorio.
2. Instalar `requirements.txt`.
3. Definir `SUPABASE_URL`, `SUPABASE_KEY`, `JWT_SECRET` y `ALLOWED_ORIGINS`.
4. Confirmar que el modelo ONNX se descarga durante el build.
5. Verificar `GET /health`.

### Frontend

1. Configurar `VITE_API_URL` en el proveedor del frontend.
2. Usar el valor del backend terminado en `/api`.
3. Reconstruir el frontend después de cambiar variables `VITE_*`.
4. Añadir el dominio frontend a `ALLOWED_ORIGINS`.

### Prueba posterior al despliegue

```bash
curl https://<backend-domain>/health
```

Debe indicar que Supabase y el modelo están disponibles. A continuación se
debe probar registro, login facial, login por credenciales y reconocimiento
desde el dashboard con un usuario real.

## 20. Seguridad y operación

- No almacenar contraseñas en `usuarios`.
- No exponer claves privadas en archivos `VITE_*`.
- Rotar `JWT_SECRET` si se filtra.
- Restringir CORS a dominios conocidos en producción.
- Aplicar políticas RLS en `usuarios`.
- Mantener privado el acceso de escritura a Storage.
- Validar el tamaño máximo de las imágenes antes de procesarlas.
- Registrar errores sin guardar imágenes Base64 ni tokens en logs.
- No devolver embeddings al frontend.
- Usar HTTPS en frontend, backend y Supabase.
- Revisar periódicamente las políticas del bucket `avatars`.

## 21. Fases de desarrollo y mantenimiento

### Fase 1 — Base biométrica implementada

- React, TypeScript, Vite y FastAPI.
- Configuración por variables de entorno.
- Modelo ONNX de 512 dimensiones.
- Supabase Auth, PostgreSQL, pgvector y Storage.

### Fase 2 — Registro y autenticación implementados

- Registro con cámara.
- Vista previa y repetición de captura.
- Detección de duplicados.
- Login por credenciales.
- Login facial con umbral del 75%.

### Fase 3 — Dashboard implementado

- Reconocimiento desde cámara.
- Autocompletado del perfil.
- Fotografía almacenada en Supabase.
- Métricas de perfiles.
- Contexto visual por pestaña.

### Fase 4 — Observabilidad recomendada

- Tabla `recognition_events`.
- Historial centralizado en Supabase.
- Métricas multiusuario.
- Alertas de disponibilidad de RPC, Storage y modelo.

### Fase 5 — Endurecimiento recomendado

- Anti-spoofing avanzado.
- Rate limiting.
- RLS revisado con pruebas negativas.
- Auditoría de accesos.
- Retención y eliminación segura de datos biométricos.
- Pruebas automatizadas de integración.

## 22. Matriz de comprobación operativa

| Comprobación | Resultado esperado |
|---|---|
| `GET /health` | `status=healthy` |
| Salud de Supabase | `supabase_configured=true` |
| Modelo facial | `face_model_loaded=true` |
| Registro sin cámara | `422 CAMERA_IMAGE_REQUIRED` |
| Registro duplicado | `409 USER_ALREADY_REGISTERED` |
| Rostro desconocido | `401` en login facial |
| Similitud menor a 75% | Acceso rechazado |
| Usuario reconocido | Perfil completo y fotografía de Supabase |
| Bucket inexistente | `503 AVATAR_STORAGE_UNAVAILABLE` |
| `VITE_API_URL` ausente | Error explícito, sin datos simulados |

## 23. Limitaciones conocidas

- El historial del dashboard aún no es centralizado en Supabase.
- El detector Haar puede no detectar todos los rostros en condiciones difíciles.
- La validación de liveness actual es básica y no equivale a una certificación
  anti-spoofing.
- La coincidencia depende de que la función `match_face_1n` esté creada
  correctamente en el proyecto Supabase.
- Los cambios locales deben desplegarse para que estén activos en Render y en
  el proveedor del frontend.
