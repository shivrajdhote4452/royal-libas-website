from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import admin

app = FastAPI(
    title="Royal Libas by Tanya API",
    description="Backend API for Royal Libas custom shop (Phase 1: Database & Admin Auth)",
    version="0.2.0",
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


@app.get("/health")
def health_check():
    """Health check endpoint to verify backend status."""
    return {"status": "ok"}


@app.get("/")
def root():
    """Root endpoint for Royal Libas API."""
    return {
        "app": "Royal Libas by Tanya API",
        "phase": 1,
        "message": "Database and Admin Auth operational. Health check at /health",
    }
