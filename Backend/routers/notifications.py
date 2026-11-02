from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from .. import models, schemas, security
from ..database import get_db

router = APIRouter(prefix="/notifications", tags=["In-App Notification Center"])

@router.get("", response_model=List[schemas.NotificationResponse])
def get_user_notifications(
    limit: int = 30,
    current_user: models.User = Depends(security.get_current_user),
    db: Session = Depends(get_db)
):
    notifs = db.query(models.Notification).filter(
        models.Notification.user_id == current_user.id
    ).order_by(models.Notification.created_at.desc()).limit(limit).all()
    return notifs

@router.get("/unread-count")
def get_unread_count(
    current_user: models.User = Depends(security.get_current_user),
    db: Session = Depends(get_db)
):
    count = db.query(models.Notification).filter(
        models.Notification.user_id == current_user.id,
        models.Notification.is_read == False
    ).count()
    return {"unread_count": count}

@router.post("/mark-all-read")
def mark_notifications_read(
    current_user: models.User = Depends(security.get_current_user),
    db: Session = Depends(get_db)
):
    db.query(models.Notification).filter(
        models.Notification.user_id == current_user.id,
        models.Notification.is_read == False
    ).update({"is_read": True})
    db.commit()
    return {"message": "All notifications marked as read"}
