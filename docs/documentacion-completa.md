# Documentación técnica completa

## 1. Resumen

FACIAL_LOGIN es una aplicación web de autenticación y reconocimiento facial.
El frontend captura imágenes desde la cámara y el backend toma las decisiones
de validación, reconocimiento, autorización y persistencia.

La aplicación no usa Django. La API está implementada con FastAPI y se apoya
en Supabase para PostgreSQL, pgvector, Storage y autenticación tradicional.

```text
React + TypeScript + Vite
        │ HTTPS/JSON + data URLs
        ▼
FastAPI + Python
  ├─ validación de payload e imágenes
  ├─ OpenCV: calidad, detección y liveness heurístico
  ├─ ONNX Runtime: embedding facial de 512 dimensiones
  ├─ JWT de aplicación y autorización
  └─ repositorio de Supabase
        │
        ├─ Supabase Auth: correo y contraseña
        ├─ PostgreSQL + pgvector: perfiles y embeddings
        ├─ RPC match_face_1n: búsqueda facial 1:N
        ├─ Storage/avatars: fotografías
        └─ recognition_events: auditoría y métricas
```

## 2. Estado funcional actual

- Registro facial con exactamente tres capturas consecutivas.
- Validación individual de cada captura con `image_index` en errores.
- Validación de resolución, tamaño, formato, brillo y desenfoque.
- Liveness heurístico mediante movimiento y textura.
- Extracción de tres embeddings ArcFace y promedio normalizado.
- Detección de rostro no encontrado o múltiples rostros.
- Comparación facial previa al registro con umbral `0.75`.
- Si el rostro ya existe, el alta se rechaza con `409 USER_ALREADY_REGISTERED`
  y el frontend cambia al modo de inicio de sesión.
- Si no existe, se comprueba email/DNI y se guarda el perfil completo.
- El registro facial no solicita ni almacena contraseñas.
- Login tradicional independiente por correo y contraseña mediante Supabase Auth.
- Login facial con tres capturas y JWT de aplicación.
- Eventos exitosos y fallidos en `recognition_events`.
- Dashboard vinculado a estadísticas y eventos reales de Supabase.
- Operaciones de modificación y borrado protegidas por JWT y verificación facial.

## 3. Estructura del proyecto

```text
FACIAL_LOGIN/
├── backend/
│   ├── app/
│   │   ├── main.py                 # aplicación FastAPI y health check
│   │   ├── config.py               # variables de entorno
│   │   ├── api/v1/
│   │   │   ├── router.py           # composición de routers
│   │   │   ├── auth.py             # credenciales, login facial e historial
│   │   │   └── users.py            # registro y gestión de perfiles
│   │   ├── core/
│   │   │   ├── security.py         # Bearer, JWT y permisos
│   │   │   ├── liveness.py         # calidad y secuencia de imágenes
│   │   │   └── face_embedder.py    # Haar + ArcFace ONNX
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
│   │   ├── components/FacialModal.tsx
│   │   ├── components/AntiBotCaptcha.tsx
│   │   ├── pages/Login.tsx
│   │   ├── pages/Dashboard.tsx
│   │   ├── services/recognitionApi.ts
│   │   └── config/env.ts
│   └── package.json
├── supabase/recognition_events.sql
├── docs/documentacion-completa.md
├── requirements.txt
├── Dockerfile
└── render.yaml
```

## 4. Librerías y servicios

### Backend

| Dependencia | Uso |
|---|---|
| FastAPI | Endpoints REST, dependencias y respuestas HTTP |
| Uvicorn | Servidor ASGI |
| Pydantic/Pydantic Settings | Contratos, límites y configuración |
| OpenCV | Decodificación, Haar Cascade, brillo, blur, Canny y movimiento |
| NumPy | Matrices, norma L2 y promedio de embeddings |
| ONNX Runtime | Ejecución CPU del modelo facial |
| Supabase Python | Auth, tablas, RPC y Storage |
| python-jose | Firma y lectura de JWT de aplicación |

### Frontend

| Dependencia/API | Uso |
|---|---|
| React + React DOM | Componentes y estado |
| TypeScript | Tipado estático |
| Vite | Desarrollo y build |
| lucide-react | Iconografía |
| `getUserMedia` | Acceso a cámara |
| `HTMLVideoElement` | Vista de cámara |
| `HTMLCanvasElement` | Captura JPEG |
| `fetch` | Comunicación con FastAPI |
| localStorage | Sesión y datos locales auxiliares |
| IndexedDB | Documentos locales del dashboard |

### Supabase

- **Auth:** login tradicional por correo y contraseña. El registro facial no
  crea una cuenta Auth ni guarda contraseñas.
