"""Internal /internal/v1 FastAPI routers."""

from fastapi import APIRouter

from app.routes.assistant import router as assistant_router
from app.routes.check_ins import router as check_ins_router
from app.routes.health import router as health_router
from app.routes.risk_assessments import router as risk_assessments_router


def build_internal_v1_router() -> APIRouter:
    """Assemble the complete /internal/v1 router surface."""
    api_router = APIRouter()
    api_router.include_router(health_router, prefix="/internal/v1")
    api_router.include_router(risk_assessments_router, prefix="/internal/v1")
    api_router.include_router(check_ins_router, prefix="/internal/v1")
    api_router.include_router(assistant_router, prefix="/internal/v1")
    return api_router


__all__ = ["build_internal_v1_router"]
