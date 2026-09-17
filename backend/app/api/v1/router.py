from backend.app.api.v1 import auth
from fastapi import APIRouter, HTTPException, status
from fastapi.concurrency import run_in_threadpool

from backend.app.api.v1 import users
from backend.app.core.face_embedder import face_embedder
from backend.app.core.liveness import LightweightLiveness
from backend.app.db.repositories.user_repository import UserRepository
from backend.app.schemas.user import FaceRecognitionRequest

api_router = APIRouter(prefix="/v1")
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
        match = await UserRepository.find_best_face_match(embedding, threshold=0.60)

        if not match:
            return {
                "nombre": "",
                "apellido": "",
                "edad": "",
                "dni": "",
                "telefono": "",
                "similarity": 0,
            }

        return {
            "nombre": match.get("nombre", ""),
            "apellido": match.get("apellido", ""),
            "edad": match.get("edad", ""),
            "dni": match.get("dni", ""),
            "telefono": match.get("telefono", ""),
            "similarity": match.get("similarity", 0.95),
        }
    except HTTPException:
        raise
    except Exception as err:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error en reconocimiento facial: {str(err)}"
        )