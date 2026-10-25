import os
from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from .config import settings
from .database import engine, Base, SessionLocal
from . import models, security
from .models import User
from .seed_data import seed_database
from .routers import auth, outpass, parent, gate, attendance, mess, complaints, fees, notifications, admin

# Create tables
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="Smart Hostel & Mess Management System with Fallback RC Routing, Digital Consent, Anti-Replay QR Gate Verification, Exception-Based Attendance, and Concurrency-Safe Mess Tokens."
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Startup event to auto-seed if needed
@app.on_event("startup")
def startup_event():
    settings.validate_security()
    db = SessionLocal()
    try:
        user_count = db.query(User).count()
        if user_count == 0:
            print("[STARTUP] No users found. Automatically seeding database with realistic hackathon demo data...")
            seed_database()
    except Exception as e:
        print(f"[STARTUP ERROR] {e}")
        seed_database()
    finally:
        db.close()

# Mount API Routers
app.include_router(auth.router, prefix=settings.API_V1_STR)
app.include_router(outpass.router, prefix=settings.API_V1_STR)
app.include_router(parent.router, prefix=settings.API_V1_STR)
app.include_router(gate.router, prefix=settings.API_V1_STR)
app.include_router(attendance.router, prefix=settings.API_V1_STR)
app.include_router(mess.router, prefix=settings.API_V1_STR)
app.include_router(complaints.router, prefix=settings.API_V1_STR)
app.include_router(fees.router, prefix=settings.API_V1_STR)
app.include_router(notifications.router, prefix=settings.API_V1_STR)
app.include_router(admin.router, prefix=settings.API_V1_STR)

# Static files path
BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
FRONTEND_DIR = os.path.join(BASE_DIR, "frontend")

if os.path.exists(FRONTEND_DIR):
    app.mount("/static", StaticFiles(directory=FRONTEND_DIR), name="static")

@app.get("/")
def serve_index():
    index_path = os.path.join(FRONTEND_DIR, "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    return {"message": "HostelIQ API is running. Visit /docs for Swagger UI."}

@app.post("/api/v1/system/reseed")
def reset_and_reseed_database(
    current_user: User = Depends(security.require_roles([models.UserRole.ADMIN]))
):
    """Resets demo data only when explicitly enabled by the deployment."""
    if not settings.ALLOW_RESEED:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Reseeding is disabled")
    seed_database()
    return {"message": "Database successfully reseeded with fresh demo ecosystem."}
