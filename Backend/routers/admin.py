from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from .. import models, schemas, security
from ..database import get_db
from ..services.audit_service import log_audit_event

router = APIRouter(prefix="/admin", tags=["Administration & Monitoring"])

@router.get("/metrics")
def get_system_metrics(
    current_user: models.User = Depends(security.require_roles([models.UserRole.WARDEN, models.UserRole.ADMIN])),
    db: Session = Depends(get_db)
):
    total_students = db.query(models.Student).count()
    outside_students = db.query(models.Student).filter(models.Student.is_outside == True).count()
    present_students = total_students - outside_students
    
    active_outpasses = db.query(models.Outpass).filter(models.Outpass.status == models.OutpassStatus.ACTIVE).count()
    overdue_outpasses = db.query(models.Outpass).filter(models.Outpass.status == models.OutpassStatus.OVERDUE).count()
    pending_approvals = db.query(models.Outpass).filter(models.Outpass.status.in_([
        models.OutpassStatus.PENDING_PARENT,
        models.OutpassStatus.PENDING_RC
    ])).count()
    
    open_complaints = db.query(models.Complaint).filter(models.Complaint.status.in_(["SUBMITTED", "ASSIGNED", "IN_PROGRESS"])).count()
    
    # Active mess tokens today
    today_tokens = db.query(models.MessToken).count()
    
    return {
        "total_students": total_students,
        "present_students": present_students,
        "outside_students": outside_students,
        "active_outpasses": active_outpasses,
        "overdue_outpasses": overdue_outpasses,
        "pending_approvals": pending_approvals,
        "open_complaints": open_complaints,
        "today_tokens_issued": today_tokens
    }

@router.get("/rc-status")
def get_all_rc_statuses(
    current_user: models.User = Depends(security.require_roles([models.UserRole.RC, models.UserRole.WARDEN, models.UserRole.ADMIN])),
    db: Session = Depends(get_db)
):
    rcs = db.query(models.RCProfile).all()
    results = []
    for r in rcs:
        backup = r.backup_rc
        results.append({
            "rc_id": r.id,
            "user_id": r.user_id,
            "name": r.user.full_name,
            "email": r.user.email,
            "block_name": r.block.block_name if r.block else "All Blocks",
            "is_available": r.is_available,
            "on_duty": r.on_duty,
            "backup_rc_id": r.backup_rc_id,
            "backup_rc_name": backup.full_name if backup else "None (Escalate to Warden)"
        })
    return results

@router.post("/rc/toggle-availability")
def toggle_rc_availability(
    req: schemas.RCAvailabilityUpdate,
    current_user: models.User = Depends(security.require_roles([models.UserRole.RC, models.UserRole.WARDEN, models.UserRole.ADMIN])),
    db: Session = Depends(get_db)
):
    rc_profile = current_user.rc_profile
    if not rc_profile:
        # If admin or warden updating another RC
        if req.backup_rc_id:
            rc_profile = db.query(models.RCProfile).filter(models.RCProfile.user_id == current_user.id).first()
            
    if not rc_profile:
        raise HTTPException(status_code=400, detail="RC Profile not found")

    old_state = f"Available={rc_profile.is_available}, OnDuty={rc_profile.on_duty}"
    rc_profile.is_available = req.is_available
    rc_profile.on_duty = req.on_duty
    if req.backup_rc_id:
        rc_profile.backup_rc_id = req.backup_rc_id

    db.commit()
    db.refresh(rc_profile)

    new_state = f"Available={rc_profile.is_available}, OnDuty={rc_profile.on_duty}"

    log_audit_event(
        db=db,
        user=current_user,
        action="RC_AVAILABILITY_CHANGED",
        entity_name="RCProfile",
        entity_id=rc_profile.id,
        old_state=old_state,
        new_state=new_state,
        details=f"RC {current_user.full_name} updated status to {new_state}."
    )

    return {
        "success": True,
        "message": f"Status updated: {'AVAILABLE' if rc_profile.is_available else 'UNAVAILABLE (Fallback active)'}",
        "is_available": rc_profile.is_available,
        "on_duty": rc_profile.on_duty
    }

@router.get("/audit-logs", response_model=List[schemas.AuditLogResponse])
def get_audit_trail(
    limit: int = 50,
    current_user: models.User = Depends(security.require_roles([models.UserRole.WARDEN, models.UserRole.ADMIN])),
    db: Session = Depends(get_db)
):
    logs = db.query(models.AuditLog).order_by(models.AuditLog.timestamp.desc()).limit(limit).all()
    return logs

@router.get("/hostels-structure")
def get_hostels_structure(
    current_user: models.User = Depends(security.get_current_user),
    db: Session = Depends(get_db)
):
    hostels = db.query(models.Hostel).all()
    data = []
    for h in hostels:
        blocks_data = []
        for b in h.blocks:
            blocks_data.append({
                "id": b.id,
                "name": b.block_name,
                "floors": b.total_floors,
                "room_count": len(b.rooms),
                "student_count": len(b.students)
            })
        data.append({
            "id": h.id,
            "name": h.name,
            "code": h.code,
            "gender": h.gender,
            "blocks": blocks_data
        })
    return data
