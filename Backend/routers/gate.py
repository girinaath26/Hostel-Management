from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from .. import models, schemas, security
from ..database import get_db
from ..services import gate_service

router = APIRouter(prefix="/gate", tags=["Gate Automation"])

@router.post("/scan", response_model=schemas.GateScanResponse)
def scan_qr_gate_pass(
    req: schemas.GateScanRequest,
    current_user: models.User = Depends(security.require_roles([models.UserRole.GATEKEEPER, models.UserRole.ADMIN])),
    db: Session = Depends(get_db)
):
    result = gate_service.process_gate_scan(
        db=db,
        qr_payload=req.qr_payload.strip(),
        gate_id=req.gate_id,
        gatekeeper=current_user,
        scan_type=req.scan_type.value
    )
    return result

@router.get("/recent-logs")
def get_recent_gate_events(
    limit: int = 30,
    current_user: models.User = Depends(security.require_roles([models.UserRole.GATEKEEPER, models.UserRole.WARDEN, models.UserRole.ADMIN])),
    db: Session = Depends(get_db)
):
    events = db.query(models.GateEvent).order_by(models.GateEvent.timestamp.desc()).limit(limit).all()
    
    logs = []
    for e in events:
        s = e.student
        op = e.outpass
        logs.append({
            "id": e.id,
            "event_type": e.event_type,
            "timestamp": e.timestamp.strftime('%Y-%m-%d %H:%M:%S'),
            "gate_id": e.gate_id,
            "student_name": s.user.full_name if s else "Unknown",
            "reg_number": s.reg_number if s else "N/A",
            "room_number": s.room.room_number if s and s.room else "N/A",
            "outpass_code": op.outpass_code if op else "N/A",
            "destination": op.destination if op else "N/A",
            "verification_method": e.verification_method,
            "notes": e.notes
        })
    return logs