- **PostgreSQL:** tabla `usuarios`.
- **pgvector:** columna `face_embedding vector(512)`.
- **RPC:** `match_face_1n`.
- **Storage:** bucket `avatars`.
- **Auditoría:** tabla `recognition_events`.

## 5. Modelo de datos

El script oficial es [supabase/recognition_events.sql](../supabase/recognition_events.sql).
Debe ejecutarse en Supabase SQL Editor.

### `usuarios`

Campos usados por el backend:

```text
id uuid
nombre text
apellido text
edad integer
telefono text
email text nullable
dni text nullable
imagen_url text
imagenes_urls jsonb
face_embedding vector(512)
face_embeddings jsonb
face_registration_metadata jsonb
created_at timestamptz
```

`face_embedding` es el promedio normalizado de las tres capturas.
`face_embeddings` conserva los tres vectores individuales. Los metadatos
incluyen muestras, consistencia, liveness y dimensión, pero nunca contraseña.

### `recognition_events`

```text
id uuid
user_id uuid nullable
event_type varchar(40)
similarity numeric(6,5) nullable
recognized boolean
success boolean
source varchar(60)
message text nullable
error_code varchar(80) nullable
metadata jsonb nullable
created_at timestamptz
```

Eventos habituales:

```text
face_registration
face_login
credential_login
face_recognition
```

Los errores se guardan con códigos como `FACE_NOT_RECOGNIZED`,
`FACE_NOT_DETECTED`, `LIVENESS_MOTION_REQUIRED`, `POSSIBLE_REPLAY`,
`FACE_SAMPLES_INCONSISTENT` y `USER_ALREADY_REGISTERED`.

## 6. RPC de comparación facial

La migración crea la función:

```sql
public.match_face_1n(
    query_embedding vector(512),
    match_threshold double precision default 0.75
)
```

La función calcula:

```sql
1 - (u.face_embedding <=> query_embedding)
```

Devuelve el usuario con mayor similitud que supera el umbral. El backend
vuelve a consultar el perfil por ID para obtener todos los datos personales.
Si la RPC no existe, está desactualizada o la columna no tiene dimensión 512,
el registro/login no debe considerarse operativo.

## 7. Flujo de registro facial

```text
Usuario selecciona Registrarse
        │
        ▼
Captura 1, 2 y 3 desde la cámara
        │
        ▼
POST /api/v1/users/register
        │
        ├─ payload: nombre, apellido, edad, teléfono, email, DNI y 3 imágenes
        ├─ valida data:image/* y límites Pydantic
        ├─ valida cada imagen y reporta image_index
        ├─ calcula liveness de la secuencia
        ├─ extrae 3 embeddings de 512 dimensiones
        ├─ calcula promedio normalizado
        ├─ busca duplicado facial en match_face_1n
        │    └─ coincidencia >= 0.75 → 409 y modo login
        ├─ comprueba email/DNI
        ├─ sube 3 imágenes a Storage
        └─ inserta usuarios + parámetros de registro
```

El orden de la comparación facial es intencional: evita subir imágenes y crear
un usuario cuando el rostro ya está registrado. La respuesta exitosa incluye
`validation_score` y `sample_count`.

El formulario de registro facial no tiene campo contraseña. La autenticación
por correo/contraseña es un flujo separado de Supabase Auth.

## 8. Flujo de login facial

```text
Tres capturas consecutivas
        ▼
Validación de calidad y liveness
        ▼
Tres embeddings → promedio normalizado
        ▼
match_face_1n(embedding, 0.75)
        ├─ sin coincidencia → 401 FACE_NOT_RECOGNIZED
        └─ coincidencia → evento + JWT de aplicación
```

El frontend guarda el token en `veris_access_token`, carga el nombre y abre el
dashboard después de mostrar brevemente la identidad reconocida.

## 9. Login tradicional

Endpoint:

```http
POST /api/v1/auth/login
Content-Type: application/json
```

Payload:

```json
{
  "email": "persona@example.com",
  "password": "********"
}
```

FastAPI normaliza el email y ejecuta `sign_in_with_password` en Supabase Auth.
La respuesta contiene token, ID, nombre y rol. No se comparan imágenes en este
flujo y no se consulta una contraseña en `usuarios`.

## 10. Validación de imágenes y liveness

`LightweightLiveness` aplica:

- Base64 válido y prefijo `data:image/`.
- Máximo aproximado de 5 MiB decodificados.
- Dimensión mínima `160 x 160`.
- Dimensión máxima `4096 x 4096`.
- Máximo `16_000_000` píxeles.
- Varianza del Laplaciano mínima `60.0`.
- Brillo medio entre `40` y `220`.
- Tres capturas obligatorias.
- Movimiento mínimo `0.015`.
- Textura mínima `0.02` cuando el movimiento también es bajo.

