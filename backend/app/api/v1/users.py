from fastapi import APIRouter, Depends, Header, HTTPException, status
from fastapi.concurrency import run_in_threadpool

from backend.app.core.face_embedder import face_embedder
from backend.app.core.liveness import LightweightLiveness
from backend.app.core.security import (
    create_face_verification_token,
    decode_access_token,
    get_authenticated_user,
)
from backend.app.db.repositories.user_repository import UserRepository
from backend.app.schemas.auth import FaceVerificationResponse
from backend.app.schemas.user import (
    FaceVerificationRequest,
    UserRegisterRequest,
    UserResponse,
    UserUpdateRequest,
)

router = APIRouter(prefix="/users", tags=["Gestión de Usuarios"])


@router.get("")
async def list_users(authenticated_user: dict = Depends(get_authenticated_user)):
    return await UserRepository.list_users()


@router.post(
    "/{user_id}/verify-face",
    response_model=FaceVerificationResponse,
)
@router.post(
    "/{user_id}/confirm-face",
    response_model=FaceVerificationResponse,
    include_in_schema=False,
)
async def verify_face_before_mutation(
    user_id: str,
    payload: FaceVerificationRequest,
    authenticated_user: dict = Depends(get_authenticated_user),
):
    """Issue a short-lived mutation grant after matching the signed-in user's face."""
    _require_same_user_or_admin(user_id, authenticated_user)
    if not payload.imagen_base64.startswith("data:image/"):
        raise HTTPException(status_code=422, detail={"error": "CAMERA_IMAGE_REQUIRED"})

    try:
        cv2_img = await run_in_threadpool(
            LightweightLiveness.verify_quality_and_liveness, payload.imagen_base64
        )
        embedding = await run_in_threadpool(face_embedder.extract_embedding, cv2_img)
        match = await UserRepository.find_face_match_for_user(user_id, embedding)
    except HTTPException:
        raise
    except Exception as err:
        await UserRepository.record_auth_event(
            event_type="face_verification", user_id=user_id, success=False,
            source="users/verify-face", error_code="FACE_PROCESSING_ERROR", message=str(err),
        )
        raise HTTPException(status_code=422, detail={"error": "FACE_PROCESSING_ERROR"}) from err

    if not match or float(match.get("similarity", 0)) < 0.75:
        await UserRepository.record_auth_event(
            event_type="face_verification", user_id=user_id, success=False,
            source="users/verify-face", similarity=float(match.get("similarity", 0)) if match else 0,
            error_code="FACE_NOT_VERIFIED", message="La identidad facial no coincide.",
        )
        raise HTTPException(status_code=403, detail={"error": "FACE_NOT_VERIFIED"})

    await UserRepository.record_auth_event(
        event_type="face_verification", user_id=user_id,
        success=True, source="users/verify-face",
        similarity=float(match["similarity"]), message="Identidad confirmada.",
    )
    return FaceVerificationResponse(
        verification_token=create_face_verification_token(user_id),
        user_id=user_id,
        nombre=f"{match['nombre']} {match['apellido']}",
        expires_in=5 * 60,
    )


@router.patch("/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: str,
    payload: UserUpdateRequest,
    authenticated_user: dict = Depends(get_authenticated_user),
    face_verification_token: str | None = Header(default=None, alias="X-Face-Verification-Token"),
):
    _require_mutation_grant(user_id, authenticated_user, face_verification_token)
    user = await UserRepository.update_user(user_id, payload.model_dump(exclude_unset=True))
    if not user:
        raise HTTPException(status_code=404, detail={"error": "USER_NOT_FOUND"})
    return _user_response(user)


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(
    user_id: str,
    authenticated_user: dict = Depends(get_authenticated_user),
    face_verification_token: str | None = Header(default=None, alias="X-Face-Verification-Token"),
):
    _require_mutation_grant(user_id, authenticated_user, face_verification_token)
    if not await UserRepository.delete_user(user_id):
        raise HTTPException(status_code=404, detail={"error": "USER_NOT_FOUND"})


