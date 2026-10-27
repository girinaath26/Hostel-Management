import datetime
import uuid
from sqlalchemy.orm import Session
from fastapi import HTTPException, status
from .. import models
from ..security import generate_signed_qr_payload
from .audit_service import log_audit_event
from .alert_service import (
    alert_parent_outpass_created,
    alert_rc_pending_approval,
    alert_student_outpass_status
)

def create_outpass(
    db: Session,
    student: models.Student,
    destination: str,
    reason: str,
    outpass_type: str,
    departure_time: datetime.datetime,
    expected_return_time: datetime.datetime,
    actor_user: models.User
) -> models.Outpass:
    # Validation 1: Student cannot have another active or pending outpass
    existing = db.query(models.Outpass).filter(
        models.Outpass.student_id == student.id,
        models.Outpass.status.in_([
            models.OutpassStatus.PENDING_PARENT,
            models.OutpassStatus.PENDING_RC,
            models.OutpassStatus.APPROVED,
            models.OutpassStatus.ACTIVE,
            models.OutpassStatus.OVERDUE
        ])
    ).first()
    
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"You already have an ongoing or pending outpass (#{existing.outpass_code}, Status: {existing.status}). Please resolve or cancel it first."
        )

    # Validation 2: Time validation
    if expected_return_time <= departure_time:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Expected return time must be strictly after departure time."
        )

    outpass_code = f"OP-{datetime.datetime.utcnow().strftime('%y%m%d')}-{uuid.uuid4().hex[:6].upper()}"
    
    outpass = models.Outpass(
        outpass_code=outpass_code,
        student_id=student.id,
        destination=destination,
        reason=reason,
        outpass_type=outpass_type,
        departure_time=departure_time,
        expected_return_time=expected_return_time,
        status=models.OutpassStatus.PENDING_PARENT,
        parent_consent_status=models.ConsentStatus.PENDING,
        assigned_rc_id=student.assigned_rc_id,
        is_fallback_routed=False,
        routing_log=f"[{datetime.datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')}] Outpass created. Awaiting parent digital consent.",
        created_at=datetime.datetime.utcnow()
    )
    db.add(outpass)
    db.commit()
    db.refresh(outpass)

    log_audit_event(
        db=db,
        user=actor_user,
        action="OUTPASS_CREATED",
        entity_name="Outpass",
        entity_id=outpass.id,
        new_state=models.OutpassStatus.PENDING_PARENT,
        details=f"Student {student.user.full_name} created outpass to {destination}."
    )

    alert_parent_outpass_created(db=db, outpass=outpass)
    return outpass

def process_parent_consent(
    db: Session,
    outpass: models.Outpass,
    decision: str, # APPROVED or REJECTED
    remarks: str,
    parent_user: models.User
) -> models.Outpass:
    if outpass.status != models.OutpassStatus.PENDING_PARENT:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Outpass #{outpass.outpass_code} is not in PENDING_PARENT state (Current: {outpass.status})"
        )

    timestamp_str = datetime.datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')
    outpass.parent_action_time = datetime.datetime.utcnow()
    outpass.parent_remarks = remarks

    if decision == models.ConsentStatus.APPROVED:
        outpass.parent_consent_status = models.ConsentStatus.APPROVED
        outpass.status = models.OutpassStatus.PENDING_RC
        
        # --- INTELLIGENT RC ROUTING & FALLBACK ENGINE ---
        assigned_rc_id = outpass.assigned_rc_id
        target_rc_id = assigned_rc_id
        is_routed = False
        fallback_msg = ""
        
        if assigned_rc_id:
            assigned_rc_profile = db.query(models.RCProfile).filter(models.RCProfile.user_id == assigned_rc_id).first()
            if not assigned_rc_profile or not assigned_rc_profile.is_available:
                # Primary RC unavailable, route to designated Backup RC
                if assigned_rc_profile and assigned_rc_profile.backup_rc_id:
                    backup_rc_profile = db.query(models.RCProfile).filter(models.RCProfile.user_id == assigned_rc_profile.backup_rc_id).first()
                    if backup_rc_profile and backup_rc_profile.is_available:
                        target_rc_id = assigned_rc_profile.backup_rc_id
                        is_routed = True
                        fallback_msg = f"Assigned RC ({assigned_rc_profile.user.full_name}) is unavailable. Auto-routed to Backup RC ({backup_rc_profile.user.full_name})."
                    else:
                        # Escalation: Backup RC also unavailable -> Escalate to Warden
                        warden = db.query(models.User).filter(models.User.role == models.UserRole.WARDEN, models.User.is_active == True).first()
                        if warden:
                            target_rc_id = warden.id
                            is_routed = True
                            fallback_msg = f"Both Assigned RC and Backup RC unavailable. Escalated directly to Chief Warden ({warden.full_name})."
                else:
                    # No backup assigned -> Escalate to any available on-duty RC or Warden
                    other_rc = db.query(models.RCProfile).filter(
                        models.RCProfile.is_available == True,
                        models.RCProfile.on_duty == True,
                        models.RCProfile.user_id != assigned_rc_id
                    ).first()
                    if other_rc:
                        target_rc_id = other_rc.user_id
                        is_routed = True
                        fallback_msg = f"Assigned RC is unavailable. Auto-routed to On-Duty RC ({other_rc.user.full_name})."

        if not target_rc_id:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="No available RC or warden can receive this outpass. Please contact hostel administration."
            )

        outpass.assigned_rc_id = target_rc_id
        outpass.is_fallback_routed = is_routed
        log_entry = f"[{timestamp_str}] Parent APPROVED consent. "
        if is_routed:
            log_entry += f"Routing Event: {fallback_msg}"
        else:
            log_entry += "Sent to assigned block RC for approval."
            
        outpass.routing_log = f"{outpass.routing_log or ''}\n{log_entry}"
        
        db.commit()
        db.refresh(outpass)

        log_audit_event(
            db=db,
            user=parent_user,
            action="PARENT_CONSENT_APPROVED",
            entity_name="Outpass",
            entity_id=outpass.id,
            old_state=models.OutpassStatus.PENDING_PARENT,
            new_state=models.OutpassStatus.PENDING_RC,
            details=f"Parent approved outpass #{outpass.outpass_code}. {fallback_msg}"
        )

        alert_rc_pending_approval(db=db, outpass=outpass, rc_user_id=target_rc_id, is_routed=is_routed)
        alert_student_outpass_status(db=db, outpass=outpass, status_text="Parent Approved - Awaiting RC Approval")
        
    else: # REJECTED
        outpass.parent_consent_status = models.ConsentStatus.REJECTED
        outpass.status = models.OutpassStatus.REJECTED
        outpass.routing_log = f"{outpass.routing_log or ''}\n[{timestamp_str}] Parent REJECTED consent. Reason: {remarks}"
        
        db.commit()
        db.refresh(outpass)

        log_audit_event(
            db=db,
            user=parent_user,
            action="PARENT_CONSENT_REJECTED",
            entity_name="Outpass",
            entity_id=outpass.id,
            old_state=models.OutpassStatus.PENDING_PARENT,
            new_state=models.OutpassStatus.REJECTED,
            details=f"Parent rejected outpass #{outpass.outpass_code}. Reason: {remarks}"
        )
        
        alert_student_outpass_status(db=db, outpass=outpass, status_text="REJECTED by Parent")

    return outpass

