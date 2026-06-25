from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "caltrack-backend"
    app_env: str = "dev"
    app_cors_origins: str = "*"

    database_url: str = "postgresql://localhost/postgres"

    supabase_url: str = ""
    supabase_jwks_url: str = ""
    supabase_jwt_audience: str = "authenticated"

    gemini_api_key: str = ""
    gemini_model: str = "gemini-2.5-flash-lite"

    groq_api_key: str = ""
    groq_model: str = "llama-3.3-70b-versatile"
    groq_vision_model: str = "llama-3.2-11b-vision-preview"
    primary_provider: str = "groq"  # "groq" or "gemini"; the other is used as fallback


settings = Settings()
