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
    name: Optional[str] = None
    role: str = 'OWNER'
    is_active: bool = True
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
    resource_type: Optional[str] = "image"
    public_id: Optional[str] = None
    width: Optional[int] = None
    height: Optional[int] = None
    duration: Optional[float] = None


class ProductImageResponse(BaseModel):
    id: int
    url: str
    sort_order: int
    alt_text: Optional[str] = None
    resource_type: str = "image"
    public_id: Optional[str] = None
    width: Optional[int] = None
    height: Optional[int] = None
    duration: Optional[float] = None

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
    fit: Optional[str] = None
    size_chart: Optional[str] = None
    size_chart_id: Optional[int] = None
    category: Optional[str] = None
    subcategory: Optional[str] = None
    status: Optional[str] = 'DRAFT'
    is_bestseller: bool = False
    is_active: bool = False
    collection_ids: Optional[List[int]] = []
    variants: Optional[List[ProductVariantCreate]] = []
    images: Optional[List[ProductImageCreate]] = []


class ProductUpdate(BaseModel):
    name: Optional[str] = None
    slug: Optional[str] = None
    description: Optional[str] = None
    fabric: Optional[str] = None
    care: Optional[str] = None
    fit: Optional[str] = None
    size_chart: Optional[str] = None
    size_chart_id: Optional[int] = None
    category: Optional[str] = None
    subcategory: Optional[str] = None
    status: Optional[str] = None
    is_bestseller: Optional[bool] = None
    is_active: Optional[bool] = None
    collection_ids: Optional[List[int]] = None
    images: Optional[List[ProductImageCreate]] = None


class ProductListResponse(BaseModel):
    id: int
    name: str
    slug: str
    description: Optional[str] = None
    fabric: Optional[str] = None
    category: Optional[str] = None
    subcategory: Optional[str] = None
    is_bestseller: bool
    is_active: bool
    min_price: Optional[Decimal] = None
    max_price: Optional[Decimal] = None
    total_stock: int
    badges: List[str] = []
    primary_image: Optional[str] = None
    images: List[ProductImageResponse] = []
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
    fit: Optional[str] = None
    size_chart: Optional[str] = None
    size_chart_id: Optional[int] = None
    category: Optional[str] = None
    subcategory: Optional[str] = None
    status: str = 'PUBLISHED'
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

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        clean = (v or "").strip()
        if len(clean) < 2:
            raise ValueError("Please enter a valid recipient name (at least 2 characters)")
        return clean

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, v: str) -> str:
        clean = "".join(filter(str.isdigit, v or ""))
        if len(clean) == 12 and clean.startswith("91"):
            clean = clean[2:]
        if len(clean) != 10:
            raise ValueError("Please enter a valid 10-digit Indian mobile number")
        return clean

    @field_validator("pincode")
    @classmethod
    def validate_pincode(cls, v: str) -> str:
        clean = "".join(filter(str.isdigit, v or ""))
        if len(clean) != 6:
            raise ValueError("Please enter a valid 6-digit Indian delivery pincode")
        return clean

    @field_validator("line1")
    @classmethod
    def validate_line1(cls, v: str) -> str:
        clean = (v or "").strip()
        if len(clean) < 5:
            raise ValueError("Please provide a complete street address (house/flat number and street)")
        return clean

    @field_validator("city")
    @classmethod
    def validate_city(cls, v: str) -> str:
        clean = (v or "").strip()
        if len(clean) < 2:
            raise ValueError("Please enter a valid city name")
        return clean

    @field_validator("state")
    @classmethod
    def validate_state(cls, v: str) -> str:
        clean = (v or "").strip()
        if len(clean) < 2:
            raise ValueError("Please enter a valid state")
        return clean


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
    shipping_method: Optional[str] = "STANDARD"  # STANDARD or EXPRESS
    address: AddressCreate
    items: List[OrderItemRequest]
    coupon_code: Optional[str] = None

    @field_validator("customer_name")
    @classmethod
    def validate_customer_name(cls, v: str) -> str:
        clean = (v or "").strip()
        if len(clean) < 2:
            raise ValueError("Please enter customer name (at least 2 characters)")
        return clean

    @field_validator("payment_method")
    @classmethod
    def validate_payment_method(cls, v: str) -> str:
        method = v.upper().strip()
        if method not in ("PREPAID", "COD"):
            raise ValueError("Payment method must be either 'PREPAID' or 'COD'")
        return method

    @field_validator("shipping_method")
    @classmethod
    def validate_shipping_method(cls, v: Optional[str]) -> str:
        if not v:
            return "STANDARD"
        method = v.upper().strip()
        if method not in ("STANDARD", "EXPRESS"):
            return "STANDARD"
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


