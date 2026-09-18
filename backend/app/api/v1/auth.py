from fastapi import APIRouter, HTTPException, status
from fastapi.concurrency import run_in_threadpool
from backend.app.schemas.auth import (
    CredentialsTokenResponse,
    LoginCredentialsRequest,
    LoginFaceRequest,
    TokenResponse,
)
from backend.app.core.liveness import LightweightLiveness
from backend.app.core.face_embedder import face_embedder
from backend.app.core.security import create_access_token
from backend.app.db.repositories.user_repository import UserRepository
from backend.app.db.supabase_client import supabase

router = APIRouter(prefix="/auth", tags=["Autenticación Facial"])


@router.post("/login", response_model=CredentialsTokenResponse)
async def login_credentials(payload: LoginCredentialsRequest):
    """Valida el correo y la contraseña contra Supabase Auth."""
    if supabase is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "error": "SUPABASE_NOT_CONFIGURED",
                "message": "Supabase no está configurado en el backend.",
            },
        )

    try:
        session = await run_in_threadpool(
            supabase.auth.sign_in_with_password,
            {"email": payload.email.strip().lower(), "password": payload.password},
        )
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "error": "INVALID_CREDENTIALS",
                "message": "Correo o contraseña inválidos.",
            },
        )

    user = session.user
    metadata = user.user_metadata or {}
    nombre = str(metadata.get("name") or metadata.get("full_name") or user.email or "Usuario")

    return CredentialsTokenResponse(
        access_token=session.access_token,
        user_id=str(user.id),
        nombre=nombre,
        role=str(metadata.get("role") or "Usuario"),
    )


@router.post("/login-face", response_model=TokenResponse)
async def login_face_1n(payload: LoginFaceRequest):
    # 1. Filtro rápido de calidad (CPU-bound) en hilo secundario
    cv2_img = await run_in_threadpool(
        LightweightLiveness.verify_quality_and_liveness, 
        payload.imagen_base64
    )

    # 2. Extracción de Embedding ONNX en hilo secundario (no bloquea el Event Loop)
    incoming_embedding = await run_in_threadpool(
        face_embedder.extract_embedding, 
        cv2_img
    )

    # 3. Búsqueda vectorial 1:N en Supabase / PostgreSQL pgvector (I/O Async)
    match = await UserRepository.find_best_face_match(
        query_embedding=incoming_embedding, 
        threshold=0.75
    )

    if not match:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "error": "FACE_NOT_RECOGNIZED",
                "message": "Acceso Denegado: se requiere una coincidencia facial mínima del 75%."
            }
        )

    similarity_pct = round(match["similarity"] * 100, 2)
    
    # 4. Generación de Session Token
    token = create_access_token({
        "sub": str(match["id"]), 
        "name": f"{match['nombre']} {match['apellido']}"
    })

    return TokenResponse(
        access_token=token,
        user_id=str(match["id"]),
        nombre=f"{match['nombre']} {match['apellido']}",
        match_percentage=f"{similarity_pct}%",
        email=match.get("email"),
        dni=match.get("dni"),
        edad=match.get("edad"),
        telefono=match.get("telefono"),
    )