from datetime import datetime
from decimal import Decimal
from typing import List, Optional
from pydantic import BaseModel, ConfigDict, EmailStr, field_validator


class HealthResponse(BaseModel):
    status: str


# ==========================================
# Admin Authentication Schemas
# ==========================================

class AdminLogin(BaseModel):
    email: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class AdminResponse(BaseModel):
    id: int
    email: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ==========================================
# Product & Variant Schemas (Phase 1 & 2)
# ==========================================

class ProductVariantCreate(BaseModel):
    size: str
    colour: Optional[str] = None
    sku: Optional[str] = None
    mrp: Optional[Decimal] = None
    selling_price: Decimal
    stock: int

    @field_validator("stock")
    @classmethod
    def validate_stock_non_negative(cls, v: int) -> int:
        if v < 0:
            raise ValueError("Stock must be a non-negative integer (>= 0)")
        return v


class ProductVariantResponse(BaseModel):
    id: int
    product_id: int
    size: str
    colour: Optional[str] = None
    sku: Optional[str] = None
    mrp: Optional[Decimal] = None
    selling_price: Decimal
    stock: int

    model_config = ConfigDict(from_attributes=True)


class ProductCreate(BaseModel):
    name: str
    slug: str
    description: Optional[str] = None
    fabric: Optional[str] = None
    care: Optional[str] = None
    category: Optional[str] = None
    is_bestseller: bool = False
    is_active: bool = True
    variants: List[ProductVariantCreate] = []


class ProductResponse(BaseModel):
    id: int
    name: str
    slug: str
    description: Optional[str] = None
    fabric: Optional[str] = None
    care: Optional[str] = None
    category: Optional[str] = None
    is_bestseller: bool
    is_active: bool
    created_at: datetime
    updated_at: datetime
    variants: List[ProductVariantResponse] = []

    model_config = ConfigDict(from_attributes=True)
