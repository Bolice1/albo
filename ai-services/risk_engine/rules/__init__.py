"""Cataloged version-pinned rule specifications (MODEL_DOCUMENTATION.md §6)."""

from risk_engine.rules.lifestyle_ncd_v1_0_0 import LIFESTYLE_NCD_V1_0_0_SPEC
from risk_engine.rules.malaria_exposure_v0_1_0 import MALARIA_EXPOSURE_V0_1_0_SPEC
from risk_engine.rules.respiratory_air_quality_v0_1_0 import RESPIRATORY_AIR_QUALITY_V0_1_0_SPEC
from risk_engine.rules.water_hygiene_v0_1_0 import WATER_HYGIENE_V0_1_0_SPEC
from risk_engine.rules.wellbeing_checkin_v0_1_0 import WELLBEING_CHECKIN_V0_1_0_SPEC

ALL_CATALOGED_RULE_SPECS = (
    LIFESTYLE_NCD_V1_0_0_SPEC,
    MALARIA_EXPOSURE_V0_1_0_SPEC,
    RESPIRATORY_AIR_QUALITY_V0_1_0_SPEC,
    WATER_HYGIENE_V0_1_0_SPEC,
    WELLBEING_CHECKIN_V0_1_0_SPEC,
)

__all__ = [
    "ALL_CATALOGED_RULE_SPECS",
    "LIFESTYLE_NCD_V1_0_0_SPEC",
    "MALARIA_EXPOSURE_V0_1_0_SPEC",
    "RESPIRATORY_AIR_QUALITY_V0_1_0_SPEC",
    "WATER_HYGIENE_V0_1_0_SPEC",
    "WELLBEING_CHECKIN_V0_1_0_SPEC",
]
