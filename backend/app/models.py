"""SQLAlchemy database models for Royal Libas.
Reference A: Database Schema Specification.
"""

from sqlalchemy import (
    Column,
    Integer,
    String,
    Text,
    Boolean,
    Numeric,
    DateTime,
    ForeignKey,
    CheckConstraint,
    UniqueConstraint,
    Table,
    func,
)
from sqlalchemy.orm import relationship
from app.database import Base

# Association table for Products and Collections (Many-to-Many)
product_collections = Table(
    "product_collections",
    Base.metadata,
    Column(
        "product_id",
        Integer,
        ForeignKey("products.id", ondelete="CASCADE"),
        primary_key=True,
    ),
    Column(
        "collection_id",
        Integer,
        ForeignKey("collections.id", ondelete="CASCADE"),
        primary_key=True,
    ),
)


class Admin(Base):
    """Admin users table for shop management. Supports Role-Based Access Control (RBAC)."""
    __tablename__ = "admins"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    name = Column(String(255), nullable=True)
    role = Column(String(50), default="OWNER", nullable=False)  # OWNER, STORE_MANAGER, FULFILLMENT_STAFF
    password_hash = Column(String(255), nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class SizeChart(Base):
    """Reusable size charts with approved boutique measurements (in cm / inches)."""
    __tablename__ = "size_charts"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    category = Column(String(100), nullable=True, index=True)
    measurements = Column(Text, nullable=False)  # JSON array: [{"size": "S", "bust": 36, "waist": 32, "hip": 38, "length": 44}, ...]
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


class Product(Base):
    """Core product details. Stock and price intentionally live on product_variants."""
    __tablename__ = "products"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    slug = Column(String(255), unique=True, index=True, nullable=False)
    description = Column(Text, nullable=True)
    fabric = Column(String(100), nullable=True)
    care = Column(String(255), nullable=True)
    fit = Column(String(100), nullable=True)  # Slim Fit, Regular Fit, Relaxed, Tailored
    size_chart = Column(Text, nullable=True)  # JSON-encoded structured data (measurements in cm)
    size_chart_id = Column(Integer, ForeignKey("size_charts.id", ondelete="SET NULL"), nullable=True)
    category = Column(String(100), nullable=True, index=True)
    subcategory = Column(String(100), nullable=True, index=True)
    status = Column(String(50), default="DRAFT", nullable=False)  # DRAFT, PUBLISHED, ARCHIVED
    is_bestseller = Column(Boolean, default=False, nullable=False)
    is_active = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    # Relationships
    size_chart_rel = relationship("SizeChart", foreign_keys=[size_chart_id])
    variants = relationship(
        "ProductVariant",
        back_populates="product",
        cascade="all, delete-orphan",
        order_by="ProductVariant.id",
    )
    images = relationship(
        "ProductImage",
        back_populates="product",
        cascade="all, delete-orphan",
        order_by="ProductImage.sort_order",
    )
    collections = relationship(
        "Collection",
        secondary=product_collections,
        back_populates="products",
    )


class ProductVariant(Base):
    """Variants for size, colour, stock, and pricing. Stock must never be negative."""
    __tablename__ = "product_variants"

    id = Column(Integer, primary_key=True, index=True)
    product_id = Column(
        Integer,
        ForeignKey("products.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    size = Column(String(20), nullable=False)  # e.g., 'S', 'M', 'L', 'XL'
    colour = Column(String(50), nullable=True)
    sku = Column(String(100), unique=True, nullable=True)
    mrp = Column(Numeric(10, 2), nullable=True)
    selling_price = Column(Numeric(10, 2), nullable=False)
    stock = Column(Integer, default=0, nullable=False)

    __table_args__ = (
        CheckConstraint("stock >= 0", name="check_variant_stock_non_negative"),
        UniqueConstraint("product_id", "size", "colour", name="uq_product_variant_size_colour"),
    )

    # Relationships
    product = relationship("Product", back_populates="variants")
    stock_adjustments = relationship(
        "StockAdjustment",
        back_populates="variant",
        cascade="all, delete-orphan",
        order_by="StockAdjustment.created_at.desc()",
    )


class StockAdjustment(Base):
    """Recorded audit history of inventory stock changes."""
    __tablename__ = "stock_adjustments"

    id = Column(Integer, primary_key=True, index=True)
    variant_id = Column(
        Integer,
        ForeignKey("product_variants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    previous_stock = Column(Integer, nullable=False)
    new_stock = Column(Integer, nullable=False)
    change_amount = Column(Integer, nullable=False)
    reason = Column(String(50), nullable=False)  # RESTOCK, CORRECTION, DAMAGED, RETURN, ORDER_PLACED, ORDER_CANCELLED
    note = Column(Text, nullable=True)
    actor_email = Column(String(255), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    # Relationships
    variant = relationship("ProductVariant", back_populates="stock_adjustments")


class ProductImage(Base):
    """Cloudinary / Persistent image & video URLs and sorting order for product gallery."""
    __tablename__ = "product_images"

    id = Column(Integer, primary_key=True, index=True)
    product_id = Column(
        Integer,
        ForeignKey("products.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    url = Column(String(500), nullable=False)
    sort_order = Column(Integer, default=0, nullable=False)
    alt_text = Column(String(255), nullable=True)
    resource_type = Column(String(20), default="image", nullable=False)  # 'image' or 'video'
    public_id = Column(String(255), nullable=True)
    width = Column(Integer, nullable=True)
    height = Column(Integer, nullable=True)
    duration = Column(Numeric(10, 2), nullable=True)  # Video duration in seconds
    media_asset_id = Column(
        Integer,
        ForeignKey("media_assets.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # Relationships
    product = relationship("Product", back_populates="images")
    media_asset = relationship("MediaAsset")


class Collection(Base):
    """Curated groupings (e.g., Festive Edit, Bestsellers, Everyday Cotton)."""
    __tablename__ = "collections"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    slug = Column(String(255), unique=True, index=True, nullable=False)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    # Relationships
    products = relationship(
        "Product",
        secondary=product_collections,
        back_populates="collections",
    )


class Order(Base):
    """Orders placed by guest buyers with server-calculated totals."""
    __tablename__ = "orders"

    id = Column(Integer, primary_key=True, index=True)
    order_code = Column(String(50), unique=True, index=True, nullable=False)
    customer_name = Column(String(255), nullable=False)
    phone = Column(String(20), index=True, nullable=False)
    status = Column(String(50), default="PENDING", nullable=False)  # PENDING, PLACED, CONFIRMED, PACKED, SHIPPED, DELIVERED, CANCELLED
    payment_method = Column(String(20), nullable=False)  # PREPAID, COD
    payment_status = Column(String(20), default="PENDING", nullable=False)  # PENDING, PAID, FAILED, REFUNDED
    razorpay_order_id = Column(String(100), nullable=True)  # Kept for historical orders
    cashfree_order_id = Column(String(100), nullable=True)
    subtotal = Column(Numeric(10, 2), nullable=False)
    shipping_charge = Column(Numeric(10, 2), default=0.00, nullable=False)
    discount = Column(Numeric(10, 2), default=0.00, nullable=False)
    total = Column(Numeric(10, 2), nullable=False)
    courier_name = Column(String(100), nullable=True)
    tracking_url = Column(String(500), nullable=True)
    shiprocket_order_id = Column(String(100), nullable=True)
    shipment_id = Column(String(100), nullable=True)
    awb_code = Column(String(100), nullable=True)
    label_url = Column(String(500), nullable=True)
    manifest_url = Column(String(500), nullable=True)
    pickup_status = Column(String(50), nullable=True)
    order_token = Column(String(64), unique=True, index=True, nullable=True)  # Secure unguessable access token
    reservation_expires_at = Column(DateTime(timezone=True), nullable=True)  # Prepaid reservation expiry
    admin_notes = Column(Text, nullable=True)  # Audit notes for payment/cancellation reconciliation
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    # Relationships
    items = relationship(
        "OrderItem",
        back_populates="order",
        cascade="all, delete-orphan",
    )
    address = relationship(
        "Address",
        back_populates="order",
        uselist=False,
        cascade="all, delete-orphan",
    )
    returns = relationship(
        "ReturnRequest",
        back_populates="order",
        cascade="all, delete-orphan",
        order_by="ReturnRequest.created_at.desc()",
    )


class OrderItem(Base):
    """Line items with immutable snapshots of price, name, size and colour at order time."""
    __tablename__ = "order_items"

    id = Column(Integer, primary_key=True, index=True)
    order_id = Column(
        Integer,
        ForeignKey("orders.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    variant_id = Column(
        Integer,
        ForeignKey("product_variants.id", ondelete="SET NULL"),
        nullable=True,
    )
    product_name_snapshot = Column(String(255), nullable=False)
    size_snapshot = Column(String(20), nullable=False)
    colour_snapshot = Column(String(50), nullable=True)
    quantity = Column(Integer, nullable=False)
    unit_price_snapshot = Column(Numeric(10, 2), nullable=False)
    line_total = Column(Numeric(10, 2), nullable=False)

    # Relationships
    order = relationship("Order", back_populates="items")
    variant = relationship("ProductVariant")


class Address(Base):
    """Shipping address captured at checkout."""
    __tablename__ = "addresses"

    id = Column(Integer, primary_key=True, index=True)
    order_id = Column(
        Integer,
        ForeignKey("orders.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
        index=True,
    )
    name = Column(String(255), nullable=False)
    phone = Column(String(20), nullable=False)
    pincode = Column(String(10), nullable=False)
    line1 = Column(String(255), nullable=False)
    line2 = Column(String(255), nullable=True)
    city = Column(String(100), nullable=False)
    state = Column(String(100), nullable=False)

    # Relationships
    order = relationship("Order", back_populates="address")


class Coupon(Base):
    """Promotional coupon codes."""
    __tablename__ = "coupons"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String(50), unique=True, index=True, nullable=False)
    type = Column(String(20), nullable=False)  # FLAT / PERCENT
    value = Column(Numeric(10, 2), nullable=False)
    min_order_value = Column(Numeric(10, 2), default=0.00, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class ReturnRequest(Base):
    """Customer return, exchange, and refund requests."""
    __tablename__ = "return_requests"

    id = Column(Integer, primary_key=True, index=True)
    return_code = Column(String(50), unique=True, index=True, nullable=False)  # RET-2026-XXXX
    order_id = Column(Integer, ForeignKey("orders.id", ondelete="CASCADE"), nullable=False, index=True)
    order_item_id = Column(Integer, ForeignKey("order_items.id", ondelete="SET NULL"), nullable=True)
    request_type = Column(String(20), default="RETURN", nullable=False)  # RETURN, EXCHANGE
    reason = Column(String(100), nullable=False)  # SIZE_FIT, DEFECTIVE, COLOR_MISMATCH, WRONG_ITEM, OTHER
    customer_comment = Column(Text, nullable=True)
    requested_resolution = Column(String(50), default="REFUND", nullable=False)  # REFUND, STORE_CREDIT, EXCHANGE_SIZE
    exchange_size = Column(String(20), nullable=True)
    status = Column(String(50), default="REQUESTED", nullable=False)  # REQUESTED, APPROVED, REJECTED, PICKUP_SCHEDULED, RECEIVED, RESOLVED, CANCELLED
    pickup_awb = Column(String(100), nullable=True)
    pickup_courier = Column(String(100), nullable=True)
    refund_amount = Column(Numeric(10, 2), nullable=True)
    refund_status = Column(String(50), default="PENDING", nullable=True)  # PENDING, PROCESSED, FAILED
    refund_reference = Column(String(100), nullable=True)
    staff_notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    # Relationships
    order = relationship("Order", back_populates="returns")
    order_item = relationship("OrderItem")


class StoreSetting(Base):
    """Persistent store settings for shipping thresholds, fees, homepage CMS, and brand contacts."""
    __tablename__ = "store_settings"

    id = Column(Integer, primary_key=True, index=True)
    standard_cod_free_threshold = Column(Numeric(10, 2), default=1500.00, nullable=False)
    standard_shipping_fee = Column(Numeric(10, 2), default=99.00, nullable=False)
    express_shipping_fee = Column(Numeric(10, 2), default=99.00, nullable=False)
    cod_enabled = Column(Boolean, default=False, nullable=False)
    online_payment_enabled = Column(Boolean, default=True, nullable=False)
    announcement_text = Column(
        String(500),
        default="COMPLIMENTARY SHIPPING ON ALL PREPAID ORDERS | FREE COD ABOVE ₹1,500",
        nullable=False,
    )
    announcement_enabled = Column(Boolean, default=True, nullable=False)
    hero_title = Column(String(255), default="Timeless Elegance, Handcrafted Regality", nullable=False)
    hero_subtitle = Column(Text, default="Pure handloom chanderi, tissue silks, and festive velvets made for the discerning connoisseur.", nullable=False)
    hero_cta_text = Column(String(100), default="Explore The Collection", nullable=False)
    hero_cta_link = Column(String(255), default="/shop", nullable=False)
    hero_image_url = Column(String(500), nullable=True)
    category_two_pieces_image = Column(String(500), nullable=True)
    category_suit_set_image = Column(String(500), nullable=True)
    category_heavy_dress_image = Column(String(500), nullable=True)
    festive_banner_image = Column(String(500), nullable=True)
    poster_occasion_image = Column(String(500), nullable=True)
    poster_everyday_image = Column(String(500), nullable=True)
    poster_story_image = Column(String(500), nullable=True)
    whatsapp_number = Column(String(50), default="+91 98112 23344", nullable=False)
    support_email = Column(String(255), default="care@royallibas.com", nullable=False)
    support_phone = Column(String(50), default="+91 98112 23344", nullable=False)
    instagram_handle = Column(String(100), default="@royal_libas_by_tanya", nullable=False)
    shipping_policy_content = Column(Text, nullable=True)
    return_policy_content = Column(Text, nullable=True)
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


class ContactInquiry(Base):
    """Customer concierge and styling inquiries."""
    __tablename__ = "contact_inquiries"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    email = Column(String(255), nullable=False)
    phone = Column(String(50), nullable=True)
    subject = Column(String(255), nullable=True)
    message = Column(Text, nullable=False)
    status = Column(String(50), default="NEW", nullable=False)  # NEW, RESPONDED, ARCHIVED
    admin_reply = Column(Text, nullable=True)
    responded_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class NewsletterSubscriber(Base):
    """Newsletter email subscribers."""
    __tablename__ = "newsletter_subscribers"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class ActivityLog(Base):
    """Audit log of important admin actions."""
    __tablename__ = "activity_logs"

    id = Column(Integer, primary_key=True, index=True)
    actor_email = Column(String(255), nullable=False)
    actor_role = Column(String(50), nullable=True)
    action = Column(String(100), nullable=False)  # STOCK_ADJUST, ORDER_UPDATE, PRODUCT_UPDATE, PRODUCT_CREATE, REFUND_RECORD, SETTING_UPDATE, etc.
    target_type = Column(String(50), nullable=False)  # order, product, variant, inventory, settings, return, media
    target_id = Column(String(100), nullable=True)
    details = Column(Text, nullable=True)  # JSON or text description with before/after
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class MediaFolder(Base):
    """Media folder hierarchy for organizing boutique photos and videos."""
    __tablename__ = "media_folders"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    path = Column(String(500), unique=True, index=True, nullable=False)
    parent_path = Column(String(500), index=True, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


class MediaAsset(Base):
    """Persistent media asset storage metadata for photos and videos."""
    __tablename__ = "media_assets"

    id = Column(Integer, primary_key=True, index=True)
    filename = Column(String(255), nullable=False)
    display_name = Column(String(255), nullable=True)
    public_id = Column(String(255), nullable=True, index=True)
    cloudinary_asset_id = Column(String(100), nullable=True, index=True)
    cloud_name = Column(String(100), nullable=True, index=True)
    delivery_type = Column(String(50), default="upload", nullable=True)
    content_hash = Column(String(64), nullable=True, index=True)
    relative_source_path = Column(String(500), nullable=True)
    url = Column(String(500), nullable=False)
    secure_url = Column(String(500), nullable=True)
    resource_type = Column(String(20), default="image", nullable=False)  # 'image' or 'video'
    format = Column(String(50), nullable=True)
    width = Column(Integer, nullable=True)
    height = Column(Integer, nullable=True)
    duration = Column(Numeric(10, 2), nullable=True)  # Video duration in seconds
    file_size = Column(Integer, nullable=False, default=0)  # bytes
    mime_type = Column(String(100), nullable=False)
    alt_text = Column(String(255), nullable=True)
    folder = Column(String(500), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
