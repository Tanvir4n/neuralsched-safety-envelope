"""Central configuration for NeuralSched backend.

Values come from environment variables (see docker-compose.yml / .env).
Everything has a sensible local default so the app also runs bare-metal.
"""
from __future__ import annotations

from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # --- App ---
    app_name: str = "NeuralSched"
    environment: str = "local"

    # --- Auth ---
    jwt_secret: str = "neuralsched-dev-secret-change-me"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 720

    # --- Database ---
    # Local docker-compose Postgres by default.
    database_url: str = "postgresql://neuralsched:neuralsched@db:5432/neuralsched"

    # --- Telemetry simulator ---
    telemetry_tick_seconds: float = 10.0
    # SmartPack's PPO policy is trained for a fixed 32-node cluster.
    num_gpu_nodes: int = 32

    # --- Safety Envelope (Additional Challenge: Safety Envelope + Shadow Test) ---
    # Hard limits the shadow agent's hypothetical action may never break.
    max_node_temp_c: float = 82.0     # reject any placement onto a hotter node
    max_job_wait_sec: float = 120.0   # reject any placement that would starve a job
    # Auto synthetic job stream that continuously feeds the shadow comparison.
    synthetic_jobs_enabled: bool = True
    synthetic_job_period_sec: float = 6.0

    # --- Models ---
    models_dir: str = "app/models"

    # --- Carbon signal ---
    # If unset, a synthetic 24h curve is used (see greensched.py).
    electricity_maps_token: str = ""
    electricity_maps_zone: str = "DE"


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
