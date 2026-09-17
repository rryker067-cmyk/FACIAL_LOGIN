import os
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    PROJECT_NAME: str = "Biometric Enterprise Auth API"
    VERSION: str = "1.0.0"
    API_V1_STR: str = "/api/v1"

    # Credentials (defaults seguros para desarrollo local sin Supabase)
    SUPABASE_URL: str = ""
    SUPABASE_KEY: str = ""

    # Security
    JWT_SECRET: str = "development-secret-key"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 8  # 8 Horas

    # CORS Configuration
    ALLOWED_ORIGINS: list[str] = [
        "http://localhost:5173",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
        "https://tu-dominio-frontend.com"
    ]

    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()