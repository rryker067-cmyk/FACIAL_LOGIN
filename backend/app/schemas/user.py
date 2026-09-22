from pydantic import BaseModel, Field, field_validator


class UserRegisterRequest(BaseModel):
    nombre: str = Field(..., min_length=2)
    apellido: str = Field(..., min_length=2)
    edad: int = Field(..., ge=18, le=120)
    telefono: str = Field(..., min_length=8)
    email: str = Field(..., min_length=3, description="Correo electrónico de Supabase Auth")
    dni: str | None = Field(default=None, description="Documento de identidad opcional del usuario")
    password: str = Field(..., min_length=8, max_length=128, description="Contraseña de Supabase Auth")
    imagenes_base64: list[str] = Field(..., min_length=3, max_length=3)

    @field_validator("imagenes_base64")
    @classmethod
    def validate_image_payloads(cls, images: list[str]) -> list[str]:
        max_encoded_length = 7_000_000
        if any(len(image) > max_encoded_length for image in images):
            raise ValueError("Cada imagen supera el tamaño máximo permitido.")
        if sum(len(image) for image in images) > max_encoded_length * 3:
            raise ValueError("El tamaño total de las imágenes supera el límite permitido.")
        return images


class FaceRecognitionRequest(BaseModel):
    image: str = Field(..., max_length=7_000_000, description="Imagen en base64 o data URL")


class FaceVerificationRequest(BaseModel):
    imagen_base64: str = Field(..., max_length=7_000_000, description="Fotografía capturada desde la cámara")


class UserUpdateRequest(BaseModel):
    nombre: str | None = Field(default=None, min_length=2)
    apellido: str | None = Field(default=None, min_length=2)
    edad: int | None = Field(default=None, ge=18, le=120)
    telefono: str | None = Field(default=None, min_length=8)
    email: str | None = None
    dni: str | None = None


class UserResponse(BaseModel):
    id: str
    nombre: str
    apellido: str
    imagen_url: str
    imagenes_urls: list[str] = Field(default_factory=list)
    edad: int | None = None
    telefono: str | None = None
    email: str | None = None
    dni: str | None = None
    validation_score: float | None = None
    sample_count: int | None = None