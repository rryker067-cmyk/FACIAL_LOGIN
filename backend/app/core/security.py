from datetime import datetime, timedelta, timezone
from jose import jwt
from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from fastapi.concurrency import run_in_threadpool
from backend.app.config import settings
from typing import Any
from backend.app.db.supabase_client import supabase

bearer_scheme = HTTPBearer(auto_error=True)

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
    from fastapi import HTTPException, status

    try:
        return jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
    except Exception as err:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": "INVALID_ACCESS_TOKEN", "message": "El token de acceso no es válido."},
            headers={"WWW-Authenticate": "Bearer"},
        ) from err


async def get_authenticated_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
) -> dict[str, Any]:
    """Resolve either an API JWT (facial login) or a Supabase Auth JWT."""
    token = credentials.credentials
    try:
        claims = decode_access_token(token)
        if claims.get("sub"):
            return {
                "user_id": str(claims["sub"]),
                "nombre": str(claims.get("name") or "Usuario"),
                "role": str(claims.get("role") or "Usuario"),
            }
    except Exception:
        pass

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
            pass

    from fastapi import HTTPException, status

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail={"error": "INVALID_ACCESS_TOKEN", "message": "El token de acceso no es válido."},
        headers={"WWW-Authenticate": "Bearer"},
    )