def _require_mutation_grant(
    user_id: str, authenticated_user: dict, verification_token: str | None
) -> None:
    _require_same_user_or_admin(user_id, authenticated_user)
    if not verification_token:
        raise HTTPException(status_code=403, detail={"error": "FACE_VERIFICATION_REQUIRED"})
    try:
        claims = decode_access_token(verification_token)
        if (
            claims.get("purpose") != "face_verification"
            or str(claims.get("sub")) != str(user_id)
        ):
            raise ValueError("invalid grant")
    except Exception as err:
        if isinstance(err, HTTPException):
            raise
        raise HTTPException(status_code=403, detail={"error": "INVALID_FACE_VERIFICATION"}) from err


def _require_same_user_or_admin(user_id: str, authenticated_user: dict) -> None:
    if str(authenticated_user.get("user_id")) != str(user_id) and authenticated_user.get("role", "").lower() not in {
        "admin", "administrador", "service_role"
    }:
        raise HTTPException(status_code=403, detail={"error": "FORBIDDEN", "message": "No puede operar sobre otro usuario."})


def _user_response(user: dict) -> UserResponse:
    return UserResponse(
        id=str(user["id"]),
        nombre=user["nombre"],
        apellido=user["apellido"],
        imagen_url=user.get("imagen_url", ""),
        imagenes_urls=user.get("imagenes_urls") or [],
        edad=user.get("edad"),
        telefono=user.get("telefono"),
        email=user.get("email"),
        dni=user.get("dni"),
    )


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register_user(payload: UserRegisterRequest):
    if len(payload.imagenes_base64) != 3 or any(
        not image.startswith("data:image/") for image in payload.imagenes_base64
    ):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "error": "CAMERA_IMAGE_REQUIRED",
                "message": "El registro requiere exactamente tres fotografías capturadas desde la cámara.",
            },
        )

    embeddings: list[list[float]] = []
    await run_in_threadpool(LightweightLiveness.verify_sequence, payload.imagenes_base64)
    for image in payload.imagenes_base64:
        cv2_img = await run_in_threadpool(
            LightweightLiveness.verify_quality_and_liveness, image
        )
        embeddings.append(await run_in_threadpool(face_embedder.extract_embedding, cv2_img))

    pair_scores = [
        sum(left * right for left, right in zip(first, second))
        for index, first in enumerate(embeddings)
        for second in embeddings[index + 1:]
    ]
    consistency_score = min(pair_scores)
    if consistency_score < 0.45:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "error": "FACE_SAMPLES_INCONSISTENT",
                "message": "Las tres capturas no parecen pertenecer al mismo rostro. Repita el registro.",
                "consistency_score": round(consistency_score, 4),
            },
        )

    average_embedding = [sum(values) / len(values) for values in zip(*embeddings)]
    norm = sum(value * value for value in average_embedding) ** 0.5
    embedding = [value / norm for value in average_embedding]

    existing_match = await UserRepository.find_best_face_match(query_embedding=embedding, threshold=0.75)
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

    normalized_email = payload.email.strip().lower() if payload.email else None
    normalized_dni = payload.dni.strip() if payload.dni else None
    existing_identity = await UserRepository.find_by_identity(
        email=normalized_email,
        dni=normalized_dni,
    )
    if existing_identity:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "error": "USER_ALREADY_REGISTERED",
                "message": "El correo o DNI ya está registrado. Inicie sesión.",
            },
        )

    image_urls = [await UserRepository.upload_avatar(image) for image in payload.imagenes_base64]

    registration_data = payload.model_dump()
    registration_data.update(email=normalized_email, dni=normalized_dni)
    user = await UserRepository.create_user(
        data=registration_data,
        embedding=embedding,
        avatar_url=image_urls[0],
        image_urls=image_urls,
        embeddings=embeddings,
    )

    response = _user_response(user)
    return response.model_copy(update={
        "validation_score": round(consistency_score * 100, 2),
        "sample_count": len(embeddings),
    })