class ExchangeSummaryResponse(BaseModel):
    id: int
    return_code: str
    order_code: str
    request_type: str = "EXCHANGE"
    reason: str
    requested_size: Optional[str] = None
    customer_notes: Optional[str] = None
    status: str = "REQUESTED"
    staff_notes: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class CustomerExchangeCreate(BaseModel):
    order_code: str
    phone: Optional[str] = None
    token: Optional[str] = None
    order_item_id: Optional[int] = None
    reason: str
    requested_size: Optional[str] = None
    customer_notes: Optional[str] = None


class CustomerExchangeResponse(BaseModel):
    success: bool = True
    return_code: str
    status: str = "REQUESTED"
    message: str = "Exchange requests are reviewed by our team. Conditions will be confirmed by the store."
    created_at: datetime


class OrderResponse(BaseModel):
    id: int
    order_code: str
    order_token: Optional[str] = None
    reservation_expires_at: Optional[datetime] = None
    admin_notes: Optional[str] = None
    customer_name: str
    phone: str
    status: str
    payment_method: str
    payment_status: str
    razorpay_order_id: Optional[str] = None
    cashfree_order_id: Optional[str] = None
    subtotal: Decimal
    shipping_charge: Decimal
    discount: Decimal
    total: Decimal
    courier_name: Optional[str] = None
    tracking_url: Optional[str] = None
    shiprocket_order_id: Optional[str] = None
    shipment_id: Optional[str] = None
    awb_code: Optional[str] = None
    label_url: Optional[str] = None
    manifest_url: Optional[str] = None
    pickup_status: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None
    items: List[OrderItemResponse] = []
    address: Optional[AddressResponse] = None
    exchanges: List[ExchangeSummaryResponse] = []

    model_config = ConfigDict(from_attributes=True)


class OrderConfirmationResponse(BaseModel):
    """Customer-facing order confirmation response with masked private details."""
    order_code: str
    order_token: Optional[str] = None
    customer_name_masked: str
    phone_masked: str
    status: str
    payment_method: str
    payment_status: str
    subtotal: Decimal
    shipping_charge: Decimal
    discount: Decimal
    total: Decimal
    courier_name: Optional[str] = None
    tracking_url: Optional[str] = None
    awb_code: Optional[str] = None
    created_at: datetime
    reservation_expires_at: Optional[datetime] = None
    items: List[OrderItemResponse] = []
    delivery_city: Optional[str] = None
    delivery_state: Optional[str] = None
    delivery_pincode: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class OrderCancelRequest(BaseModel):
    reason: Optional[str] = "Customer requested cancellation before payment"
    token: Optional[str] = None


class CashfreeSyncResponse(BaseModel):
    order_code: str
    payment_status: str
    order_status: str
    message: str
    is_paid: bool



# ==========================================
# Cashfree Payment Gateway Schemas
# ==========================================

class CashfreeCreateOrderRequest(BaseModel):
    order_code: str


class CashfreeCreateOrderResponse(BaseModel):
    payment_session_id: str
    order_id: str
    order_code: str
    amount: Decimal
    currency: str = "INR"
    mode: str


class CashfreeConfigResponse(BaseModel):
    configured: bool
    mode: str
    online_payment_enabled: bool = True


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


class CouponPublicResponse(BaseModel):
    id: int
    code: str
    type: str  # FLAT or PERCENT
    value: Decimal
    min_order_value: Decimal
    is_active: bool

    model_config = ConfigDict(from_attributes=True)


# ==========================================
# Phase 5: Tracking & Admin Management Schemas
# ==========================================

class OrderTrackResponse(BaseModel):
    order_code: str
    customer_name: str  # Masked, e.g. S**** D****
    phone_masked: Optional[str] = None  # e.g. ******4452
    status: str
    payment_method: str
    payment_status: str
    subtotal: Decimal
    shipping_charge: Decimal
    discount: Decimal
    total: Decimal
    courier_name: Optional[str] = None
    tracking_url: Optional[str] = None
    awb_code: Optional[str] = None
    delivery_city: Optional[str] = None
    delivery_state: Optional[str] = None
    delivery_pincode: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None
    items: List[OrderItemResponse] = []
    address: Optional[AddressResponse] = None
    exchanges: List[ExchangeSummaryResponse] = []

    model_config = ConfigDict(from_attributes=True)


