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


# ==========================================
# Phase 4: Cart Validation Schemas
# ==========================================

class CartItemValidateRequest(BaseModel):
    variant_id: int
    quantity: int = 1


class CartValidateRequest(BaseModel):
    items: List[CartItemValidateRequest]


class CartValidatedItem(BaseModel):
    variant_id: int
    product_id: int
    product_name: str
    slug: str
    size: str
    colour: Optional[str] = None
    unit_price: Decimal
    quantity: int
    line_total: Decimal
    available_stock: int
    is_available: bool
    error: Optional[str] = None


class CartValidateResponse(BaseModel):
    items: List[CartValidatedItem]
    subtotal: Decimal
    is_valid: bool
    unavailable_lines: List[str] = []


# ==========================================
# Phase 4: Guest Checkout & Order Schemas
# ==========================================

class AddressCreate(BaseModel):
    name: str
    phone: str
    pincode: str
    line1: str
    line2: Optional[str] = None
    city: str
    state: str


class AddressResponse(BaseModel):
    id: int
    name: str
    phone: str
    pincode: str
    line1: str
    line2: Optional[str] = None
    city: str
    state: str

    model_config = ConfigDict(from_attributes=True)


class OrderItemRequest(BaseModel):
    variant_id: int
    quantity: int

    @field_validator("quantity")
    @classmethod
    def validate_positive_quantity(cls, v: int) -> int:
        if v <= 0:
            raise ValueError("Quantity must be greater than zero")
        return v


class OrderCreateRequest(BaseModel):
    customer_name: str
    phone: str
    payment_method: str  # PREPAID or COD
    address: AddressCreate
    items: List[OrderItemRequest]
    coupon_code: Optional[str] = None

    @field_validator("payment_method")
    @classmethod
    def validate_payment_method(cls, v: str) -> str:
        method = v.upper().strip()
        if method not in ("PREPAID", "COD"):
            raise ValueError("Payment method must be either 'PREPAID' or 'COD'")
        return method

    @field_validator("phone")
    @classmethod
    def validate_indian_phone(cls, v: str) -> str:
        clean = "".join(filter(str.isdigit, v))
        if len(clean) == 12 and clean.startswith("91"):
            clean = clean[2:]
        if len(clean) != 10:
            raise ValueError("Please enter a valid 10-digit Indian mobile number")
        return clean


class OrderItemResponse(BaseModel):
    id: int
    variant_id: Optional[int]
    product_name_snapshot: str
    size_snapshot: str
    colour_snapshot: Optional[str] = None
    quantity: int
    unit_price_snapshot: Decimal
    line_total: Decimal

    model_config = ConfigDict(from_attributes=True)


class OrderResponse(BaseModel):
    id: int
    order_code: str
    customer_name: str
    phone: str
    status: str
    payment_method: str
    payment_status: str
    razorpay_order_id: Optional[str] = None
    subtotal: Decimal
    shipping_charge: Decimal
    discount: Decimal
    total: Decimal
    created_at: datetime
    items: List[OrderItemResponse] = []
    address: Optional[AddressResponse] = None

    model_config = ConfigDict(from_attributes=True)


# ==========================================
# Phase 4: Razorpay Payment Schemas
# ==========================================

class RazorpayCreateOrderRequest(BaseModel):
    order_code: str


class RazorpayCreateOrderResponse(BaseModel):
    razorpay_order_id: str
    order_code: str
    amount: int  # in paise
    currency: str = "INR"
    key_id: str


# ==========================================
# Phase 4: Coupon Validation Schemas
# ==========================================

class CouponValidateRequest(BaseModel):
    code: str
    subtotal: Decimal


class CouponValidateResponse(BaseModel):
    valid: bool
    code: str
    discount: Decimal
    message: str

