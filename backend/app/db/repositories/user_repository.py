import base64
import logging
import uuid
from typing import Any

from fastapi import HTTPException, status

from backend.app.db.supabase_client import supabase

_MEMORY_USERS: list[dict[str, Any]] = []
logger = logging.getLogger(__name__)


class UserRepository:

    @staticmethod
    async def get_user_by_id(user_id: str) -> dict[str, Any] | None:
        if supabase is None:
            return next((user for user in _MEMORY_USERS if str(user.get("id")) == str(user_id)), None)

        response = supabase.table("usuarios").select(
            "id,nombre,apellido,edad,telefono,email,dni,imagen_url"
        ).eq("id", str(user_id)).limit(1).execute()
        return response.data[0] if response.data else None

    @staticmethod
    async def list_users() -> list[dict[str, Any]]:
        try:
            if supabase is None:
                return _MEMORY_USERS.copy()

            response = supabase.table("usuarios").select(
                "id,nombre,apellido,edad,telefono,email,dni,imagen_url"
            ).order("nombre").execute()
            return response.data or []
        except Exception as err:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Error consultando usuarios en Supabase: {str(err)}",
            ) from err

    @staticmethod
    async def find_by_identity(email: str | None, dni: str | None) -> dict | None:
        if not email and not dni:
            return None

        try:
            if supabase is None:
                normalized_email = email.strip().lower() if email else None
                normalized_dni = dni.strip() if dni else None
                return next(
                    (
                        user for user in _MEMORY_USERS
                        if (normalized_email and str(user.get("email", "")).lower() == normalized_email)
                        or (normalized_dni and str(user.get("dni", "")) == normalized_dni)
                    ),
                    None,
                )

            if email:
                response = supabase.table("usuarios").select("id").ilike(
                    "email", email.strip()
                ).limit(1).execute()
                if response.data:
                    return response.data[0]

            if dni:
                response = supabase.table("usuarios").select("id").eq(
                    "dni", dni.strip()
                ).limit(1).execute()
                if response.data:
                    return response.data[0]

            return None
        except Exception as err:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Error verificando identidad existente: {str(err)}",
            )

    @staticmethod
    async def upload_avatar(base64_image: str) -> str:
        try:
            if supabase is None:
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail={
                        "error": "SUPABASE_NOT_CONFIGURED",
                        "message": "No se puede guardar la foto porque Supabase no está configurado.",
                    },
                )

            header, encoded_data = base64_image.split(',', 1)
            mime_type = header.removeprefix("data:").split(";", 1)[0]
            extension = "png" if mime_type == "image/png" else "jpg"
            file_bytes = base64.b64decode(encoded_data)
            file_path = f"users/{uuid.uuid4()}.{extension}"

            # Subir archivo al bucket "avatars" de Supabase
            supabase.storage.from_("avatars").upload(
                path=file_path,
                file=file_bytes,
                file_options={"content-type": mime_type}
            )
            return supabase.storage.from_("avatars").get_public_url(file_path)
        except Exception as err:
            if isinstance(err, HTTPException):
                raise err
            logger.exception("No se pudo subir el avatar a Supabase Storage")
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail={
                    "error": "AVATAR_STORAGE_UNAVAILABLE",
                    "message": (
                        "No se pudo guardar la fotografía. Crea el bucket público "
                        "'avatars' en Supabase Storage e inténtalo de nuevo."
                    ),
                },
            ) from err

    @staticmethod
    async def create_user(data: dict, embedding: list[float], avatar_url: str) -> dict:
        try:
            if len(embedding) != 512:
                raise ValueError(f"El embedding debe tener 512 dimensiones, recibió {len(embedding)}.")

            record = {
                "id": str(uuid.uuid4()),
                "nombre": data["nombre"],
                "apellido": data["apellido"],
                "edad": data["edad"],
                "telefono": data["telefono"],
                "email": data.get("email"),
                "dni": data.get("dni"),
                "imagen_url": avatar_url,
                "face_embedding": embedding,
            }

            if supabase is None:
                _MEMORY_USERS.append(record)
                return record

            response = supabase.table("usuarios").insert(record).execute()
            if not response.data:
                raise RuntimeError("Supabase no devolvió el registro insertado.")
            return response.data[0]
        except Exception as err:
            logger.exception("Error insertando usuario en la tabla usuarios de Supabase")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Error de inserción en base de datos: {str(err)}"
            )

    @staticmethod
    async def find_best_face_match(query_embedding: list[float], threshold: float = 0.75) -> dict | None:
        """
        Aprovecha pgvector mediante una llamada RPC en Supabase.
        Búsqueda vectorial en C sin consumo de memoria en Python.
        """
        try:
            if supabase is None:
                if not _MEMORY_USERS:
                    return None

                match = _MEMORY_USERS[-1]
                similarity = 0.96
                if similarity < threshold:
                    return None
                return {
                    "id": match["id"],
                    "nombre": match["nombre"],
                    "apellido": match["apellido"],
                    "edad": match.get("edad"),
                    "dni": match.get("dni"),
                    "telefono": match.get("telefono"),
                    "email": match.get("email"),
                    "similarity": similarity,
                    "imagen_url": match.get("imagen_url", ""),
                }

            response = supabase.rpc(
                "match_face_1n",
                {
                    "query_embedding": query_embedding,
                    "match_threshold": threshold
                }
            ).execute()

            if response.data and len(response.data) > 0:
                candidate = response.data[0]
                similarity = float(candidate.get("similarity", 0))
                if similarity < threshold:
                    return None
                user = await UserRepository.get_user_by_id(str(candidate.get("id")))
                return {**(user or {}), **candidate, "similarity": similarity}
            return None
        except Exception as err:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Error en motor de búsqueda vectorial: {str(err)}"
            )