class OrderStatusUpdateRequest(BaseModel):
    status: str
    courier_name: Optional[str] = None
    tracking_url: Optional[str] = None

    @field_validator("status")
    @classmethod
    def validate_status(cls, v: str) -> str:
        s = v.upper().strip()
        allowed = ("PENDING", "PLACED", "CONFIRMED", "PACKED", "SHIPPED", "DELIVERED", "CANCELLED")
        if s not in allowed:
            raise ValueError(f"Invalid order status. Allowed statuses: {', '.join(allowed)}")
        return s


# ==========================================
# Shiprocket Fulfillment Schemas
# ==========================================

class FulfillmentConfigResponse(BaseModel):
    is_configured: bool
    provider_name: str
    button_label: str
    disabled_reason: Optional[str] = None


class FulfillmentServiceabilityRequest(BaseModel):
    length: float
    breadth: float
    height: float
    weight: float


class FulfillmentCourierOption(BaseModel):
    courier_company_id: int
    courier_name: str
    rate: float
    etd: Optional[str] = None
    is_recommended: bool = False


class FulfillmentServiceabilityResponse(BaseModel):
    available_couriers: List[FulfillmentCourierOption]
    recommended_courier_id: Optional[int] = None


class FulfillmentShipRequest(BaseModel):
    length: float
    breadth: float
    height: float
    weight: float
    courier_id: Optional[int] = None



class AdminLowStockVariant(BaseModel):
    variant_id: int
    product_id: int
    product_name: str
    product_slug: str
    size: str
    colour: Optional[str] = None
    stock: int
    selling_price: Decimal

    model_config = ConfigDict(from_attributes=True)


class AdminDashboardResponse(BaseModel):
    orders_today: int
    to_pack_count: int
    total_orders: int
    pending_prepaid_count: int = 0
    failed_payment_count: int = 0
    awaiting_shipment_count: int = 0
    awaiting_pickup_count: int = 0
    low_stock_count: int = 0
    out_of_stock_count: int = 0
    today_revenue_prepaid: Decimal = Decimal('0.00')
    today_pending_cod: Decimal = Decimal('0.00')
    recent_orders: List[OrderResponse] = []
    low_stock_variants: List[AdminLowStockVariant] = []


class AdminCustomerResponse(BaseModel):
    phone: str
    name: str
    order_count: int
    total_spent: Decimal
    last_order_date: datetime


# ==========================================
# Store Settings, Contact & Newsletter Schemas
# ==========================================

class StoreSettingResponse(BaseModel):
    standard_cod_free_threshold: float
    free_shipping_threshold: Optional[float] = None
    standard_shipping_fee: float
    express_shipping_fee: float
    announcement_text: str
    announcement_enabled: bool = True
    hero_title: str = 'Timeless Elegance, Handcrafted Regality'
    hero_subtitle: str = 'Pure handloom chanderi, tissue silks, and festive velvets made for the discerning connoisseur.'
    hero_cta_text: str = 'Explore The Collection'
    hero_cta_link: str = '/shop'
    hero_image_url: Optional[str] = None
    category_two_pieces_image: Optional[str] = None
    category_suit_set_image: Optional[str] = None
    category_heavy_dress_image: Optional[str] = None
    festive_banner_image: Optional[str] = None
    poster_occasion_image: Optional[str] = None
    poster_everyday_image: Optional[str] = None
    poster_story_image: Optional[str] = None
    whatsapp_number: str
    support_email: str
    support_phone: str = '+91 98112 23344'
    instagram_handle: str
    shipping_policy_content: Optional[str] = None
    return_policy_content: Optional[str] = None
    cod_enabled: bool = False
    online_payment_enabled: bool = True

    model_config = ConfigDict(from_attributes=True)


