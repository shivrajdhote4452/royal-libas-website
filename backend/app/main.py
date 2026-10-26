from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(
    title="Royal Libas by Tanya API",
    description="Backend API for Royal Libas custom shop (Phase 0 Scaffold)",
    version="0.1.0",
)

# Enable CORS for local development and future frontend deployment
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health_check():
    """Health check endpoint to verify backend status."""
    return {"status": "ok"}


@app.get("/")
def root():
    """Root endpoint for Royal Libas API."""
    return {
        "app": "Royal Libas by Tanya API",
        "phase": 0,
        "message": "Scaffold ready. Health check available at /health",
    }
