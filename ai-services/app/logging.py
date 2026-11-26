"""Structured JSON logging enforcing CODING_STANDARDS.md §8.2 allowlist."""

from __future__ import annotations

import json
import logging
import re
import sys
from contextvars import ContextVar, Token
from datetime import UTC, datetime
from typing import Final

request_id_ctx: ContextVar[str] = ContextVar("request_id", default="")

LOGGER_NAME: Final[str] = "albo.ai_services"

ALLOWED_LOG_FIELDS: Final[frozenset[str]] = frozenset(
    {
        "timestamp",
        "level",
        "service",
        "environment",
        "event",
        "request_id",
        "trace_id",
        "span_id",
        "http_method",
        "route_pattern",
        "status_code",
        "duration_ms",
        "use_case_code",
        "rule_model_version",
        "assessment_status",
        "error_code",
        "exception_class",
        "safety_reason_codes",
    }
)

_SAFE_EVENT_RE: Final[re.Pattern[str]] = re.compile(r"^[a-z0-9_]{1,64}$")
_SAFE_CODE_RE: Final[re.Pattern[str]] = re.compile(r"^[A-Za-z0-9._:/-]{1,128}$")

LogFieldValue = str | int | float | bool | list[str] | None


def get_request_id() -> str:
    """Return the active request correlation ID from contextvars."""
    return request_id_ctx.get()


def set_request_id(request_id: str) -> Token[str]:
    """Bind the request correlation ID into contextvars."""
    return request_id_ctx.set(request_id)


def reset_request_id(token: Token[str]) -> None:
    """Restore previous contextvar state after request completion."""
    request_id_ctx.reset(token)


def _sanitize_scalar(key: str, value: LogFieldValue) -> LogFieldValue:
    if value is None:
        return None
    if isinstance(value, bool):
        return value
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return round(value, 3)
    if isinstance(value, str):
        if key in {
            "request_id",
            "trace_id",
            "span_id",
            "http_method",
            "route_pattern",
            "use_case_code",
            "rule_model_version",
            "assessment_status",
            "error_code",
            "exception_class",
            "service",
            "environment",
        }:
            return value if _SAFE_CODE_RE.match(value) else "REDACTED_UNSAFE_TOKEN"
        return value if _SAFE_EVENT_RE.match(value) else "REDACTED_UNSAFE_EVENT"
    if isinstance(value, list):
        clean_list: list[str] = []
        for item in value[:16]:
            if isinstance(item, str) and _SAFE_CODE_RE.match(item):
                clean_list.append(item)
        return clean_list
    return None


class RedactedJsonFormatter(logging.Formatter):
    """Serializes log records strictly using the CODING_STANDARDS.md §8.2 allowlist."""

    def __init__(
        self, *, service: str = "albo-ai-services", environment: str = "development"
    ) -> None:
        super().__init__()
        self._service = service
        self._environment = environment

    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, object] = {
            "timestamp": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
            "level": record.levelname,
            "service": self._service,
            "environment": self._environment,
        }

        raw_msg = record.msg if isinstance(record.msg, str) else "log_event"
        payload["event"] = raw_msg if _SAFE_EVENT_RE.match(raw_msg) else "redacted_log_event"

        ctx_req_id = get_request_id()
        if ctx_req_id and _SAFE_CODE_RE.match(ctx_req_id):
            payload["request_id"] = ctx_req_id

        structured_raw = getattr(record, "structured_fields", None)
        if isinstance(structured_raw, dict):
            for key, val in structured_raw.items():
                if key not in ALLOWED_LOG_FIELDS or key in {"timestamp", "level"}:
                    continue
                sanitized = _sanitize_scalar(key, val)
                if sanitized is not None:
                    payload[key] = sanitized

        return json.dumps(payload, separators=(",", ":"), sort_keys=False)


class StructuredLogger:
    """Allowlist-enforcing structured logger facade."""

    def __init__(self, logger: logging.Logger, *, service: str, environment: str) -> None:
        self._logger = logger
        self._service = service
        self._environment = environment

    def _emit(self, level: int, event: str, **fields: LogFieldValue) -> None:
        safe_event = event if _SAFE_EVENT_RE.match(event) else "redacted_log_event"
        clean_fields: dict[str, LogFieldValue] = {
            "service": self._service,
            "environment": self._environment,
        }
        ctx_req_id = get_request_id()
        if ctx_req_id:
            clean_fields["request_id"] = ctx_req_id

        for key, value in fields.items():
            if key in ALLOWED_LOG_FIELDS and value is not None:
                sanitized = _sanitize_scalar(key, value)
                if sanitized is not None:
                    clean_fields[key] = sanitized

        self._logger.log(level, safe_event, extra={"structured_fields": clean_fields})

    def info(self, event: str, **fields: LogFieldValue) -> None:
        self._emit(logging.INFO, event, **fields)

    def warning(self, event: str, **fields: LogFieldValue) -> None:
        self._emit(logging.WARNING, event, **fields)

    def error(self, event: str, **fields: LogFieldValue) -> None:
        self._emit(logging.ERROR, event, **fields)


def configure_logging(*, service: str, environment: str, level: str = "INFO") -> StructuredLogger:
    """Configure the redacted structured JSON logger and silence unsafe default loggers."""
    logger = logging.getLogger(LOGGER_NAME)
    logger.setLevel(getattr(logging, level.upper(), logging.INFO))

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(RedactedJsonFormatter(service=service, environment=environment))

    logger.handlers.clear()
    logger.addHandler(handler)
    logger.propagate = True

    for noisy_logger_name in ("uvicorn.access", "fastapi"):
        noisy = logging.getLogger(noisy_logger_name)
        noisy.handlers.clear()
        noisy.propagate = False

    return StructuredLogger(logger, service=service, environment=environment)
