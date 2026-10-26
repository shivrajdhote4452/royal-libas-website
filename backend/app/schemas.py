"""Pydantic schemas for Royal Libas API request and response validation.

Phase 0 placeholder: Actual schemas will be created in Phase 1 and Phase 2
per the phase-wise plan.
"""

from pydantic import BaseModel


class HealthResponse(BaseModel):
    status: str
