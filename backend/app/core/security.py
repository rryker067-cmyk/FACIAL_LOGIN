from datetime import datetime, timedelta, timezone
from jose import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from fastapi.concurrency import run_in_threadpool
from backend.app.config import settings
from typing import Any
from backend.app.db.supabase_client import supabase
from jose.exceptions import ExpiredSignatureError, JWTError

bearer_scheme = HTTPBearer(auto_error=False)

def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)
    return encoded_jwt


def create_face_verification_token(user_id: str) -> str:
    from datetime import datetime, timedelta, timezone

    return jwt.encode(
        {
            "sub": str(user_id),
            "purpose": "face_verification",
            "name": "face-confirmation",
            "exp": datetime.now(timezone.utc) + timedelta(minutes=5),
        },
        settings.JWT_SECRET,
        algorithm=settings.JWT_ALGORITHM,
    )


def decode_access_token(token: str) -> dict[str, Any]:
    """Decode tokens issued by this API and raise a uniform authentication error."""
    try:
        return jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
    except ExpiredSignatureError as err:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": "TOKEN_EXPIRED", "message": "El token de acceso ha expirado."},
            headers={"WWW-Authenticate": "Bearer error=\"invalid_token\", error_description=\"expired\""},
        ) from err
    except JWTError as err:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": "TOKEN_INVALID", "message": "El token de acceso no es válido."},
            headers={"WWW-Authenticate": "Bearer"},
        ) from err


async def get_authenticated_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> dict[str, Any]:
    """Resolve either an API JWT (facial login) or a Supabase Auth JWT."""
    if credentials is None or not credentials.credentials.strip():
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": "TOKEN_MISSING", "message": "Se requiere un token de autenticación."},
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = credentials.credentials
    try:
        claims = decode_access_token(token)
        if claims.get("sub"):
            return {
                "user_id": str(claims["sub"]),
                "nombre": str(claims.get("name") or "Usuario"),
                "role": str(claims.get("role") or "Usuario"),
            }
    except HTTPException as own_token_error:
        if own_token_error.detail.get("error") == "TOKEN_EXPIRED":
            raise

    if supabase is not None:
        try:
            user_response = await run_in_threadpool(supabase.auth.get_user, token)
            user = user_response.user
            if user:
                metadata = user.user_metadata or {}
                return {
                    "user_id": str(user.id),
                    "nombre": str(
                        metadata.get("name")
                        or metadata.get("full_name")
                        or user.email
                        or "Usuario"
                    ),
                    "role": str(metadata.get("role") or "Usuario"),
                }
        except Exception:
            # Supabase tokens use a different signing key and must be checked by Supabase.
            pass

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail={"error": "TOKEN_INVALID", "message": "El token de acceso no es válido."},
        headers={"WWW-Authenticate": "Bearer"},
    )