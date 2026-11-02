from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from .. import models, schemas, security
from ..database import get_db
from ..config import settings

router = APIRouter(prefix="/auth", tags=["Authentication"])

def _token_response(user: models.User) -> dict:
    access_token = security.create_access_token(
        data={"sub": str(user.id), "role": user.role, "name": user.full_name, "email": user.email}
    )
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "role": user.role,
        "user_id": user.id,
        "full_name": user.full_name,
        "email": user.email
    }

@router.post("/login", response_model=schemas.Token)
def login(creds: schemas.LoginRequest, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.email == creds.email.strip().lower()).first()
    if not user or not security.verify_password(creds.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if not user.is_active:
        raise HTTPException(status_code=403, detail="User account is deactivated")

    return _token_response(user)

@router.post("/token", response_model=schemas.Token)
def oauth2_token(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db)
):
    """OAuth2 password-flow endpoint used by Swagger's Authorize button."""
    user = db.query(models.User).filter(
        models.User.email == form_data.username.strip().lower()
    ).first()
    if not user or not security.verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if not user.is_active:
        raise HTTPException(status_code=403, detail="User account is deactivated")
    return _token_response(user)

@router.post("/demo-switch/{role}", response_model=schemas.Token)
def demo_role_quick_switch(role: str, db: Session = Depends(get_db)):
    """
    Hackathon Demo Feature: Allows instant one-click login/switching between different demo personas.
    """
    if not settings.DEMO_MODE:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Demo switching is disabled")

    normalized_role = role.upper()
    user = db.query(models.User).filter(models.User.role == normalized_role, models.User.is_active == True).first()
    if not user:
        raise HTTPException(status_code=404, detail=f"No active demo user found with role {normalized_role}")

    return _token_response(user)

@router.get("/me", response_model=schemas.UserResponse)
def get_current_user_profile(current_user: models.User = Depends(security.get_current_user)):
    return current_user

@router.get("/student-profile", response_model=schemas.StudentProfileResponse)
def get_student_profile(
    current_user: models.User = Depends(security.require_roles([models.UserRole.STUDENT])),
    db: Session = Depends(get_db)
):
    student = current_user.student_profile
    if not student:
        raise HTTPException(status_code=404, detail="Student profile not found for current user")
    
    parent_user = student.parent.user if student.parent else None
    rc_user = student.assigned_rc
    rc_profile = db.query(models.RCProfile).filter(models.RCProfile.user_id == rc_user.id).first() if rc_user else None

    return {
        "id": student.id,
        "user_id": current_user.id,
        "full_name": current_user.full_name,
        "email": current_user.email,
        "reg_number": student.reg_number,
        "hostel_name": student.hostel.name if student.hostel else "Main Hostel",
        "block_name": student.block.block_name if student.block else "Block A",
        "room_number": student.room.room_number if student.room else "101",
        "course": student.course,
        "batch": student.batch,
        "photo_url": student.photo_url,
        "is_outside": student.is_outside,
        "parent_name": parent_user.full_name if parent_user else "N/A",
        "parent_phone": parent_user.phone if parent_user else "N/A",
        "assigned_rc_name": rc_user.full_name if rc_user else "Unassigned",
        "assigned_rc_available": rc_profile.is_available if rc_profile else True
    }
