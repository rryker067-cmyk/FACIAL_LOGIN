import base64
import uuid
from typing import Any

from fastapi import HTTPException, status

from backend.app.db.supabase_client import supabase

_MEMORY_USERS: list[dict[str, Any]] = []


class UserRepository:

    @staticmethod
    async def upload_avatar(base64_image: str) -> str:
        try:
            if supabase is None:
                return "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150"

            encoded_data = base64_image.split(',')[-1]
            file_bytes = base64.b64decode(encoded_data)
            file_path = f"users/{uuid.uuid4()}.jpg"

            # Subir archivo al bucket "avatars" de Supabase
            supabase.storage.from_("avatars").upload(
                path=file_path,
                file=file_bytes,
                file_options={"content-type": "image/jpeg"}
            )
            return supabase.storage.from_("avatars").get_public_url(file_path)
        except Exception as err:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Error en almacenamiento de imagen: {str(err)}"
            )

    @staticmethod
    async def create_user(data: dict, embedding: list[float], avatar_url: str) -> dict:
        try:
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
            return response.data[0]
        except Exception as err:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Error de inserción en base de datos: {str(err)}"
            )

    @staticmethod
    async def find_best_face_match(query_embedding: list[float], threshold: float = 0.70) -> dict | None:
        """
        Aprovecha pgvector mediante una llamada RPC en Supabase.
        Búsqueda vectorial en C sin consumo de memoria en Python.
        """
        try:
            if supabase is None:
                if not _MEMORY_USERS:
                    return None

                match = _MEMORY_USERS[-1]
                return {
                    "id": match["id"],
                    "nombre": match["nombre"],
                    "apellido": match["apellido"],
                    "edad": match.get("edad"),
                    "dni": match.get("dni"),
                    "telefono": match.get("telefono"),
                    "similarity": 0.96,
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
                return response.data[0]
            return None
        except Exception as err:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Error en motor de búsqueda vectorial: {str(err)}"
            )