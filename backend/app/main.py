from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import admin, products, collections, cart, orders, payments, coupons

app = FastAPI(
    title="Royal Libas by Tanya API",
    description="Backend API for Royal Libas custom shop (Phase 4: Cart, Checkout & Payments)",
    version="0.4.0",
)

# Enable CORS for frontend integration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(admin.router)
app.include_router(products.router)
app.include_router(collections.router)
app.include_router(cart.router)
app.include_router(orders.router)
app.include_router(payments.router)
app.include_router(coupons.router)


@app.get("/health")
def health_check():
    """Health check endpoint to verify backend status."""
    return {"status": "ok"}


@app.get("/")
def root():
    """Root endpoint for Royal Libas API."""
    return {
        "app": "Royal Libas by Tanya API",
        "phase": 4,
        "message": "Cart, Checkout, Razorpay & COD orders operational. Health check at /health",
    }
