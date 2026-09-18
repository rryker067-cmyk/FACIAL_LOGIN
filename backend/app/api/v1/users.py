from fastapi import APIRouter, HTTPException, status
from fastapi.concurrency import run_in_threadpool

from backend.app.core.face_embedder import face_embedder
from backend.app.core.liveness import LightweightLiveness
from backend.app.db.repositories.user_repository import UserRepository
from backend.app.schemas.user import UserRegisterRequest, UserResponse

router = APIRouter(prefix="/users", tags=["Gestión de Usuarios"])


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register_user(payload: UserRegisterRequest):
    if not payload.imagen_base64.startswith("data:image/"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "error": "CAMERA_IMAGE_REQUIRED",
                "message": "El registro requiere una fotografía capturada desde la cámara.",
            },
        )

    cv2_img = await run_in_threadpool(
        LightweightLiveness.verify_quality_and_liveness,
        payload.imagen_base64
    )

    embedding = await run_in_threadpool(
        face_embedder.extract_embedding,
        cv2_img
    )

    existing_match = await UserRepository.find_best_face_match(
        query_embedding=embedding,
        threshold=0.75,
    )
    if existing_match:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "error": "USER_ALREADY_REGISTERED",
                "message": "Este rostro ya está registrado. Inicie sesión.",
                "user_id": str(existing_match["id"]),
                "similarity": float(existing_match.get("similarity", 0)),
            },
        )

    existing_identity = await UserRepository.find_by_identity(
        email=payload.email,
        dni=payload.dni,
    )
    if existing_identity:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "error": "USER_ALREADY_REGISTERED",
                "message": "El correo o DNI ya está registrado. Inicie sesión.",
            },
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