El movimiento y la textura son heurísticas de defensa en profundidad, no un
modelo anti-spoofing certificado. Para alta seguridad debe añadirse un modelo
anti-replay/anti-spoofing entrenado y calibrado.

## 11. Embeddings y detección

`FaceEmbedder`:

1. Detecta el rostro con Haar frontal y un clasificador alternativo.
2. Rechaza ningún rostro (`FACE_NOT_DETECTED`) y múltiples rostros claramente
   separados (`MULTIPLE_FACES_DETECTED`).
3. Recorta el rostro con margen.
4. Redimensiona a `112 x 112`.
5. Normaliza el tensor para ArcFace.
6. Ejecuta `w600k_mbf.onnx` con `CPUExecutionProvider`.
7. Valida 512 dimensiones, finitud y norma distinta de cero.
8. Normaliza cada vector y promedia las tres capturas.

El modelo se descarga desde `buffalo_s.zip` durante la preparación si falta el
archivo local. El despliegue limita ONNX Runtime a un hilo intra/inter para
reducir consumo de memoria.

## 12. API principal

Base: `/api/v1`.

| Método | Ruta | Protección | Uso |
|---|---|---|---|
| GET | `/health` | pública | estado de servicio, Supabase y modelo |
| POST | `/auth/login` | pública | email + contraseña en Supabase Auth |
| POST | `/auth/login-face` | pública | login facial con 3 imágenes |
| GET | `/auth/history` | Bearer | historial de eventos |
| GET | `/auth/events` | Bearer | alias del historial |
| GET | `/users` | Bearer | listar perfiles |
| POST | `/users/register` | pública | alta facial con datos del formulario |
| PATCH | `/users/{id}` | Bearer + verificación | editar perfil |
| DELETE | `/users/{id}` | Bearer + verificación | eliminar perfil |
| POST | `/users/{id}/verify-face` | Bearer | token de operación facial |
| POST | `/face-recognition/recognize` | Bearer | reconocimiento para dashboard |
| GET | `/dashboard/stats` | Bearer | métricas agregadas |

## 13. Seguridad y permisos

- Los endpoints sensibles exigen `Authorization: Bearer <token>`.
- Se diferencian token ausente, inválido y expirado.
- Las ediciones y eliminaciones se limitan al usuario autenticado o rol
  administrativo, además de requerir verificación facial de propósito único.
- Los tokens tienen expiración configurada por `ACCESS_TOKEN_EXPIRE_MINUTES`.
- No se devuelven embeddings al navegador.
- No se registran contraseñas, imágenes Base64 ni tokens en auditoría.
- La clave privada de Supabase solo debe estar en el backend.
- En producción se recomienda `service_role` exclusivamente en Render, nunca
  en variables `VITE_*`.

La tabla de auditoría tiene RLS. El archivo SQL incluye las políticas que
permiten al cliente configurado por el backend insertar y leer eventos; deben
revisarse si se cambia a acceso directo desde el navegador.

## 14. Configuración

### Backend

```env
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_KEY=<clave-del-servidor>
JWT_SECRET=<secreto-aleatorio-de-al-menos-32-caracteres>
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=480
ALLOWED_ORIGINS=https://<frontend-domain>,http://localhost:5173
```

### Frontend

```env
VITE_API_URL=https://<backend-domain>/api
```

No colocar `SUPABASE_KEY`, `JWT_SECRET` ni claves de servicio en el frontend.
Si falta `VITE_API_URL`, el cliente falla explícitamente y no genera datos
ficticios de reconocimiento.

## 15. Storage

Crear un bucket llamado `avatars`. El backend conserva las imágenes capturadas
con nombres UUID y guarda sus URLs en `imagen_url` e `imagenes_urls`.

Si Storage no está configurado, el endpoint devuelve
`503 AVATAR_STORAGE_UNAVAILABLE`; no se guarda una imagen de sustitución.

## 16. Dashboard

`Dashboard.tsx` consume `getDashboardStats`, `listUsers` y
`listAuditEvents`. Las tarjetas y gráficos se vinculan a:

- perfiles registrados desde `usuarios`;
- validaciones del dashboard desde `recognition_events` con `source = 'dashboard'`;
- porcentaje de reconocimiento;
- actividad por día;
- eventos recientes;
- fotografía remota de Storage.
- métricas operativas de intentos, éxitos, rechazos y porcentaje de utilidad;
- log reciente sincronizado automáticamente con los eventos del dashboard.

### Puntos de cámara dentro del dashboard

El dashboard tiene dos puntos de captura independientes:

