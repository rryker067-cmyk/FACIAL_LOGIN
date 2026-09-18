from pydantic import BaseModel, Field

class LoginFaceRequest(BaseModel):
    imagen_base64: str = Field(..., description="String Base64 capturado desde React/Webcam")


class LoginCredentialsRequest(BaseModel):
    email: str = Field(..., min_length=3, description="Correo registrado en Supabase Auth")
    password: str = Field(..., min_length=1)


class CredentialsTokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: str
    nombre: str
    role: str = "Usuario"


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