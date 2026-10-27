from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import FRONTEND_URL
from app.routers import admin, products, collections, cart, orders, payments, coupons

app = FastAPI(
    title="Royal Libas by Tanya API",
    description="Backend API for Royal Libas custom shop (Launch & Honesty Hardened)",
    version="0.8.1",
)

# Secure CORS configuration: allow configured frontend domain and local dev servers
allowed_origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]
if FRONTEND_URL:
    for url in FRONTEND_URL.split(","):
        clean_url = url.strip()
        if clean_url and clean_url not in allowed_origins:
            allowed_origins.append(clean_url)

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
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
        "phase": 8,
        "status": "operational",
        "message": "Royal Libas API operational. Health check at /health",
    }
