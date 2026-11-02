from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from .. import models, schemas, security
from ..database import get_db
from ..services import mess_service

router = APIRouter(prefix="/mess", tags=["Mess & Food Token Management"])

@router.get("/schedules", response_model=List[schemas.MealScheduleResponse])
def get_available_meal_schedules(
    current_user: models.User = Depends(security.get_current_user),
    db: Session = Depends(get_db)
):
    student = current_user.student_profile if current_user.role == models.UserRole.STUDENT else None
    
    schedules = db.query(models.MealSchedule).filter(
        models.MealSchedule.is_active == True
    ).order_by(models.MealSchedule.meal_date.asc(), models.MealSchedule.meal_time.asc()).all()

    results = []
    for s in schedules:
        my_token = None
        if student:
            my_token = db.query(models.MessToken).filter(
                models.MessToken.student_id == student.id,
                models.MessToken.schedule_id == s.id
            ).first()

        results.append({
            "id": s.id,
            "meal_id": s.meal_id,
            "meal_name": s.meal.name,
            "category": s.meal.category,
            "meal_date": s.meal_date,
            "meal_time": s.meal_time,
            "total_capacity": s.total_capacity,
            "remaining_capacity": s.remaining_capacity,
            "is_active": s.is_active,
            "has_claimed_token": my_token is not None,
            "my_token_code": my_token.token_code if my_token else None,
            "my_token_status": my_token.status if my_token else None,
            "my_qr_payload": my_token.qr_signature if my_token else None
        })

    return results

@router.post("/request-token", response_model=schemas.MessTokenResponse)
def request_meal_token(
    req: schemas.MessTokenRequest,
    current_user: models.User = Depends(security.require_roles([models.UserRole.STUDENT])),
    db: Session = Depends(get_db)
):
    student = current_user.student_profile
    if not student:
        raise HTTPException(status_code=400, detail="Student profile required to claim mess tokens")

    token = mess_service.issue_mess_token(
        db=db,
        student=student,
        schedule_id=req.schedule_id,
        actor_user=current_user
    )

    return {
        "id": token.id,
        "token_code": token.token_code,
        "student_name": student.user.full_name,
        "student_reg": student.reg_number,
        "meal_name": token.schedule.meal.name,
        "meal_date": token.schedule.meal_date,
        "meal_time": token.schedule.meal_time,
        "status": token.status,
        "issued_at": token.issued_at,
        "redeemed_at": token.redeemed_at,
        "qr_payload": token.qr_signature
    }

@router.post("/cancel-token/{token_id}", response_model=schemas.MessTokenResponse)
def cancel_meal_token(
    token_id: int,
    current_user: models.User = Depends(security.require_roles([models.UserRole.STUDENT])),
    db: Session = Depends(get_db)
):
    token = mess_service.cancel_mess_token(db=db, token_id=token_id, student_user=current_user)
    return {
        "id": token.id,
        "token_code": token.token_code,
        "student_name": token.student.user.full_name,
        "student_reg": token.student.reg_number,
        "meal_name": token.schedule.meal.name,
        "meal_date": token.schedule.meal_date,
        "meal_time": token.schedule.meal_time,
        "status": token.status,
        "issued_at": token.issued_at,
        "redeemed_at": token.redeemed_at,
        "qr_payload": None
    }

@router.post("/redeem-token")
def redeem_scanned_token(
    req: schemas.MessTokenRedeemRequest,
    current_user: models.User = Depends(security.require_roles([models.UserRole.MESS_STAFF, models.UserRole.ADMIN])),
    db: Session = Depends(get_db)
):
    result = mess_service.redeem_mess_token(
        db=db,
        qr_payload=req.qr_payload.strip(),
        mess_staff=current_user
    )
    return result

@router.get("/staff-stats")
def get_mess_staff_stats(
    current_user: models.User = Depends(security.require_roles([models.UserRole.MESS_STAFF, models.UserRole.WARDEN, models.UserRole.ADMIN])),
    db: Session = Depends(get_db)
):
    schedules = db.query(models.MealSchedule).filter(models.MealSchedule.is_active == True).all()
    stats = []
    for s in schedules:
        redeemed_count = db.query(models.MessToken).filter(
            models.MessToken.schedule_id == s.id,
            models.MessToken.status == models.MessTokenStatus.REDEEMED
        ).count()
        issued_count = db.query(models.MessToken).filter(
            models.MessToken.schedule_id == s.id
        ).count()
        
        stats.append({
            "schedule_id": s.id,
            "meal_name": s.meal.name,
            "category": s.meal.category,
            "meal_date": s.meal_date,
            "meal_time": s.meal_time,
            "total_capacity": s.total_capacity,
            "remaining_capacity": s.remaining_capacity,
            "issued_count": issued_count,
            "redeemed_count": redeemed_count,
            "no_show_rate": f"{round((issued_count - redeemed_count)/issued_count * 100, 1)}%" if issued_count > 0 else "0.0%"
        })
        
    recent_redemptions = db.query(models.MessToken).filter(
        models.MessToken.status == models.MessTokenStatus.REDEEMED
    ).order_by(models.MessToken.redeemed_at.desc()).limit(15).all()

    redemptions_list = []
    for t in recent_redemptions:
        redemptions_list.append({
            "token_code": t.token_code,
            "student_name": t.student.user.full_name,
            "reg_number": t.student.reg_number,
            "meal_name": t.schedule.meal.name,
            "redeemed_at": t.redeemed_at.strftime('%Y-%m-%d %H:%M:%S') if t.redeemed_at else ""
        })

    return {
        "schedules": stats,
        "recent_redemptions": redemptions_list
    }
