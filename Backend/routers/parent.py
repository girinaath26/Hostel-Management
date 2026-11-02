from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from .. import models, schemas, security
from ..database import get_db
from ..services import outpass_service

router = APIRouter(prefix="/parent", tags=["Parent Consent & Monitoring"])

@router.get("/student-status")
def get_linked_student_status(
    current_user: models.User = Depends(security.require_roles([models.UserRole.PARENT])),
    db: Session = Depends(get_db)
):
    parent = current_user.parent_profile
    if not parent or not parent.students:
        raise HTTPException(status_code=404, detail="No linked student found for parent account")
    
    student = parent.students[0] # Primary student
    active_op = None
    if student.current_outpass_id:
        active_op = db.query(models.Outpass).filter(models.Outpass.id == student.current_outpass_id).first()
        
    return {
        "student_id": student.id,
        "name": student.user.full_name,
        "reg_number": student.reg_number,
        "hostel": student.hostel.name if student.hostel else "Hostel",
        "block": student.block.block_name if student.block else "Block A",
        "room": student.room.room_number if student.room else "101",
        "photo_url": student.photo_url,
        "is_outside": student.is_outside,
        "current_status": "OUTSIDE (With Outpass)" if student.is_outside else "INSIDE HOSTEL",
        "active_outpass": {
            "id": active_op.id,
            "code": active_op.outpass_code,
            "destination": active_op.destination,
            "departure": active_op.departure_time.strftime('%Y-%m-%d %H:%M') if active_op else None,
            "expected_return": active_op.expected_return_time.strftime('%Y-%m-%d %H:%M') if active_op else None,
            "status": active_op.status
        } if active_op else None
    }

@router.get("/pending-consents", response_model=List[schemas.OutpassResponse])
def get_pending_consents(
    current_user: models.User = Depends(security.require_roles([models.UserRole.PARENT])),
    db: Session = Depends(get_db)
):
    parent = current_user.parent_profile
    if not parent or not parent.students:
        return []
    
    student_ids = [s.id for s in parent.students]
    
    outpasses = db.query(models.Outpass).filter(
        models.Outpass.student_id.in_(student_ids),
        models.Outpass.status == models.OutpassStatus.PENDING_PARENT
    ).order_by(models.Outpass.created_at.desc()).all()
    
    from .outpass import _format_outpass_dict
    return [_format_outpass_dict(op) for op in outpasses]

@router.post("/consent-action", response_model=schemas.OutpassResponse)
def submit_parent_consent(
    action: schemas.ParentConsentAction,
    current_user: models.User = Depends(security.require_roles([models.UserRole.PARENT])),
    db: Session = Depends(get_db)
):
    parent = current_user.parent_profile
    if not parent:
        raise HTTPException(status_code=403, detail="Parent profile required")
        
    outpass = db.query(models.Outpass).filter(models.Outpass.id == action.outpass_id).first()
    if not outpass:
        raise HTTPException(status_code=404, detail="Outpass not found")
        
    if outpass.student.parent_id != parent.id:
        raise HTTPException(status_code=403, detail="Unauthorized: this outpass does not belong to your linked student")

    updated = outpass_service.process_parent_consent(
        db=db,
        outpass=outpass,
        decision=action.decision.value,
        remarks=action.remarks or ("Consent granted by Parent" if action.decision.value == "APPROVED" else "Denied by Parent"),
        parent_user=current_user
    )
    
    from .outpass import _format_outpass_dict
    return _format_outpass_dict(updated)

@router.get("/outpass-history", response_model=List[schemas.OutpassResponse])
def get_parent_outpass_history(
    current_user: models.User = Depends(security.require_roles([models.UserRole.PARENT])),
    db: Session = Depends(get_db)
):
    parent = current_user.parent_profile
    if not parent or not parent.students:
        return []
    
    student_ids = [s.id for s in parent.students]
    outpasses = db.query(models.Outpass).filter(
        models.Outpass.student_id.in_(student_ids)
    ).order_by(models.Outpass.created_at.desc()).all()
    
    from .outpass import _format_outpass_dict
    return [_format_outpass_dict(op) for op in outpasses]
