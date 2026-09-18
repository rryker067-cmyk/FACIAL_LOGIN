from backend.app.api.v1 import auth
from fastapi import APIRouter, HTTPException, status
from fastapi.concurrency import run_in_threadpool

from backend.app.api.v1 import users
from backend.app.core.face_embedder import face_embedder
from backend.app.core.liveness import LightweightLiveness
from backend.app.db.repositories.user_repository import UserRepository
from backend.app.schemas.user import FaceRecognitionRequest

api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(users.router)


@api_router.post("/face-recognition/recognize")
async def recognize_face(payload: FaceRecognitionRequest):
    try:
        image = payload.image
        if not image:
            raise HTTPException(status_code=400, detail="Falta la imagen en el payload.")

        cv2_img = await run_in_threadpool(LightweightLiveness.verify_quality_and_liveness, image)
        embedding = await run_in_threadpool(face_embedder.extract_embedding, cv2_img)
        match = await UserRepository.find_best_face_match(embedding, threshold=0.75)

        similarity = float(match.get("similarity", 0)) if match else 0
        if not match or similarity < 0.75:
            await UserRepository.record_recognition_event(
                user_id=None,
                similarity=similarity,
                recognized=False,
                source="dashboard",
            )
            return {
                "nombre": "",
                "apellido": "",
                "edad": "",
                "dni": "",
                "telefono": "",
                "email": "",
                "imagen_url": "",
                "similarity": 0,
            }

        await UserRepository.record_recognition_event(
            user_id=str(match.get("id")) if match.get("id") else None,
            similarity=similarity,
            recognized=True,
            source="dashboard",
        )
        return {
            "nombre": match.get("nombre", ""),
            "apellido": match.get("apellido", ""),
            "edad": match.get("edad", ""),
            "dni": match.get("dni", ""),
            "telefono": match.get("telefono", ""),
            "email": match.get("email", ""),
            "imagen_url": match.get("imagen_url", ""),
            "similarity": similarity,
        }
    except HTTPException:
        raise
    except Exception as err:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error en reconocimiento facial: {str(err)}"
        )


@api_router.get("/dashboard/stats")
async def dashboard_stats():
    return await UserRepository.get_dashboard_stats()