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
    """Admin users table for shop management. One or two rows only. No public registration."""
    __tablename__ = "admins"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class Product(Base):
    """Core product details. Stock and price intentionally live on product_variants."""
    __tablename__ = "products"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    slug = Column(String(255), unique=True, index=True, nullable=False)
    description = Column(Text, nullable=True)
    fabric = Column(String(100), nullable=True)
    care = Column(String(255), nullable=True)
    size_chart = Column(Text, nullable=True)  # JSON-encoded structured data (measurements in cm)
    category = Column(String(100), nullable=True)
    is_bestseller = Column(Boolean, default=False, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    # Relationships
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


class ProductImage(Base):
    """Cloudinary image URLs and sorting order for product gallery."""
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

    # Relationships
    product = relationship("Product", back_populates="images")


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
    status = Column(String(50), default="PENDING", nullable=False)  # PENDING, CONFIRMED, SHIPPED, DELIVERED, CANCELLED
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