class StoreSettingUpdate(BaseModel):
    standard_cod_free_threshold: Optional[float] = None
    free_shipping_threshold: Optional[float] = None
    standard_shipping_fee: Optional[float] = None
    express_shipping_fee: Optional[float] = None
    announcement_text: Optional[str] = None
    announcement_enabled: Optional[bool] = None
    hero_title: Optional[str] = None
    hero_subtitle: Optional[str] = None
    hero_cta_text: Optional[str] = None
    hero_cta_link: Optional[str] = None
    hero_image_url: Optional[str] = None
    category_two_pieces_image: Optional[str] = None
    category_suit_set_image: Optional[str] = None
    category_heavy_dress_image: Optional[str] = None
    festive_banner_image: Optional[str] = None
    poster_occasion_image: Optional[str] = None
    poster_everyday_image: Optional[str] = None
    poster_story_image: Optional[str] = None
    whatsapp_number: Optional[str] = None
    support_email: Optional[str] = None
    support_phone: Optional[str] = None
    instagram_handle: Optional[str] = None
    shipping_policy_content: Optional[str] = None
    return_policy_content: Optional[str] = None
    cod_enabled: Optional[bool] = None
    online_payment_enabled: Optional[bool] = None


class ContactInquiryCreate(BaseModel):
    name: str
    email: str
    message: str

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        clean = (v or "").strip()
        if len(clean) < 2:
            raise ValueError("Please provide your full name (at least 2 characters)")
        return clean

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: str) -> str:
        clean = (v or "").strip().lower()
        if "@" not in clean or "." not in clean:
            raise ValueError("Please provide a valid email address")
        return clean

    @field_validator("message")
    @classmethod
    def validate_message(cls, v: str) -> str:
        clean = (v or "").strip()
        if len(clean) < 5:
            raise ValueError("Please provide a message with at least 5 characters")
        return clean


class ContactInquiryResponse(BaseModel):
    status: str
    message: str


class NewsletterSubscribeCreate(BaseModel):
    email: str

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: str) -> str:
        clean = (v or "").strip().lower()
        if "@" not in clean or "." not in clean:
            raise ValueError("Please enter a valid email address")
        return clean


class NewsletterSubscribeResponse(BaseModel):
    status: str
    message: str



# ==========================================
# Upgraded Admin Schemas: Staff, Activity, Returns, Inventory, CMS
# ==========================================

class AdminUserResponse(BaseModel):
    id: int
    email: str
    name: Optional[str] = None
    role: str = "OWNER"
    is_active: bool = True
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class AdminCreate(BaseModel):
    email: str
    name: Optional[str] = None
    password: str
    role: str = "STORE_MANAGER"


class AdminRoleUpdate(BaseModel):
    role: Optional[str] = None
    is_active: Optional[bool] = None
    name: Optional[str] = None


class ActivityLogResponse(BaseModel):
    id: int
    actor_email: str
    actor_role: Optional[str] = None
    action: str
    target_type: str
    target_id: Optional[str] = None
    details: Optional[str] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class StockAdjustmentCreate(BaseModel):
    variant_id: int
    new_stock: int
    reason: str  # RESTOCK, CORRECTION, DAMAGED, RETURN, OTHER
    note: Optional[str] = None

    @field_validator("new_stock")
    @classmethod
    def validate_non_negative(cls, v: int) -> int:
        if v < 0:
            raise ValueError("New stock count must be >= 0")
        return v


class StockAdjustmentResponse(BaseModel):
    id: int
    variant_id: int
    product_name: str
    product_slug: str
    size: str
    colour: Optional[str] = None
    sku: Optional[str] = None
    previous_stock: int
    new_stock: int
    change_amount: int
    reason: str
    note: Optional[str] = None
    actor_email: Optional[str] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ReturnRequestCreate(BaseModel):
    order_id: int
    order_item_id: Optional[int] = None
    request_type: str = "RETURN"  # RETURN, EXCHANGE
    reason: str
    customer_comment: Optional[str] = None
    requested_resolution: str = "REFUND"  # REFUND, STORE_CREDIT, EXCHANGE_SIZE
    exchange_size: Optional[str] = None


class ReturnStatusUpdateRequest(BaseModel):
    status: str  # REQUESTED, APPROVED, REJECTED, PICKUP_SCHEDULED, RECEIVED, RESOLVED, CANCELLED
    pickup_awb: Optional[str] = None
    pickup_courier: Optional[str] = None
    refund_amount: Optional[Decimal] = None
    refund_status: Optional[str] = None  # PENDING, PROCESSED, FAILED
    refund_reference: Optional[str] = None
    staff_notes: Optional[str] = None