1. **Reconocer rostro:** `openCamera` solicita `getUserMedia` y asigna el
   `MediaStream` al video de reconocimiento. El usuario no sube archivos ni
   pulsa un botón de captura: al activar la cámara, el cliente obtiene frames
   temporales del video cada 3.5 segundos y los envía a
   `POST /api/v1/face-recognition/recognize`. FastAPI valida calidad, detecta
   el rostro, consulta `match_face_1n` y registra un evento con
   `source = 'dashboard'`. Cuando la similitud supera el umbral configurado,
   el ciclo de análisis se detiene y conserva el resultado; el video permanece
   visible y activo. Para iniciar un nuevo análisis se debe apagar y volver a
   activar la cámara. El frame técnico no se presenta como una foto de entrada
   ni se usa como sustituto del perfil almacenado.
2. **Editar o eliminar una persona:** `startVerifyCamera` abre una cámara
   exclusiva para la verificación del perfil seleccionado. `verifySelectedUser`
   captura el frame y llama a `POST /api/v1/users/{id}/verify-face`. Solo si
   Supabase confirma la coincidencia se entrega el token temporal requerido
   para modificar o borrar el perfil. Estas verificaciones se conservan en la
   auditoría, pero no se mezclan con las métricas de reconocimientos del
   dashboard.

La verificación de un perfil reutiliza la RPC desplegada `match_face_1n` con
umbral `0.75` y comprueba que el ID del mejor resultado sea exactamente el del
perfil seleccionado. No depende de una RPC separada
`match_face_for_user`, que no forma parte de la migración oficial.

Al cerrar cualquiera de las cámaras se detienen todas sus pistas y se limpia
`video.srcObject`; esto evita streams duplicados y permite reabrir la cámara
sin perder sincronización. Después de un reconocimiento, edición o borrado,
el frontend vuelve a consultar usuarios, estadísticas y auditoría desde
FastAPI/Supabase para que tarjetas, historial y gráficos representen el mismo
estado persistido. No se usa el historial local como fuente de métricas.

La pestaña **Integraciones** actualiza el estado cada 15 segundos y permite una
actualización manual. Muestra el total de intentos del dashboard, registros
exitosos, registros rechazados, porcentaje de utilidad
(`reconocidos / intentos * 100`) y los diez eventos más recientes persistidos.

Los documentos cargados por el operador siguen siendo locales de IndexedDB.
No deben confundirse con los perfiles biométricos ni con la auditoría de
Supabase.

## 17. Errores principales

| HTTP | Código | Significado |
|---:|---|---|
| 400 | `INVALID_IMAGE_ENCODING` | Base64 inválido |
| 401 | `INVALID_CREDENTIALS` | Credenciales tradicionales incorrectas |
| 401 | `FACE_NOT_RECOGNIZED` | Similitud menor al 75% |
| 401 | `TOKEN_INVALID` / `TOKEN_EXPIRED` | JWT ausente, inválido o expirado |
| 409 | `USER_ALREADY_REGISTERED` | Rostro, email o DNI duplicado |
| 413 | `IMAGE_TOO_LARGE` | Imagen o resolución excesiva |
| 422 | `FACE_NOT_DETECTED` | No se encontró rostro |
| 422 | `MULTIPLE_FACES_DETECTED` | Hay más de un rostro |
| 422 | `LIVENESS_MOTION_REQUIRED` | Movimiento insuficiente |
| 422 | `POSSIBLE_REPLAY` | Textura y movimiento compatibles con replay |
| 422 | `FACE_SAMPLES_INCONSISTENT` | Las tres capturas no son consistentes |
| 503 | `SUPABASE_NOT_CONFIGURED` | Faltan variables de Supabase |
| 503 | `AVATAR_STORAGE_UNAVAILABLE` | Bucket o política de Storage incorrectos |

## 18. Desarrollo y validación

### Backend

```bash
python -m uvicorn backend.app.main:app --reload --host 0.0.0.0 --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

### Validaciones del repositorio

```bash
python -m compileall -q backend
cd frontend && npm run build
git diff --check
```

### Pruebas manuales mínimas

1. Registro nuevo con tres capturas válidas.
2. Repetición del mismo rostro: debe devolver `409` y cambiar a login.
3. Registro con email o DNI duplicado.
4. Captura 1, 2 o 3 inválida: revisar `image_index`.
5. Login facial correcto.
6. Login de una persona no registrada.
7. Login tradicional correcto e incorrecto.
8. Revisión de `recognition_events`.
9. Reconocimiento desde Dashboard con token válido y expirado.

## 19. Pendientes recomendados

- Sustituir el liveness heurístico por anti-spoofing entrenado.
- Añadir rate limiting por IP, usuario y endpoint facial.
- Crear pruebas automatizadas de RPC, Storage, RLS y permisos negativos.
- Añadir refresh token si la sesión debe durar más que el JWT actual.
- Calibrar el umbral `0.75` con falsos positivos y falsos negativos reales.
- Definir retención y eliminación segura de embeddings e imágenes.
- Revisar periódicamente las políticas RLS de `usuarios`, Storage y auditoría.
