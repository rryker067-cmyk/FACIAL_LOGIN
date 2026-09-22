import base64
import logging
import uuid
from typing import Any

from fastapi import HTTPException, status

from backend.app.db.supabase_client import supabase

logger = logging.getLogger(__name__)


def _is_missing_recognition_events(error: Exception) -> bool:
    """Recognize the Supabase/PostgREST error returned before the audit table exists."""
    message = str(error)
    return "PGRST205" in message or "recognition_events" in message and "schema cache" in message


class UserRepository:

    @staticmethod
    async def get_user_by_id(user_id: str) -> dict[str, Any] | None:
        if supabase is None:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail={"error": "SUPABASE_NOT_CONFIGURED", "message": "Supabase no está configurado."},
            )

        response = supabase.table("usuarios").select(
            "id,nombre,apellido,edad,telefono,email,dni,imagen_url,imagenes_urls,face_registration_metadata"
        ).eq("id", str(user_id)).limit(1).execute()
        return response.data[0] if response.data else None

    @staticmethod
    async def list_users() -> list[dict[str, Any]]:
        try:
            if supabase is None:
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail={"error": "SUPABASE_NOT_CONFIGURED", "message": "Supabase no está configurado."},
                )

            response = supabase.table("usuarios").select(
                "id,nombre,apellido,edad,telefono,email,dni,imagen_url,imagenes_urls,created_at"
            ).order("nombre").execute()
            return response.data or []
        except Exception as err:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Error consultando usuarios en Supabase: {str(err)}",
            ) from err

    @staticmethod
    async def record_recognition_event(
        user_id: str | None,
        similarity: float,
        recognized: bool,
        source: str = "dashboard",
    ) -> None:
        """Persists an auditable facial recognition attempt without breaking recognition."""
        if supabase is None:
            logger.warning("No se registró el evento facial: Supabase no está configurado.")
            return

        try:
            supabase.table("recognition_events").insert({
                "user_id": user_id,
                "similarity": round(max(0, min(1, similarity)), 5),
                "recognized": recognized,
                "event_type": "face_recognition",
                "success": recognized,
                "source": source,
                "message": None if recognized else "Rostro no reconocido.",
                "error_code": None if recognized else "FACE_NOT_RECOGNIZED",
            }).execute()
        except Exception as err:
            if _is_missing_recognition_events(err):
                logger.warning("Auditoría no disponible: falta public.recognition_events en Supabase.")
            else:
                logger.exception("No se pudo persistir el evento de reconocimiento facial")

    @staticmethod
    async def record_auth_event(
        *,
        event_type: str,
        user_id: str | None,
        success: bool,
        source: str,
        similarity: float | None = None,
        message: str | None = None,
        error_code: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> None:
        """Stores every authentication attempt, including failures."""
        if supabase is None:
            logger.warning("No se registró el evento de auditoría: Supabase no está configurado.")
            return
        try:
            payload = {
                "event_type": event_type,
                "user_id": user_id,
                "similarity": (
                    round(max(0, min(1, similarity)), 5)
                    if similarity is not None else None
                ),
                "recognized": success,
                "success": success,
                "source": source,
                "message": message,
                "error_code": error_code,
                "metadata": metadata,
            }
            supabase.table("recognition_events").insert(payload).execute()
        except Exception as err:
            if _is_missing_recognition_events(err):
                logger.warning("Auditoría no disponible: falta public.recognition_events en Supabase.")
            else:
                logger.exception(
                    "No se pudo persistir el evento de auditoría. "
                    "Compruebe que ejecutó supabase/recognition_events.sql y que RLS permite insertar."
                )

    @staticmethod
    async def list_auth_events(limit: int = 100, user_id: str | None = None) -> list[dict[str, Any]]:
        if supabase is None:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail={"error": "SUPABASE_NOT_CONFIGURED", "message": "Supabase no está configurado."},
            )
        query = supabase.table("recognition_events").select(
            "id,event_type,user_id,similarity,recognized,success,source,message,error_code,metadata,created_at"
        ).order("created_at", desc=True).limit(min(max(limit, 1), 500))
        if user_id:
            query = query.eq("user_id", str(user_id))
        try:
            response = query.execute()
            return response.data or []
        except Exception as err:
            if _is_missing_recognition_events(err):
                logger.warning("Historial vacío: falta public.recognition_events en Supabase.")
                return []
            raise

    @staticmethod
    async def find_face_match_for_user(user_id: str, query_embedding: list[float]) -> dict | None:
        """Compare against only the requested profile, never another user."""
        if supabase is None:
            raise HTTPException(status_code=503, detail={"error": "SUPABASE_NOT_CONFIGURED"})
        try:
            response = supabase.rpc(
                "match_face_for_user",
                {
                    "query_embedding": query_embedding,
                    "match_threshold": 0.75,
                    "target_user_id": str(user_id),
                },
            ).execute()
            if not response.data:
                return None
            candidate = response.data[0]
            user = await UserRepository.get_user_by_id(user_id)
            return {**(user or {}), **candidate, "similarity": float(candidate.get("similarity", 0))}
        except Exception as err:
            raise HTTPException(
                status_code=500,
                detail={"error": "FACE_VERIFICATION_UNAVAILABLE", "message": str(err)},
            ) from err

    @staticmethod
    async def update_user(user_id: str, data: dict[str, Any]) -> dict[str, Any] | None:
        if supabase is None:
            raise HTTPException(status_code=503, detail={"error": "SUPABASE_NOT_CONFIGURED"})
        values = {key: value for key, value in data.items() if value is not None}
        if not values:
            return await UserRepository.get_user_by_id(user_id)
        response = supabase.table("usuarios").update(values).eq("id", str(user_id)).execute()
        return response.data[0] if response.data else None

    @staticmethod
    async def delete_user(user_id: str) -> bool:
        if supabase is None:
            raise HTTPException(status_code=503, detail={"error": "SUPABASE_NOT_CONFIGURED"})
        response = supabase.table("usuarios").delete().eq("id", str(user_id)).execute()
        return bool(response.data)

    @staticmethod
    async def get_dashboard_stats() -> dict[str, Any]:
        """Returns dashboard metrics sourced from Supabase users and recognition events."""
        users = await UserRepository.list_users()
        events: list[dict[str, Any]] = []

        if supabase is not None:
            try:
                response = supabase.table("recognition_events").select(
                    "id,user_id,similarity,recognized,source,created_at"
                ).eq("source", "dashboard").order("created_at", desc=True).limit(1000).execute()
                events = response.data or []
            except Exception as err:
                if _is_missing_recognition_events(err):
                    logger.warning("Métricas parciales: falta public.recognition_events en Supabase.")
                else:
                    logger.exception("No se pudieron consultar los eventos de reconocimiento")

        recognized_count = sum(1 for event in events if event.get("recognized"))
        failed_count = len(events) - recognized_count
        validation_count = len(events)
        activity_by_day: dict[str, int] = {}
        for user in users:
            created_at = user.get("created_at")
            if created_at:
                day = str(created_at)[:10]
                activity_by_day[day] = activity_by_day.get(day, 0) + 1
        for event in events:
            created_at = event.get("created_at")
            if created_at:
                day = str(created_at)[:10]
                activity_by_day[day] = activity_by_day.get(day, 0) + 1

        return {
            "registered_count": len(users),
            "validation_count": validation_count,
            "recognized_count": recognized_count,
            "unrecognized_count": failed_count,
            "recognition_rate": round((recognized_count / validation_count) * 100) if validation_count else 0,
            "activity_by_day": activity_by_day,
            "recent_events": events[:20],
            "recent_users": users[:20],
        }

    @staticmethod
    async def find_by_identity(email: str | None, dni: str | None) -> dict | None:
        if not email and not dni:
            return None

        try:
            if supabase is None:
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail={"error": "SUPABASE_NOT_CONFIGURED", "message": "Supabase no está configurado."},
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
    async def create_user(
        data: dict,
        embedding: list[float],
        avatar_url: str,
        image_urls: list[str],
        embeddings: list[list[float]],
        registration_metadata: dict[str, Any] | None = None,
    ) -> dict:
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
                "imagenes_urls": image_urls,
                "face_embedding": embedding,
                "face_embeddings": embeddings,
                "face_registration_metadata": registration_metadata or {},
            }

            if supabase is None:
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail={"error": "SUPABASE_NOT_CONFIGURED", "message": "Supabase no está configurado."},
                )

            response = supabase.table("usuarios").insert(record).execute()
            if not response.data:
                raise RuntimeError("Supabase no devolvió el registro insertado.")
            return response.data[0]
        except Exception as err:
            if isinstance(err, HTTPException):
                raise err
            logger.exception("Error insertando usuario en la tabla usuarios de Supabase")
            if "duplicate key" in str(err).lower() or "unique constraint" in str(err).lower():
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail={"error": "USER_ALREADY_REGISTERED", "message": "El correo o DNI ya está registrado."},
                ) from err
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail={"error": "USER_CREATION_FAILED", "message": "No se pudo crear el usuario."},
            ) from err

    @staticmethod
    async def find_best_face_match(query_embedding: list[float], threshold: float = 0.75) -> dict | None:
        """
        Aprovecha pgvector mediante una llamada RPC en Supabase.
        Búsqueda vectorial en C sin consumo de memoria en Python.
        """
        try:
            if supabase is None:
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail={
                        "error": "SUPABASE_NOT_CONFIGURED",
                        "message": "La identificación facial requiere una conexión activa con Supabase.",
                    },
                )

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
                candidate_id = candidate.get("id") or candidate.get("user_id")
                user = await UserRepository.get_user_by_id(str(candidate_id)) if candidate_id else None
                return {**(user or {}), **candidate, "similarity": similarity}
            return None
        except Exception as err:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Error en motor de búsqueda vectorial: {str(err)}"
            )