import datetime
from sqlalchemy.orm import Session
from fastapi import HTTPException, status
from .. import models
from ..security import normalize_qr_payload, verify_signed_qr_payload
from .audit_service import log_audit_event
from .alert_service import alert_gate_exit, alert_gate_return

def process_gate_scan(
    db: Session,
    qr_payload: str,
    gate_id: str,
    gatekeeper: models.User,
    scan_type: str = "AUTO" # AUTO, EXIT, RETURN
) -> dict:
    # 1. Cryptographically verify signature and parse token payload
    token_data = verify_signed_qr_payload(qr_payload)
    
    outpass_id = token_data.get("op_id")
    if not outpass_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid pass: missing outpass ID."
        )

    outpass = db.query(models.Outpass).filter(models.Outpass.id == outpass_id).first()
    if not outpass:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Outpass record #{outpass_id} not found in database."
        )

    if token_data.get("type") != "OUTPASS_GATE_PASS" or token_data.get("std_id") != outpass.student_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid QR payload for this outpass")
    if not outpass.qr_signature or normalize_qr_payload(qr_payload) != normalize_qr_payload(outpass.qr_signature):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This QR pass has been replaced or revoked. Please present the latest pass.")

    student = outpass.student
    now = datetime.datetime.utcnow()

    # Determine event based on current outpass status
    if outpass.status == models.OutpassStatus.APPROVED:
        # --- EXIT FLOW ---
        if scan_type not in ["AUTO", "EXIT"]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Pass is APPROVED for departure. Please perform an EXIT scan."
            )
            
        # Verify student is not already marked as outside
        if student.is_outside:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="System Conflict: Student is already registered as outside the hostel!"
            )
            
        # Update outpass and student
        outpass.status = models.OutpassStatus.ACTIVE
        outpass.actual_exit_time = now
        outpass.routing_log = f"{outpass.routing_log or ''}\n[{now.strftime('%Y-%m-%d %H:%M:%S')}] Exited via Gate {gate_id}."
        student.is_outside = True
        student.current_outpass_id = outpass.id
        
        # Record immutable gate event
        gate_event = models.GateEvent(
            outpass_id=outpass.id,
            student_id=student.id,
            event_type="EXIT",
            gate_id=gate_id,
            scanned_by_id=gatekeeper.id,
            timestamp=now,
            verification_method="SECURE_QR_SCAN"
        )
        db.add(gate_event)
        db.commit()
        db.refresh(outpass)

        log_audit_event(
            db=db,
            user=gatekeeper,
            action="GATE_EXIT_VERIFIED",
            entity_name="Outpass",
            entity_id=outpass.id,
            old_state=models.OutpassStatus.APPROVED,
            new_state=models.OutpassStatus.ACTIVE,
            details=f"Student {student.user.full_name} exited through Gate {gate_id}."
        )

        alert_gate_exit(db=db, outpass=outpass)

        return {
            "success": True,
            "message": f"EXIT APPROVED for {student.user.full_name}",
            "event_type": "EXIT",
            "timestamp": now,
            "is_overdue": False,
            "student": {
                "id": student.id,
                "name": student.user.full_name,
                "reg_number": student.reg_number,
                "room": student.room.room_number,
                "block": student.block.block_name,
                "photo_url": student.photo_url
            },
            "outpass": {
                "id": outpass.id,
                "code": outpass.outpass_code,
                "destination": outpass.destination,
                "expected_return": outpass.expected_return_time.strftime('%Y-%m-%d %H:%M:%S'),
                "status": outpass.status
            }
        }

    elif outpass.status in [models.OutpassStatus.ACTIVE, models.OutpassStatus.OVERDUE]:
        # --- RETURN FLOW ---
        if scan_type not in ["AUTO", "RETURN"]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Pass is ACTIVE outside. Please perform a RETURN scan."
            )

        is_late = now > outpass.expected_return_time
        old_status = outpass.status
        outpass.status = models.OutpassStatus.RETURNED
        outpass.actual_return_time = now
        outpass.routing_log = f"{outpass.routing_log or ''}\n[{now.strftime('%Y-%m-%d %H:%M:%S')}] Returned via Gate {gate_id}." + (" [LATE/OVERDUE RETURN]" if is_late else "")
        
        student.is_outside = False
        student.current_outpass_id = None
        
        # Record immutable gate event
        gate_event = models.GateEvent(
            outpass_id=outpass.id,
            student_id=student.id,
            event_type="RETURN",
            gate_id=gate_id,
            scanned_by_id=gatekeeper.id,
            timestamp=now,
            verification_method="SECURE_QR_SCAN",
            notes="Late Return Logged" if is_late else "On-time Return"
        )
        db.add(gate_event)
        db.commit()
        db.refresh(outpass)

        log_audit_event(
            db=db,
            user=gatekeeper,
            action="GATE_RETURN_VERIFIED",
            entity_name="Outpass",
            entity_id=outpass.id,
            old_state=old_status,
            new_state=models.OutpassStatus.RETURNED,
            details=f"Student {student.user.full_name} returned through Gate {gate_id}." + (" (Late return)" if is_late else "")
        )

        alert_gate_return(db=db, outpass=outpass)

        return {
            "success": True,
            "message": f"RETURN VERIFIED for {student.user.full_name}" + (" (Late Return Recorded)" if is_late else ""),
            "event_type": "RETURN",
            "timestamp": now,
            "is_overdue": is_late,
            "student": {
                "id": student.id,
                "name": student.user.full_name,
                "reg_number": student.reg_number,
                "room": student.room.room_number,
                "block": student.block.block_name,
                "photo_url": student.photo_url
            },
            "outpass": {
                "id": outpass.id,
                "code": outpass.outpass_code,
                "destination": outpass.destination,
                "actual_exit": outpass.actual_exit_time.strftime('%Y-%m-%d %H:%M:%S') if outpass.actual_exit_time else "",
                "actual_return": now.strftime('%Y-%m-%d %H:%M:%S'),
                "status": outpass.status
            }
        }

    elif outpass.status == models.OutpassStatus.RETURNED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Security Alert: Outpass #{outpass.outpass_code} has ALREADY been closed & returned on {outpass.actual_return_time.strftime('%b %d, %H:%M')}! Replay scans rejected."
        )
    elif outpass.status == models.OutpassStatus.REJECTED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Security Alert: This outpass (#{outpass.outpass_code}) was REJECTED by hostel administration."
        )
    elif outpass.status in [models.OutpassStatus.PENDING_PARENT, models.OutpassStatus.PENDING_RC]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Outpass #{outpass.outpass_code} is still PENDING APPROVAL. Gate exit not permitted."
        )
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid Outpass status: {outpass.status}"
        )
