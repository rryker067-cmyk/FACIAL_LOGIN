from pydantic import BaseModel, Field


class UserRegisterRequest(BaseModel):
    nombre: str = Field(..., min_length=2)
    apellido: str = Field(..., min_length=2)
    edad: int = Field(..., ge=18, le=120)
    telefono: str = Field(..., min_length=8)
    email: str | None = Field(default=None, description="Correo electrónico opcional del usuario")
    dni: str | None = Field(default=None, description="Documento de identidad opcional del usuario")
    imagen_base64: str = Field(...)


class FaceRecognitionRequest(BaseModel):
    image: str = Field(..., description="Imagen en base64 o data URL")


class UserResponse(BaseModel):
    id: str
    nombre: str
    apellido: str
    imagen_url: str