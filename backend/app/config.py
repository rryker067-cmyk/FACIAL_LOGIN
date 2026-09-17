import json
from typing import Any

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


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
    ALLOWED_ORIGINS: list[str] = Field(
        default_factory=lambda: [
            "http://localhost:5173",
            "http://localhost:3000",
            "http://127.0.0.1:5173",
            "https://tu-dominio-frontend.com",
        ]
    )

    model_config = SettingsConfigDict(
        env_file=".env",
        case_sensitive=True,
        extra="ignore",
    )

    @field_validator("ALLOWED_ORIGINS", mode="before")
    @classmethod
    def parse_allowed_origins(cls, value: Any) -> list[str]:
        if value is None or value == "":
            return []

        if isinstance(value, list):
            return [str(item).strip() for item in value if str(item).strip()]

        if isinstance(value, tuple):
            return [str(item).strip() for item in value if str(item).strip()]

        if isinstance(value, str):
            raw = value.strip()
            if not raw:
                return []

            if raw.startswith("[") and raw.endswith("]"):
                try:
                    parsed = json.loads(raw)
                    if isinstance(parsed, list):
                        return [str(item).strip() for item in parsed if str(item).strip()]
                except (TypeError, ValueError):
                    pass

            # Soporta valores tipo: "https://a.com, https://b.com"
            # o bien una sola URL sin comas.
            items = [item.strip() for item in raw.replace("\n", ",").split(",") if item.strip()]
            return items or [raw]

        return [str(value).strip()]


settings = Settings()