def process_rc_approval(
    db: Session,
    outpass: models.Outpass,
    decision: str, # APPROVED or REJECTED
    remarks: str,
    rc_user: models.User
) -> models.Outpass:
    if outpass.status != models.OutpassStatus.PENDING_RC:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Outpass #{outpass.outpass_code} is not awaiting RC approval (Current: {outpass.status})"
        )

    timestamp_str = datetime.datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')
    outpass.rc_action_time = datetime.datetime.utcnow()
    outpass.rc_remarks = remarks
    outpass.approved_by_rc_id = rc_user.id

    if decision == "APPROVED":
        outpass.status = models.OutpassStatus.APPROVED
        
        # Generate cryptographically signed QR pass payload
        qr_data = {
            "op_id": outpass.id,
            "code": outpass.outpass_code,
            "std_id": outpass.student_id,
            "reg": outpass.student.reg_number,
            "dep": outpass.departure_time.isoformat(),
            "exp": outpass.expected_return_time.isoformat(),
            "type": "OUTPASS_GATE_PASS"
        }
        signed_token = generate_signed_qr_payload(qr_data)
        outpass.qr_signature = signed_token
        
        outpass.routing_log = f"{outpass.routing_log or ''}\n[{timestamp_str}] Approved by {rc_user.role} ({rc_user.full_name}). Digital QR Pass Generated."
        
        db.commit()
        db.refresh(outpass)

        log_audit_event(
            db=db,
            user=rc_user,
            action="RC_APPROVAL_GRANTED",
            entity_name="Outpass",
            entity_id=outpass.id,
            old_state=models.OutpassStatus.PENDING_RC,
            new_state=models.OutpassStatus.APPROVED,
            details=f"{rc_user.role} {rc_user.full_name} approved outpass #{outpass.outpass_code}."
        )

        alert_student_outpass_status(db=db, outpass=outpass, status_text="APPROVED")
        
    else: # REJECTED
        outpass.status = models.OutpassStatus.REJECTED
        outpass.routing_log = f"{outpass.routing_log or ''}\n[{timestamp_str}] Rejected by {rc_user.role} ({rc_user.full_name}). Reason: {remarks}"
        
        db.commit()
        db.refresh(outpass)

        log_audit_event(
            db=db,
            user=rc_user,
            action="RC_APPROVAL_REJECTED",
            entity_name="Outpass",
            entity_id=outpass.id,
            old_state=models.OutpassStatus.PENDING_RC,
            new_state=models.OutpassStatus.REJECTED,
            details=f"{rc_user.role} {rc_user.full_name} rejected outpass #{outpass.outpass_code}."
        )
        
        alert_student_outpass_status(db=db, outpass=outpass, status_text="REJECTED by Hostel Authority")

    return outpass

def check_and_update_overdue_outpasses(db: Session) -> int:
    """
    Scheduled / On-demand service check for passes that have passed expected return time.
    """
    now = datetime.datetime.utcnow()
    overdue_candidates = db.query(models.Outpass).filter(
        models.Outpass.status == models.OutpassStatus.ACTIVE,
        models.Outpass.expected_return_time < now
    ).all()
    
    count = 0
    for op in overdue_candidates:
        op.status = models.OutpassStatus.OVERDUE
        op.routing_log = f"{op.routing_log or ''}\n[{now.strftime('%Y-%m-%d %H:%M:%S')}] Marked OVERDUE automatically. Return deadline elapsed."
        count += 1
        
        log_audit_event(
            db=db,
            user=None,
            action="OUTPASS_MARKED_OVERDUE",
            entity_name="Outpass",
            entity_id=op.id,
            old_state=models.OutpassStatus.ACTIVE,
            new_state=models.OutpassStatus.OVERDUE,
            details=f"Outpass #{op.outpass_code} exceeded expected return time."
        )
        from .alert_service import alert_outpass_overdue
        alert_outpass_overdue(db=db, outpass=op)
        
    db.commit()
    return count
