from typing import Any, Union

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    PROJECT_NAME: str = "Biometric Enterprise Auth API"
    VERSION: str = "1.0.0"
    API_V1_STR: str = "/api/v1"

    SUPABASE_URL: str = "https://gisimvwibyoxrskkkvav.supabase.co"
    SUPABASE_KEY: str = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdpc2ltdndpYnlveHJza2trdmF2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4OTYwNTA4MSwiZXhwIjoyMTA1MTgxMDgxfQ.YfF1eYFdOtk0u7qBR9JS8Bl5hHLzERQFsFwbPwrMnc8"
    JWT_SECRET: str = "ua+yB81FKSkt7sOBEEKFsmkd/ch7NYIIScNKK54vn5RDqVNRbKuufdhqZaNE4kBd1PB8yosUb3JEZ7rLZCxN9g=="
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 8

    ALLOWED_ORIGINS: Union[list[str], str] = [
        "http://localhost:5173",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
        "https://facial-login-4owk00z6g-dz-em19.vercel.app",
    ]

    model_config = SettingsConfigDict(
        env_file=(".env", "backend/.env"),
        case_sensitive=True,
        extra="ignore",
    )

    @field_validator("JWT_SECRET")
    @classmethod
    def validate_jwt_secret(cls, value: str) -> str:
        if len(value) < 32 or value == "ua+yB81FKSkt7sOBEEKFsmkd/ch7NYIIScNKK54vn5RDqVNRbKuufdhqZaNE4kBd1PB8yosUb3JEZ7rLZCxN9g==":
            raise ValueError("JWT_SECRET debe ser una clave secreta de al menos 32 caracteres.")
        return value

    @field_validator("ALLOWED_ORIGINS", mode="before")
    @classmethod
    def assemble_cors_origins(cls, v: Union[str, list[str], None]) -> list[str]:
        if v is None or v == "":
            return []

        if isinstance(v, list):
            return [str(item).strip() for item in v if str(item).strip()]

        if isinstance(v, str):
            if v.startswith("["):
                import json

                try:
                    parsed = json.loads(v)
                    if isinstance(parsed, list):
                        return [str(item).strip() for item in parsed if str(item).strip()]
                except (TypeError, ValueError):
                    pass

            return [item.strip() for item in v.split(",") if item.strip()]

        return [str(v).strip()]


settings = Settings()