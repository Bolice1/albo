"""Redacted domain and validation exception handlers (CODING_STANDARDS.md §8, T-017)."""

from __future__ import annotations

import re
from typing import Final

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.contracts.common import ErrorBody, ErrorDetail, ErrorEnvelope
from app.logging import StructuredLogger, get_request_id

_SAFE_LOC_SEGMENT_RE: Final[re.Pattern[str]] = re.compile(r"^[A-Za-z0-9_.-]{1,64}$")
_SAFE_REASON_RE: Final[re.Pattern[str]] = re.compile(r"^[A-Za-z0-9_.-]{1,64}$")
_LOC_PREFIXES: Final[frozenset[str]] = frozenset({"body", "query", "path", "header", "cookie"})

_HTTP_STATUS_ERROR_MAP: Final[dict[int, tuple[str, str]]] = {
    400: ("MALFORMED_REQUEST", "The request could not be understood."),
    401: ("UNAUTHENTICATED", "Valid internal service authentication is required."),
    403: ("FORBIDDEN", "You do not have permission to perform this action."),
    404: ("NOT_FOUND", "The requested resource was not found."),
    405: ("METHOD_NOT_ALLOWED", "The HTTP method is not allowed for this endpoint."),
    409: ("CONFLICT", "The request conflicts with current state."),
    422: ("VALIDATION_ERROR", "The request contains invalid fields."),
    429: ("RATE_LIMITED", "Too many requests."),
    502: ("DEPENDENCY_UNAVAILABLE", "An upstream dependency failed."),
    503: ("DEPENDENCY_UNAVAILABLE", "The requested capability is currently unavailable."),
}


class DomainError(Exception):
    """Structured domain exception carrying safe error envelope fields only."""

    def __init__(
        self,
        *,
        status_code: int,
        code: str,
        message: str,
        details: list[ErrorDetail] | None = None,
    ) -> None:
        super().__init__(code)
        self.status_code = status_code
        self.code = code
        self.message = message
        self.details = list(details) if details is not None else []


class UnapprovedRuleVersionError(DomainError):
    """Raised when a requested use_case_code:rule_model_version is unknown or disabled."""

    def __init__(self, *, field: str = "rule_model_version") -> None:
        super().__init__(
            status_code=422,
            code="UNAPPROVED_OR_UNKNOWN_RULE_VERSION",
            message="The requested use_case_code or rule_model_version is unknown or not enabled.",
            details=[ErrorDetail(field=field, reason="unapproved_or_unknown_rule_version")],
        )


class InvalidInputRangeError(DomainError):
    """Raised when an input measurement violates physiological or schema bounds."""

    def __init__(self, details: list[ErrorDetail]) -> None:
        super().__init__(
            status_code=422,
            code="INVALID_INPUT_RANGE",
            message="One or more input fields are outside approved physiological or schema bounds.",
            details=details,
        )


def resolve_route_pattern(request: Request) -> str:
    """Return the matched route template (never raw query parameters)."""
    route = request.scope.get("route")
    route_path = getattr(route, "path", None)
    if isinstance(route_path, str) and route_path:
        return route_path
    raw_path = request.url.path
    return raw_path if len(raw_path) <= 128 else "/redacted-path"


def build_error_response(
    *,
    status_code: int,
    code: str,
    message: str,
    request_id: str,
    details: list[ErrorDetail] | None = None,
) -> JSONResponse:
    """Construct a standard ErrorEnvelope JSONResponse with X-Request-Id header."""
    envelope = ErrorEnvelope(
        error=ErrorBody(
            code=code,
            message=message,
            details=details if details is not None else [],
            request_id=request_id,
        )
    )
    response = JSONResponse(status_code=status_code, content=envelope.model_dump(mode="json"))
    if request_id:
        response.headers["X-Request-Id"] = request_id
    return response


def sanitize_validation_errors(exc: RequestValidationError) -> list[ErrorDetail]:
    """Strip all input values, ctx, msg, and URLs from Pydantic validation errors (T-017)."""
    redacted_details: list[ErrorDetail] = []
    for raw_err in exc.errors():
        raw_loc = raw_err.get("loc", ())
        segments = [str(part) for part in raw_loc]
        if segments and segments[0] in _LOC_PREFIXES:
            segments = segments[1:]

        safe_segments: list[str] = []
        for seg in segments:
            if _SAFE_LOC_SEGMENT_RE.match(seg):
                safe_segments.append(seg)
            else:
                safe_segments.append("redacted_field")

        field_path = ".".join(safe_segments) if safe_segments else "body"
        raw_type = str(raw_err.get("type", "validation_error"))
        reason = raw_type if _SAFE_REASON_RE.match(raw_type) else "validation_error"
        redacted_details.append(ErrorDetail(field=field_path, reason=reason))
    return redacted_details


def register_exception_handlers(app: FastAPI, logger: StructuredLogger) -> None:
    """Attach redacted validation, domain, HTTP, and catch-all exception handlers."""

    @app.exception_handler(DomainError)
    async def handle_domain_error(request: Request, exc: DomainError) -> JSONResponse:
        req_id = getattr(request.state, "request_id", "") or get_request_id()
        logger.warning(
            "domain_validation_failed",
            request_id=req_id,
            http_method=request.method,
            route_pattern=resolve_route_pattern(request),
            status_code=exc.status_code,
            error_code=exc.code,
        )
        return build_error_response(
            status_code=exc.status_code,
            code=exc.code,
            message=exc.message,
            details=exc.details,
            request_id=req_id,
        )

    @app.exception_handler(RequestValidationError)
    async def handle_validation_error(
        request: Request, exc: RequestValidationError
    ) -> JSONResponse:
        req_id = getattr(request.state, "request_id", "") or get_request_id()
        details = sanitize_validation_errors(exc)
        logger.warning(
            "validation_failed",
            request_id=req_id,
            http_method=request.method,
            route_pattern=resolve_route_pattern(request),
            status_code=422,
            error_code="VALIDATION_ERROR",
        )
        return build_error_response(
            status_code=422,
            code="VALIDATION_ERROR",
            message="The request contains invalid fields.",
            details=details,
            request_id=req_id,
        )

    @app.exception_handler(StarletteHTTPException)
    async def handle_http_exception(request: Request, exc: StarletteHTTPException) -> JSONResponse:
        req_id = getattr(request.state, "request_id", "") or get_request_id()
        code, safe_message = _HTTP_STATUS_ERROR_MAP.get(
            exc.status_code, ("HTTP_ERROR", "The request could not be completed.")
        )
        logger.warning(
            "http_error_returned",
            request_id=req_id,
            http_method=request.method,
            route_pattern=resolve_route_pattern(request),
            status_code=exc.status_code,
            error_code=code,
        )
        return build_error_response(
            status_code=exc.status_code,
            code=code,
            message=safe_message,
            details=[],
            request_id=req_id,
        )

    @app.exception_handler(Exception)
    async def handle_unexpected_exception(request: Request, exc: Exception) -> JSONResponse:
        req_id = getattr(request.state, "request_id", "") or get_request_id()
        logger.error(
            "unhandled_exception",
            request_id=req_id,
            http_method=request.method,
            route_pattern=resolve_route_pattern(request),
            status_code=500,
            error_code="INTERNAL_ERROR",
            exception_class=type(exc).__name__,
        )
        return build_error_response(
            status_code=500,
            code="INTERNAL_ERROR",
            message="An unexpected internal error occurred.",
            details=[],
            request_id=req_id,
        )
