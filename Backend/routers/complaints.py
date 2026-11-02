import uuid
import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from .. import models, schemas, security
from ..database import get_db
from ..services.audit_service import log_audit_event
from ..services.alert_service import create_notification

router = APIRouter(prefix="/complaints", tags=["Complaints & Maintenance"])

ALLOWED_STATUS_TRANSITIONS = {
    "SUBMITTED": {"ASSIGNED", "IN_PROGRESS", "CLOSED"},
    "ASSIGNED": {"IN_PROGRESS", "RESOLVED", "CLOSED"},
    "IN_PROGRESS": {"RESOLVED", "CLOSED"},
    "RESOLVED": {"CLOSED"},
    "CLOSED": set(),
}

def _format_complaint(c: models.Complaint) -> dict:
    return {
        "id": c.id,
        "complaint_code": c.complaint_code,
        "student_id": c.student_id,
        "student_name": c.student.user.full_name if c.student else "Student",
        "room_number": c.student.room.room_number if c.student and c.student.room else "N/A",
        "category": c.category,
        "title": c.title,
        "description": c.description,
        "location": c.location,
        "priority": c.priority,
        "status": c.status,
        "assigned_to_name": c.assigned_to.full_name if c.assigned_to else None,
        "resolution_notes": c.resolution_notes,
        "created_at": c.created_at,
        "resolved_at": c.resolved_at
    }

@router.post("/submit", response_model=schemas.ComplaintResponse)
def submit_complaint(
    req: schemas.ComplaintCreate,
    current_user: models.User = Depends(security.require_roles([models.UserRole.STUDENT])),
    db: Session = Depends(get_db)
):
    student = current_user.student_profile
    if not student:
        raise HTTPException(status_code=400, detail="Student profile required")

    complaint_code = f"CMP-{datetime.datetime.utcnow().strftime('%y%m%d')}-{uuid.uuid4().hex[:5].upper()}"
    
    complaint = models.Complaint(
        complaint_code=complaint_code,
        student_id=student.id,
        category=req.category,
        title=req.title,
        description=req.description,
        location=req.location,
        priority=req.priority.value,
        status="SUBMITTED",
        assigned_to_id=student.assigned_rc_id,
        created_at=datetime.datetime.utcnow()
    )
    db.add(complaint)
    db.commit()
    db.refresh(complaint)

    # Notify RC
    if student.assigned_rc_id:
        create_notification(
            db=db,
            user_id=student.assigned_rc_id,
            title=f"New Complaint Filed: {req.category}",
            message=f"{current_user.full_name} ({student.room.room_number if student.room else 'Hostel'}) reported: {req.title} [Priority: {req.priority}].",
            category="COMPLAINT",
            priority="WARNING" if req.priority in ["HIGH", "EMERGENCY"] else "INFO",
            link_url="/#rc-complaints"
        )

    log_audit_event(
        db=db,
        user=current_user,
        action="COMPLAINT_SUBMITTED",
        entity_name="Complaint",
        entity_id=complaint.id,
        new_state="SUBMITTED",
        details=f"Complaint #{complaint_code} filed by {current_user.full_name}."
    )

    return _format_complaint(complaint)

@router.get("/my-complaints", response_model=List[schemas.ComplaintResponse])
def get_student_complaints(
    current_user: models.User = Depends(security.require_roles([models.UserRole.STUDENT])),
    db: Session = Depends(get_db)
):
    student = current_user.student_profile
    if not student:
        return []
    complaints = db.query(models.Complaint).filter(
        models.Complaint.student_id == student.id
    ).order_by(models.Complaint.created_at.desc()).all()
    return [_format_complaint(c) for c in complaints]

@router.get("/all", response_model=List[schemas.ComplaintResponse])
def get_all_complaints(
    current_user: models.User = Depends(security.require_roles([models.UserRole.RC, models.UserRole.WARDEN, models.UserRole.ADMIN])),
    db: Session = Depends(get_db)
):
    query = db.query(models.Complaint)
    if current_user.role == models.UserRole.RC:
        # Show complaints from RC's assigned block or directly assigned to them
        query = query.filter(models.Complaint.assigned_to_id == current_user.id)
    complaints = query.order_by(models.Complaint.created_at.desc()).all()
    return [_format_complaint(c) for c in complaints]

@router.put("/update/{complaint_id}", response_model=schemas.ComplaintResponse)
def update_complaint_status(
    complaint_id: int,
    req: schemas.ComplaintStatusUpdate,
    current_user: models.User = Depends(security.require_roles([models.UserRole.RC, models.UserRole.WARDEN, models.UserRole.ADMIN])),
    db: Session = Depends(get_db)
):
    c = db.query(models.Complaint).filter(models.Complaint.id == complaint_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Complaint not found")

    if current_user.role == models.UserRole.RC and c.assigned_to_id != current_user.id:
        raise HTTPException(status_code=403, detail="You may update only complaints assigned to you")

    old_status = c.status
    new_status = req.status.value
    if new_status not in ALLOWED_STATUS_TRANSITIONS.get(old_status, set()):
        raise HTTPException(
            status_code=400,
            detail=f"Invalid complaint status transition from {old_status} to {new_status}"
        )

    if req.assigned_to_id is not None:
        assignee = db.query(models.User).filter(models.User.id == req.assigned_to_id).first()
        if not assignee or not assignee.is_active or assignee.role not in [models.UserRole.RC, models.UserRole.WARDEN]:
            raise HTTPException(status_code=400, detail="Complaint assignee must be an active RC or warden")
        c.assigned_to_id = req.assigned_to_id
    c.status = new_status
    if req.resolution_notes:
        c.resolution_notes = req.resolution_notes
    if new_status in ["RESOLVED", "CLOSED"]:
        c.resolved_at = datetime.datetime.utcnow()

    db.commit()
    db.refresh(c)

    # Notify student
    create_notification(
        db=db,
        user_id=c.student.user_id,
        title=f"Complaint #{c.complaint_code} Updated: {new_status}",
        message=f"Status changed to {new_status}. {c.resolution_notes or ''}",
        category="COMPLAINT",
        priority="INFO"
    )

    log_audit_event(
        db=db,
        user=current_user,
        action="COMPLAINT_STATUS_UPDATED",
        entity_name="Complaint",
        entity_id=c.id,
        old_state=old_status,
        new_state=new_status,
        details=f"Complaint #{c.complaint_code} updated by {current_user.full_name}."
    )

    return _format_complaint(c)
