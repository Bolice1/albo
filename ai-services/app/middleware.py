"""ASGI middlewares for X-Request-Id propagation, internal service auth, and redacted logging."""

from __future__ import annotations

import hmac
import re
import time
import uuid
from typing import Final

from starlette.datastructures import Headers, MutableHeaders
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.config import Settings
from app.errors import build_error_response
from app.logging import StructuredLogger, get_request_id, reset_request_id, set_request_id

_SAFE_REQUEST_ID_RE: Final[re.Pattern[str]] = re.compile(r"^[A-Za-z0-9._-]{1,128}$")
_HEALTH_PATH: Final[str] = "/internal/v1/health"
_PROTECTED_PREFIX: Final[str] = "/internal/v1/"


def _extract_or_generate_request_id(headers: Headers) -> str:
    candidate = headers.get("x-request-id", "")
    if candidate and _SAFE_REQUEST_ID_RE.match(candidate):
        return candidate
    return str(uuid.uuid4())


class RequestIdMiddleware:
    """Validates or generates X-Request-Id, binds contextvar, and echoes header on every response."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        headers = Headers(scope=scope)
        request_id = _extract_or_generate_request_id(headers)
        state = scope.setdefault("state", {})
        if isinstance(state, dict):
            state["request_id"] = request_id

        ctx_token = set_request_id(request_id)

        async def send_with_request_id(message: Message) -> None:
            if message["type"] == "http.response.start":
                mutable_headers = MutableHeaders(scope=message)
                mutable_headers["X-Request-Id"] = request_id
            await send(message)

        try:
            await self.app(scope, receive, send_with_request_id)
        finally:
            reset_request_id(ctx_token)


class RequestLoggingMiddleware:
    """Emits redacted request completion logs and shields unhandled 500 exceptions."""

    def __init__(self, app: ASGIApp, *, logger: StructuredLogger) -> None:
        self.app = app
        self._logger = logger

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        start = time.perf_counter()
        status_code_holder: list[int] = [500]
        response_started = False

        async def capture_status_send(message: Message) -> None:
            nonlocal response_started
            if message["type"] == "http.response.start":
                response_started = True
                status_code_holder[0] = int(message["status"])
            await send(message)

        method = str(scope.get("method", "UNKNOWN"))
        raw_path = str(scope.get("path", "/"))

        try:
            await self.app(scope, receive, capture_status_send)
        except Exception as exc:
            req_id = get_request_id()
            route = scope.get("route")
            route_pattern = getattr(route, "path", None) or (
                raw_path if len(raw_path) <= 128 else "/redacted-path"
            )
            self._logger.error(
                "unhandled_exception",
                request_id=req_id,
                http_method=method,
                route_pattern=str(route_pattern),
                status_code=500,
                error_code="INTERNAL_ERROR",
                exception_class=type(exc).__name__,
            )
            if not response_started:
                fallback = build_error_response(
                    status_code=500,
                    code="INTERNAL_ERROR",
                    message="An unexpected internal error occurred.",
                    details=[],
                    request_id=req_id,
                )
                await fallback(scope, receive, capture_status_send)
        finally:
            duration_ms = round((time.perf_counter() - start) * 1000.0, 3)
            route = scope.get("route")
            route_pattern = getattr(route, "path", None) or (
                raw_path if len(raw_path) <= 128 else "/redacted-path"
            )
            self._logger.info(
                "http_request_completed",
                request_id=get_request_id(),
                http_method=method,
                route_pattern=str(route_pattern),
                status_code=status_code_holder[0],
                duration_ms=duration_ms,
            )


class InternalAuthMiddleware:
    """Enforces constant-time X-Internal-Service-Token verification on /internal/v1/* (ADR-013, T-013)."""

    def __init__(self, app: ASGIApp, *, settings: Settings, logger: StructuredLogger) -> None:
        self.app = app
        self._expected_token_bytes = settings.INTERNAL_SERVICE_TOKEN.encode("utf-8")
        self._logger = logger

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        path = str(scope.get("path", ""))
        normalized_path = path.rstrip("/") if path != "/" else path

        if normalized_path == _HEALTH_PATH or not path.startswith(_PROTECTED_PREFIX):
            await self.app(scope, receive, send)
            return

        headers = Headers(scope=scope)
        submitted_token = headers.get("x-internal-service-token")
        is_valid = False
        if submitted_token is not None:
            submitted_bytes = submitted_token.encode("utf-8")
            is_valid = hmac.compare_digest(submitted_bytes, self._expected_token_bytes)

        if not is_valid:
            req_id = get_request_id()
            method = str(scope.get("method", "UNKNOWN"))
            safe_path = path if len(path) <= 128 else "/internal/v1/redacted"
            self._logger.warning(
                "internal_auth_failed",
                request_id=req_id,
                http_method=method,
                route_pattern=safe_path,
                status_code=401,
                error_code="UNAUTHENTICATED",
            )
            response = build_error_response(
                status_code=401,
                code="UNAUTHENTICATED",
                message="Missing or invalid internal service token.",
                details=[],
                request_id=req_id,
            )
            await response(scope, receive, send)
            return

        await self.app(scope, receive, send)
