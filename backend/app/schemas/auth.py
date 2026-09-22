from pydantic import BaseModel, Field, field_validator

class LoginFaceRequest(BaseModel):
    imagenes_base64: list[str] = Field(..., min_length=3, max_length=3, description="Tres capturas consecutivas de la cámara")

    @field_validator("imagenes_base64")
    @classmethod
    def validate_images(cls, images: list[str]) -> list[str]:
        for index, image in enumerate(images):
            if not image.startswith("data:image/"):
                raise ValueError(f"La captura {index + 1} debe ser una imagen de cámara.")
            if len(image) > 7_000_000:
                raise ValueError(f"La captura {index + 1} supera el tamaño máximo permitido.")
        return images


class AuditEventResponse(BaseModel):
    id: str
    event_type: str
    user_id: str | None = None
    similarity: float | None = None
    success: bool
    source: str
    message: str | None = None
    error_code: str | None = None
    metadata: dict | None = None
    created_at: str


class LoginCredentialsRequest(BaseModel):
    email: str = Field(..., min_length=3, description="Correo registrado en Supabase Auth")
    password: str = Field(..., min_length=1)


class CredentialsTokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: str
    nombre: str
    role: str = "Usuario"


class AuthenticatedUserResponse(BaseModel):
    user_id: str
    nombre: str
    role: str = "Usuario"


class FaceVerificationResponse(BaseModel):
    verification_token: str
    user_id: str
    nombre: str
    expires_in: int


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: str
    nombre: str
    match_percentage: str
    email: str | None = None
    dni: str | None = None
    edad: int | None = None
    telefono: str | None = None