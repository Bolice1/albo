"""Validated runtime configuration for Albo AI services."""

from __future__ import annotations

import json
import re
from typing import Annotated, Any, Final, Literal

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

EnvironmentName = Literal["development", "test", "staging", "production"]
LogLevelName = Literal["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"]

DEFAULT_ENABLED_RULE_VERSIONS: Final[tuple[str, ...]] = ("lifestyle_ncd_preventive:rules-v1.0.0",)
_RULE_VERSION_PAIR_RE: Final[re.Pattern[str]] = re.compile(r"^[a-z0-9_]+:[A-Za-z0-9._-]+$")


class Settings(BaseSettings):
    """Fail-fast application settings validated at service startup."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        frozen=True,
    )

    ENVIRONMENT: EnvironmentName = "development"
    INTERNAL_SERVICE_TOKEN: str = Field(min_length=32)
    ENABLED_RULE_VERSIONS: Annotated[list[str], NoDecode] = Field(
        default_factory=lambda: list(DEFAULT_ENABLED_RULE_VERSIONS)
    )
    ASSISTANT_ENABLED: bool = False
    CHECKIN_SAFETY_ENABLED: bool = True
    SERVICE_NAME: str = "albo-ai-services"
    LOG_LEVEL: LogLevelName = "INFO"

    @field_validator("INTERNAL_SERVICE_TOKEN")
    @classmethod
    def validate_internal_service_token(cls, value: str) -> str:
        stripped = value.strip()
        if len(stripped) < 32:
            msg = "INTERNAL_SERVICE_TOKEN must contain at least 32 non-whitespace characters."
            raise ValueError(msg)
        return value

    @field_validator("ENABLED_RULE_VERSIONS", mode="before")
    @classmethod
    def parse_enabled_rule_versions(cls, value: Any) -> list[str]:
        if value is None:
            raw_items: list[Any] = list(DEFAULT_ENABLED_RULE_VERSIONS)
        elif isinstance(value, str):
            stripped = value.strip()
            if not stripped:
                raw_items = []
            elif stripped.startswith("["):
                parsed = json.loads(stripped)
                if not isinstance(parsed, list):
                    msg = "ENABLED_RULE_VERSIONS JSON value must be a list of strings."
                    raise ValueError(msg)
                raw_items = parsed
            else:
                raw_items = [part.strip() for part in stripped.split(",") if part.strip()]
        elif isinstance(value, (list, tuple, set, frozenset)):
            raw_items = list(value)
        else:
            msg = "ENABLED_RULE_VERSIONS must be a comma-separated string or list of use_case:version pairs."
            raise ValueError(msg)

        normalized: list[str] = []
        seen: set[str] = set()
        for item in raw_items:
            if not isinstance(item, str):
                msg = "Each entry in ENABLED_RULE_VERSIONS must be a string."
                raise ValueError(msg)
            cleaned = item.strip()
            if not _RULE_VERSION_PAIR_RE.match(cleaned):
                msg = "Each ENABLED_RULE_VERSIONS entry must match '<use_case_code>:<version>'."
                raise ValueError(msg)
            if cleaned not in seen:
                seen.add(cleaned)
                normalized.append(cleaned)
        return normalized

    @model_validator(mode="before")
    @classmethod
    def normalize_env_aliases(cls, data: Any) -> Any:
        if not isinstance(data, dict):
            return data
        copied = dict(data)
        if (
            "ASSISTANT_ENABLED" not in copied
            and "assistant_enabled" not in copied
            and "FEATURE_ASSISTANT_ENABLED" in copied
        ):
            copied["ASSISTANT_ENABLED"] = copied["FEATURE_ASSISTANT_ENABLED"]
        if (
            "CHECKIN_SAFETY_ENABLED" not in copied
            and "checkin_safety_enabled" not in copied
            and "FEATURE_CHECKINS_ENABLED" in copied
        ):
            copied["CHECKIN_SAFETY_ENABLED"] = copied["FEATURE_CHECKINS_ENABLED"]
        if (
            "ENABLED_RULE_VERSIONS" not in copied
            and "enabled_rule_versions" not in copied
            and "APPROVED_RISK_RULE_VERSIONS" in copied
        ):
            copied["ENABLED_RULE_VERSIONS"] = copied["APPROVED_RISK_RULE_VERSIONS"]
        return copied

    @model_validator(mode="after")
    def validate_environment_safety_gates(self) -> Settings:
        if self.ENVIRONMENT in ("production", "staging"):
            for pair in self.ENABLED_RULE_VERSIONS:
                if pair.endswith("-draft"):
                    msg = "Draft rule versions cannot be enabled in staging or production."
                    raise ValueError(msg)
            if not self.CHECKIN_SAFETY_ENABLED:
                msg = "CHECKIN_SAFETY_ENABLED cannot be disabled in staging or production."
                raise ValueError(msg)
        return self

    @property
    def assistant_enabled(self) -> bool:
        return self.ASSISTANT_ENABLED

    @property
    def checkin_safety_enabled(self) -> bool:
        return self.CHECKIN_SAFETY_ENABLED

    @property
    def environment(self) -> EnvironmentName:
        return self.ENVIRONMENT

    @property
    def enabled_rule_version_set(self) -> frozenset[str]:
        return frozenset(self.ENABLED_RULE_VERSIONS)


def load_settings() -> Settings:
    """Load and validate settings from environment and optional .env file."""
    return Settings()
