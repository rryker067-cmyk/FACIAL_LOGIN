from pydantic import BaseModel, Field

class LoginFaceRequest(BaseModel):
    imagen_base64: str = Field(..., description="String Base64 capturado desde React/Webcam")

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: str
    nombre: str
    match_percentage: str