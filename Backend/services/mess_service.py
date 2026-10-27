import datetime
import uuid
from sqlalchemy.orm import Session
from sqlalchemy import update
from fastapi import HTTPException, status
from .. import models
from ..security import generate_signed_qr_payload, normalize_qr_payload, verify_signed_qr_payload
from .audit_service import log_audit_event

def issue_mess_token(
    db: Session,
    student: models.Student,
    schedule_id: int,
    actor_user: models.User
) -> models.MessToken:
    # 1. Fetch Meal Schedule
    schedule = db.query(models.MealSchedule).filter(
        models.MealSchedule.id == schedule_id,
        models.MealSchedule.is_active == True
    ).first()
    
    if not schedule:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Meal schedule not found or is inactive."
        )

    now = datetime.datetime.utcnow()
    try:
        meal_date = datetime.date.fromisoformat(schedule.meal_date)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Meal schedule has an invalid date")

    if meal_date < now.date():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot claim a token for a past meal")
    if schedule.cutoff_time and now >= schedule.cutoff_time:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="The token-claim cutoff has passed for this meal")

    # 2. Check if student already has a token for this meal (Unique constraint check)
    existing_token = db.query(models.MessToken).filter(
        models.MessToken.student_id == student.id,
        models.MessToken.schedule_id == schedule.id
    ).first()
    
    if existing_token:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Duplicate Token Denied: You already claimed a token (#{existing_token.token_code}) for this {schedule.meal.name} on {schedule.meal_date}."
        )

    # 3. Check Eligibility: If student is marked as outside on an outpass
    if student.is_outside:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Ineligibility: You are currently marked as outside the hostel on an active outpass."
        )

    # 4. Atomic capacity reduction to strictly prevent race conditions
    # If 2 students request the last token simultaneously, exactly 1 will succeed
    stmt = (
        update(models.MealSchedule)
        .where(
            models.MealSchedule.id == schedule.id,
            models.MealSchedule.remaining_capacity > 0
        )
        .values(remaining_capacity=models.MealSchedule.remaining_capacity - 1)
    )
    result = db.execute(stmt)
    if result.rowcount == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Quota Exhausted: All {schedule.total_capacity} tokens for {schedule.meal.name} have been claimed."
        )

    # 5. Generate secure token
    token_code = f"TKN-{schedule.meal_date.replace('-', '')}-{uuid.uuid4().hex[:6].upper()}"
    
    qr_data = {
        "tkn_id": None, # Will set after flush
        "code": token_code,
        "std_id": student.id,
        "sch_id": schedule.id,
        "meal": schedule.meal.name,
        "date": schedule.meal_date,
        "type": "MESS_TOKEN"
    }

    new_token = models.MessToken(
        token_code=token_code,
        student_id=student.id,
        schedule_id=schedule.id,
        status=models.MessTokenStatus.ISSUED,
        issued_at=datetime.datetime.utcnow()
    )
    db.add(new_token)
    db.flush() # Populate ID

    qr_data["tkn_id"] = new_token.id
    new_token.qr_signature = generate_signed_qr_payload(qr_data)
    
    db.commit()
    db.refresh(new_token)

    log_audit_event(
        db=db,
        user=actor_user,
        action="MESS_TOKEN_ISSUED",
        entity_name="MessToken",
        entity_id=new_token.id,
        new_state=models.MessTokenStatus.ISSUED,
        details=f"Token {token_code} issued to {student.user.full_name} for {schedule.meal.name} ({schedule.meal_date}). Remaining quota: {schedule.remaining_capacity - 1}"
    )

    return new_token

def redeem_mess_token(
    db: Session,
    qr_payload: str,
    mess_staff: models.User
) -> dict:
    # 1. Cryptographically verify signature
    token_data = verify_signed_qr_payload(qr_payload)
    token_id = token_data.get("tkn_id")
    
    if not token_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Malformed token: missing token ID."
        )

    token = db.query(models.MessToken).filter(models.MessToken.id == token_id).first()
    if not token:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Token record not found."
        )

    if token_data.get("type") != "MESS_TOKEN" or token_data.get("std_id") != token.student_id or token_data.get("sch_id") != token.schedule_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid QR payload for this meal token")
    if not token.qr_signature or normalize_qr_payload(qr_payload) != normalize_qr_payload(token.qr_signature):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This QR token has been replaced or revoked. Please present the latest token.")

    # 2. Check token status
    if token.status == models.MessTokenStatus.REDEEMED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"FRAUD DETECTED: Token #{token.token_code} was ALREADY REDEEMED on {token.redeemed_at.strftime('%I:%M %p')}. Duplicate redemption prohibited!"
        )

    if token.status == models.MessTokenStatus.CANCELLED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Token #{token.token_code} was CANCELLED by student and is no longer valid."
        )

    now = datetime.datetime.utcnow()
    try:
        meal_date = datetime.date.fromisoformat(token.schedule.meal_date)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Meal schedule has an invalid date")

    if meal_date != now.date() or not token.schedule.is_active:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This meal token is not valid for redemption at this time")

    token.status = models.MessTokenStatus.REDEEMED
    token.redeemed_at = now
    token.redeemed_by_id = mess_staff.id
    
    db.commit()
    db.refresh(token)

    student = token.student
    schedule = token.schedule

    log_audit_event(
        db=db,
        user=mess_staff,
        action="MESS_TOKEN_REDEEMED",
        entity_name="MessToken",
        entity_id=token.id,
        old_state=models.MessTokenStatus.ISSUED,
        new_state=models.MessTokenStatus.REDEEMED,
        details=f"Token {token.token_code} redeemed by {student.user.full_name} for {schedule.meal.name}."
    )

    return {
        "success": True,
        "message": f"Token #{token.token_code} Redeemed Successfully!",
        "token_code": token.token_code,
        "student": {
            "name": student.user.full_name,
            "reg_number": student.reg_number,
            "room": student.room.room_number,
            "block": student.block.block_name,
            "photo_url": student.photo_url
        },
        "meal": {
            "name": schedule.meal.name,
            "date": schedule.meal_date,
            "time": schedule.meal_time
        },
        "redeemed_at": now.strftime('%Y-%m-%d %H:%M:%S')
    }

def cancel_mess_token(
    db: Session,
    token_id: int,
    student_user: models.User
) -> models.MessToken:
    token = db.query(models.MessToken).filter(models.MessToken.id == token_id).first()
    if not token:
        raise HTTPException(status_code=404, detail="Token not found.")
        
    if token.student.user_id != student_user.id and student_user.role != models.UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Unauthorized to cancel this token.")
        
    if token.status != models.MessTokenStatus.ISSUED:
        raise HTTPException(status_code=400, detail=f"Cannot cancel token in {token.status} state.")

    # Return capacity back to the schedule
    schedule = token.schedule
    schedule.remaining_capacity = min(schedule.total_capacity, schedule.remaining_capacity + 1)
    
    token.status = models.MessTokenStatus.CANCELLED
    db.commit()
    db.refresh(token)

    log_audit_event(
        db=db,
        user=student_user,
        action="MESS_TOKEN_CANCELLED",
        entity_name="MessToken",
        entity_id=token.id,
        old_state=models.MessTokenStatus.ISSUED,
        new_state=models.MessTokenStatus.CANCELLED,
        details=f"Token #{token.token_code} cancelled. Capacity returned to pool."
    )

    return token
