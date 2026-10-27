from fastapi import FastAPI, Request, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from app.config import FRONTEND_URL
from app.database import get_db
from app.models import Order
from app.routers import admin, products, collections, cart, orders, payments, coupons
from app.services import shiprocket

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


# ==========================================
# Shiprocket Status Push Webhook
# NOTE: Do NOT register the webhook URL in Shiprocket yet — backend public deployment is deferred, so registration happens after deploy.
# ==========================================
@app.post("/shiprocket/webhook")
async def shiprocket_webhook(request: Request, db: Session = Depends(get_db)):
    """Webhook for Shiprocket shipment status updates.
    
    SAFETY RULE:
    When a webhook arrives, RE-FETCH tracking live from Shiprocket once via track(awb_code)
    and only then update the order. NEVER trust the webhook payload alone.
    
    NOTE: Do NOT register the webhook URL in Shiprocket yet — backend public deployment
    is deferred, so registration happens after deploy.
    """
    try:
        body = await request.json()
    except Exception:
        body = {}

    awb = str(body.get("awb") or body.get("awb_code") or "").strip()
    order_id = str(body.get("order_id") or "").strip()
    shipment_id = str(body.get("shipment_id") or "").strip()

    # Find the matching order
    order = None
    if awb:
        order = db.query(Order).filter(Order.awb_code == awb).first()
    if not order and order_id:
        order = db.query(Order).filter(Order.order_code == order_id).first()
    if not order and shipment_id:
        order = db.query(Order).filter(Order.shipment_id == shipment_id).first()

    if not order or not order.awb_code:
        # Acknowledge webhook receipt safely
        return {"status": "ignored", "reason": "Order or active AWB not found."}

    # CRITICAL SAFETY RULE:
    # RE-FETCH tracking from Shiprocket once live — never trust payload alone!
    try:
        live_track = shiprocket.track(order.awb_code)
        curr_status = (live_track.get("current_status") or "").upper().strip()

        if "DELIVERED" in curr_status:
            order.status = "DELIVERED"
        elif any(s in curr_status for s in ("IN TRANSIT", "OUT FOR DELIVERY", "SHIPPED", "PICKED UP")):
            order.status = "SHIPPED"

        db.commit()
        return {"status": "success", "order_status": order.status, "verified_live": True}
    except Exception as exc:
        return {"status": "error", "detail": f"Failed to verify live tracking: {str(exc)}"}


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
