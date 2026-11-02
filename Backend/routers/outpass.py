from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from .. import models, schemas, security
from ..database import get_db
from ..services import outpass_service

router = APIRouter(prefix="/outpasses", tags=["Outpass Management"])

def _format_outpass_dict(op: models.Outpass) -> dict:
    student = op.student
    return {
        "id": op.id,
        "outpass_code": op.outpass_code,
        "student_id": op.student_id,
        "student_name": student.user.full_name,
        "student_reg_number": student.reg_number,
        "hostel_name": student.hostel.name if student.hostel else "Hostel",
        "room_number": student.room.room_number if student.room else "N/A",
        "photo_url": student.photo_url,
        "destination": op.destination,
        "reason": op.reason,
        "outpass_type": op.outpass_type,
        "departure_time": op.departure_time,
        "expected_return_time": op.expected_return_time,
        "actual_exit_time": op.actual_exit_time,
        "actual_return_time": op.actual_return_time,
        "status": op.status,
        "parent_consent_status": op.parent_consent_status,
        "parent_remarks": op.parent_remarks,
        "assigned_rc_name": op.assigned_rc.full_name if op.assigned_rc else None,
        "approved_by_rc_name": op.approved_by_rc.full_name if op.approved_by_rc else None,
        "rc_remarks": op.rc_remarks,
        "is_fallback_routed": op.is_fallback_routed,
        "routing_log": op.routing_log,
        "qr_payload": op.qr_signature,
        "created_at": op.created_at
    }

@router.post("/request", response_model=schemas.OutpassResponse)
def request_outpass(
    req: schemas.OutpassCreate,
    current_user: models.User = Depends(security.require_roles([models.UserRole.STUDENT])),
    db: Session = Depends(get_db)
):
    student = current_user.student_profile
    if not student:
        raise HTTPException(status_code=400, detail="Student profile required to create outpass")
    if not student.parent_id:
        raise HTTPException(status_code=409, detail="A linked parent is required before an outpass can be requested")
    
    op = outpass_service.create_outpass(
        db=db,
        student=student,
        destination=req.destination,
        reason=req.reason,
        outpass_type=req.outpass_type.value,
        departure_time=req.departure_time,
        expected_return_time=req.expected_return_time,
        actor_user=current_user
    )
    return _format_outpass_dict(op)

@router.get("/my-outpasses", response_model=List[schemas.OutpassResponse])
def get_my_outpasses(
    current_user: models.User = Depends(security.require_roles([models.UserRole.STUDENT])),
    db: Session = Depends(get_db)
):
    student = current_user.student_profile
    if not student:
        return []
    
    outpasses = db.query(models.Outpass).filter(
        models.Outpass.student_id == student.id
    ).order_by(models.Outpass.created_at.desc()).all()
    
    return [_format_outpass_dict(op) for op in outpasses]

@router.get("/active-pass", response_model=Optional[schemas.OutpassResponse])
def get_current_active_outpass(
    current_user: models.User = Depends(security.require_roles([models.UserRole.STUDENT])),
    db: Session = Depends(get_db)
):
    student = current_user.student_profile
    if not student:
        return None
    
    # Priority: ACTIVE/APPROVED/OVERDUE/PENDING
    op = db.query(models.Outpass).filter(
        models.Outpass.student_id == student.id,
        models.Outpass.status.in_([
            models.OutpassStatus.APPROVED,
            models.OutpassStatus.ACTIVE,
            models.OutpassStatus.OVERDUE,
            models.OutpassStatus.PENDING_RC,
            models.OutpassStatus.PENDING_PARENT
        ])
    ).order_by(models.Outpass.created_at.desc()).first()
    
    return _format_outpass_dict(op) if op else None

@router.get("/rc/pending", response_model=List[schemas.OutpassResponse])
def get_rc_pending_outpasses(
    current_user: models.User = Depends(security.require_roles([models.UserRole.RC, models.UserRole.WARDEN])),
    db: Session = Depends(get_db)
):
    query = db.query(models.Outpass).filter(models.Outpass.status == models.OutpassStatus.PENDING_RC)
    if current_user.role == models.UserRole.RC:
        query = query.filter(models.Outpass.assigned_rc_id == current_user.id)
        
    outpasses = query.order_by(models.Outpass.created_at.desc()).all()
    return [_format_outpass_dict(op) for op in outpasses]

@router.post("/rc/approve", response_model=schemas.OutpassResponse)
def rc_approve_or_reject(
    action: schemas.RCApprovalAction,
    current_user: models.User = Depends(security.require_roles([models.UserRole.RC, models.UserRole.WARDEN])),
    db: Session = Depends(get_db)
):
    outpass = db.query(models.Outpass).filter(models.Outpass.id == action.outpass_id).first()
    if not outpass:
        raise HTTPException(status_code=404, detail="Outpass not found")
        
    # Check authorization for this RC
    if current_user.role == models.UserRole.RC and outpass.assigned_rc_id != current_user.id:
        raise HTTPException(status_code=403, detail="This outpass is assigned to a different RC")
        
    updated = outpass_service.process_rc_approval(
        db=db,
        outpass=outpass,
        decision=action.decision.value,
        remarks=action.remarks or ("Approved" if action.decision.value == "APPROVED" else "Rejected"),
        rc_user=current_user
    )
    return _format_outpass_dict(updated)

@router.get("/all", response_model=List[schemas.OutpassResponse])
def get_all_outpasses(
    current_user: models.User = Depends(security.require_roles([models.UserRole.WARDEN, models.UserRole.ADMIN])),
    db: Session = Depends(get_db)
):
    outpasses = db.query(models.Outpass).order_by(models.Outpass.created_at.desc()).limit(100).all()
    return [_format_outpass_dict(op) for op in outpasses]
