from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from .. import models, schemas, security
from ..database import get_db
from ..services import attendance_service, outpass_service

router = APIRouter(prefix="/attendance", tags=["Attendance & Presence"])

@router.get("/summary", response_model=schemas.NightAttendanceSummary)
def get_attendance_summary(
    block_id: Optional[int] = None,
    hostel_id: Optional[int] = None,
    current_user: models.User = Depends(security.require_roles([models.UserRole.RC, models.UserRole.WARDEN, models.UserRole.ADMIN])),
    db: Session = Depends(get_db)
):
    # If user is RC, auto filter by their assigned block
    if current_user.role == models.UserRole.RC and not block_id:
        rc_profile = current_user.rc_profile
        if rc_profile and rc_profile.block_id:
            block_id = rc_profile.block_id

    summary = attendance_service.get_block_attendance_matrix(
        db=db,
        block_id=block_id,
        hostel_id=hostel_id
    )
    return summary

@router.get("/rooms", response_model=List[schemas.RoomPresenceInfo])
def get_room_presence_grid(
    block_id: Optional[int] = None,
    current_user: models.User = Depends(security.require_roles([models.UserRole.RC, models.UserRole.WARDEN, models.UserRole.ADMIN])),
    db: Session = Depends(get_db)
):
    if current_user.role == models.UserRole.RC and not block_id:
        rc_profile = current_user.rc_profile
        if rc_profile and rc_profile.block_id:
            block_id = rc_profile.block_id
            
    if not block_id:
        # Default to first block
        first_block = db.query(models.Block).first()
        block_id = first_block.id if first_block else 1

    return attendance_service.get_room_level_hierarchy(db=db, block_id=block_id)

@router.post("/trigger-sync")
def trigger_overdue_sync(
    current_user: models.User = Depends(security.require_roles([models.UserRole.RC, models.UserRole.WARDEN, models.UserRole.ADMIN])),
    db: Session = Depends(get_db)
):
    count = outpass_service.check_and_update_overdue_outpasses(db=db)
    return {"message": f"Sync completed. {count} active passes marked overdue and alerts dispatched.", "updated_count": count}
