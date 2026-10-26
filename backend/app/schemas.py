from datetime import datetime
from decimal import Decimal
from typing import List, Optional
from pydantic import BaseModel, ConfigDict, field_validator


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
# Product Variant Schemas
# ==========================================

class ProductVariantBase(BaseModel):
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


class ProductVariantCreate(ProductVariantBase):
    pass


class ProductVariantUpdate(BaseModel):
    size: Optional[str] = None
    colour: Optional[str] = None
    sku: Optional[str] = None
    mrp: Optional[Decimal] = None
    selling_price: Optional[Decimal] = None
    stock: Optional[int] = None

    @field_validator("stock")
    @classmethod
    def validate_stock_non_negative(cls, v: Optional[int]) -> Optional[int]:
        if v is not None and v < 0:
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
    is_available: bool

    model_config = ConfigDict(from_attributes=True)


# ==========================================
# Product Image Schemas
# ==========================================

class ProductImageCreate(BaseModel):
    url: str
    sort_order: int = 0
    alt_text: Optional[str] = None


class ProductImageResponse(BaseModel):
    id: int
    url: str
    sort_order: int
    alt_text: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


# ==========================================
# Collection Schemas
# ==========================================

class CollectionBase(BaseModel):
    name: str
    slug: str
    description: Optional[str] = None


class CollectionCreate(CollectionBase):
    pass


class CollectionResponse(CollectionBase):
    id: int
    product_count: int = 0

    model_config = ConfigDict(from_attributes=True)


# ==========================================
# Product Schemas
# ==========================================

class ProductCreate(BaseModel):
    name: str
    slug: str
    description: Optional[str] = None
    fabric: Optional[str] = None
    care: Optional[str] = None
    size_chart: Optional[str] = None
    category: Optional[str] = None
    is_bestseller: bool = False
    is_active: bool = True
    collection_ids: Optional[List[int]] = []
    variants: Optional[List[ProductVariantCreate]] = []
    images: Optional[List[ProductImageCreate]] = []


class ProductUpdate(BaseModel):
    name: Optional[str] = None
    slug: Optional[str] = None
    description: Optional[str] = None
    fabric: Optional[str] = None
    care: Optional[str] = None
    size_chart: Optional[str] = None
    category: Optional[str] = None
    is_bestseller: Optional[bool] = None
    is_active: Optional[bool] = None
    collection_ids: Optional[List[int]] = None


class ProductListResponse(BaseModel):
    id: int
    name: str
    slug: str
    description: Optional[str] = None
    fabric: Optional[str] = None
    category: Optional[str] = None
    is_bestseller: bool
    is_active: bool
    min_price: Optional[Decimal] = None
    max_price: Optional[Decimal] = None
    total_stock: int
    badges: List[str] = []
    primary_image: Optional[str] = None
    collections: List[str] = []
    variants: List[ProductVariantResponse] = []

    model_config = ConfigDict(from_attributes=True)


class ProductDetailResponse(BaseModel):
    id: int
    name: str
    slug: str
    description: Optional[str] = None
    fabric: Optional[str] = None
    care: Optional[str] = None
    size_chart: Optional[str] = None
    category: Optional[str] = None
    is_bestseller: bool
    is_active: bool
    total_stock: int
    badges: List[str] = []
    images: List[ProductImageResponse] = []
    variants: List[ProductVariantResponse] = []
    collections: List[str] = []
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