class ReturnRequestResponse(BaseModel):
    id: int
    return_code: str
    order_id: int
    order_code: str
    customer_name: str
    customer_phone: str
    item_name: Optional[str] = None
    item_size: Optional[str] = None
    item_colour: Optional[str] = None
    request_type: str
    reason: str
    customer_comment: Optional[str] = None
    requested_resolution: str
    exchange_size: Optional[str] = None
    status: str
    pickup_awb: Optional[str] = None
    pickup_courier: Optional[str] = None
    refund_amount: Optional[Decimal] = None
    refund_status: Optional[str] = None
    refund_reference: Optional[str] = None
    staff_notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class SizeChartCreate(BaseModel):
    name: str
    category: Optional[str] = None
    measurements: str  # JSON array string


class SizeChartUpdate(BaseModel):
    name: Optional[str] = None
    category: Optional[str] = None
    measurements: Optional[str] = None


class SizeChartResponse(BaseModel):
    id: int
    name: str
    category: Optional[str] = None
    measurements: str
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class MediaAssetProductUsage(BaseModel):
    id: int
    name: str
    slug: str


class MediaAssetResponse(BaseModel):
    id: int
    filename: str
    client_id: Optional[str] = None
    public_id: Optional[str] = None
    url: str
    secure_url: Optional[str] = None
    resource_type: str = "image"
    format: Optional[str] = None
    width: Optional[int] = None
    height: Optional[int] = None
    duration: Optional[float] = None
    file_size: int
    mime_type: str
    alt_text: Optional[str] = None
    folder: Optional[str] = None
    created_at: datetime
    used_in_products: Optional[List[MediaAssetProductUsage]] = []
    used_editorial: Optional[List[str]] = []

    model_config = ConfigDict(from_attributes=True)


class MediaUploadFailure(BaseModel):
    client_id: Optional[str] = None
    filename: str
    error: str


class MediaUploadBatchResponse(BaseModel):
    status: str = "success"
    uploaded: List[MediaAssetResponse] = []
    failed: List[MediaUploadFailure] = []
    total: int
    success_count: int
    failure_count: int


class ContactInquiryDetail(BaseModel):
    id: int
    name: str
    email: str
    phone: Optional[str] = None
    subject: Optional[str] = None
    message: str
    status: str
    admin_reply: Optional[str] = None
    responded_at: Optional[datetime] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ContactInquiryReply(BaseModel):
    reply_text: str
    status: Optional[str] = "RESPONDED"


class PaymentRecordResponse(BaseModel):
    order_id: int
    order_code: str
    customer_name: str
    customer_phone: str
    amount: Decimal
    payment_method: str
    payment_status: str
    cashfree_order_id: Optional[str] = None
    order_status: str
    created_at: datetime
    is_reconciled: bool = False


class PaymentCODCollectRequest(BaseModel):
    staff_notes: Optional[str] = None


class ShipmentRecordResponse(BaseModel):
    order_id: int
    order_code: str
    customer_name: str
    customer_phone: str
    delivery_pincode: Optional[str] = None
    delivery_city: Optional[str] = None
    status: str
    payment_method: str
    shiprocket_order_id: Optional[str] = None
    shipment_id: Optional[str] = None
    awb_code: Optional[str] = None
    courier_name: Optional[str] = None
    pickup_status: Optional[str] = None
    tracking_url: Optional[str] = None
    label_url: Optional[str] = None
    manifest_url: Optional[str] = None
    created_at: datetime


class ReportSummaryResponse(BaseModel):
    total_orders: int
    prepaid_count: int
    prepaid_revenue_paid: Decimal
    cod_count: int
    cod_revenue_pending: Decimal
    cod_revenue_collected: Decimal
    cancelled_count: int
    cancelled_amount: Decimal
    refunded_count: int
    refunded_amount: Decimal
    status_breakdown: dict
    payment_breakdown: dict
    top_products: list = []
    coupon_stats: list = []


class AdminDashboardV2Response(BaseModel):
    orders_today: int
    to_pack_count: int
    total_orders: int
    pending_prepaid_count: int
    failed_payment_count: int
    awaiting_shipment_count: int
    awaiting_pickup_count: int
    low_stock_count: int
    out_of_stock_count: int
    today_revenue_prepaid: Decimal
    today_pending_cod: Decimal
    recent_orders: List[OrderResponse] = []
    low_stock_variants: List[AdminLowStockVariant] = []
