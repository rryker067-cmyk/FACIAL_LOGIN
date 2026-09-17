from fastapi import APIRouter, status
from fastapi.concurrency import run_in_threadpool

from backend.app.core.face_embedder import face_embedder
from backend.app.core.liveness import LightweightLiveness
from backend.app.db.repositories.user_repository import UserRepository
from backend.app.schemas.user import UserRegisterRequest, UserResponse

router = APIRouter(prefix="/users", tags=["Gestión de Usuarios"])


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register_user(payload: UserRegisterRequest):
    cv2_img = await run_in_threadpool(
        LightweightLiveness.verify_quality_and_liveness,
        payload.imagen_base64
    )

    embedding = await run_in_threadpool(
        face_embedder.extract_embedding,
        cv2_img
    )

    avatar_url = await UserRepository.upload_avatar(payload.imagen_base64)

    user = await UserRepository.create_user(
        data=payload.model_dump(),
        embedding=embedding,
        avatar_url=avatar_url
    )

    return UserResponse(
        id=str(user["id"]),
        nombre=user["nombre"],
        apellido=user["apellido"],
        imagen_url=user["imagen_url"]
    )