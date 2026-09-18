from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.concurrency import run_in_threadpool
from backend.app.schemas.auth import (
    CredentialsTokenResponse,
    AuthenticatedUserResponse,
    LoginCredentialsRequest,
    LoginFaceRequest,
    TokenResponse,
    AuditEventResponse,
)
from backend.app.core.liveness import LightweightLiveness
from backend.app.core.face_embedder import face_embedder
from backend.app.core.security import create_access_token
from backend.app.core.security import get_authenticated_user
from backend.app.db.repositories.user_repository import UserRepository
from backend.app.db.supabase_client import supabase

router = APIRouter(prefix="/auth", tags=["Autenticación Facial"])


@router.get("/history", response_model=list[AuditEventResponse])
async def authentication_history(
    authenticated_user: dict = Depends(get_authenticated_user),
):
    return await UserRepository.list_auth_events(user_id=authenticated_user["user_id"])


@router.get("/events", response_model=list[AuditEventResponse])
async def authentication_events(
    authenticated_user: dict = Depends(get_authenticated_user),
):
    return await UserRepository.list_auth_events(user_id=authenticated_user["user_id"])


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

    normalized_email = payload.email.strip().lower()
    try:
        session = await run_in_threadpool(
            supabase.auth.sign_in_with_password,
            {"email": normalized_email, "password": payload.password},
        )
    except Exception:
        await UserRepository.record_auth_event(
            event_type="credential_login", user_id=None, success=False,
            source="auth/login", error_code="INVALID_CREDENTIALS",
            message="Correo o contraseña inválidos.",
            metadata={"email": normalized_email},
        )
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
    await UserRepository.record_auth_event(
        event_type="credential_login", user_id=str(user.id), success=True,
        source="auth/login", message="Inicio de sesión correcto.",
        metadata={"email": normalized_email},
    )

    return CredentialsTokenResponse(
        access_token=session.access_token,
        user_id=str(user.id),
        nombre=nombre,
        role=str(metadata.get("role") or "Usuario"),
    )


@router.get("/me", response_model=AuthenticatedUserResponse)
async def authenticated_user(request: Request):
    """Returns the real display name associated with the current bearer token."""
    from backend.app.core.security import get_authenticated_user
    from fastapi.security import HTTPAuthorizationCredentials

    authorization = request.headers.get("authorization", "")
    if not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail={"error": "AUTHENTICATION_REQUIRED"})
    # Resolve through the same dependency without duplicating token rules.
    credentials = HTTPAuthorizationCredentials(
        scheme="Bearer", credentials=authorization[7:].strip()
    )
    user = await get_authenticated_user(credentials)
    return AuthenticatedUserResponse(**user)


@router.post("/login-face", response_model=TokenResponse)
async def login_face_1n(payload: LoginFaceRequest):
    try:
        cv2_img = await run_in_threadpool(
            LightweightLiveness.verify_quality_and_liveness, payload.imagen_base64
        )
        incoming_embedding = await run_in_threadpool(face_embedder.extract_embedding, cv2_img)
        match = await UserRepository.find_best_face_match(
            query_embedding=incoming_embedding, threshold=0.75
        )
    except HTTPException as err:
        await UserRepository.record_auth_event(
            event_type="face_login", user_id=None, success=False,
            source="auth/login-face", error_code=str(
                err.detail.get("error") if isinstance(err.detail, dict) else "FACE_PROCESSING_ERROR"
            ), message="No se pudo procesar o validar el rostro.",
        )
        raise
    except Exception as err:
        await UserRepository.record_auth_event(
            event_type="face_login", user_id=None, success=False,
            source="auth/login-face", error_code="FACE_PROCESSING_ERROR",
            message=str(err),
        )
        raise HTTPException(status_code=422, detail={"error": "FACE_PROCESSING_ERROR"})

    if not match:
        await UserRepository.record_auth_event(
            event_type="face_login", user_id=None, similarity=0, success=False,
            source="auth/login-face", error_code="FACE_NOT_RECOGNIZED",
            message="Rostro no reconocido.",
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "error": "FACE_NOT_RECOGNIZED",
                "message": "Acceso Denegado: se requiere una coincidencia facial mínima del 75%."
            }
        )

    similarity_pct = round(match["similarity"] * 100, 2)
    await UserRepository.record_auth_event(
        event_type="face_login", user_id=str(match["id"]),
        similarity=float(match["similarity"]), success=True,
        source="auth/login-face", message="Inicio de sesión correcto.",
    )
    
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