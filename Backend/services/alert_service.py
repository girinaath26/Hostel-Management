import datetime
from sqlalchemy.orm import Session
from .. import models

def create_notification(
    db: Session,
    user_id: int,
    title: str,
    message: str,
    category: str = "SYSTEM",
    priority: str = "INFO",
    link_url: str = None
):
    notif = models.Notification(
        user_id=user_id,
        title=title,
        message=message,
        category=category,
        priority=priority,
        link_url=link_url,
        is_read=False,
        created_at=datetime.datetime.utcnow()
    )
    db.add(notif)
    db.commit()
    return notif

def alert_parent_outpass_created(db: Session, outpass: models.Outpass):
    student = outpass.student
    if student and student.parent:
        create_notification(
            db=db,
            user_id=student.parent.user_id,
            title="Outpass Consent Required",
            message=f"{student.user.full_name} has requested an outpass to {outpass.destination}. Departure: {outpass.departure_time.strftime('%b %d, %H:%M')}. Expected return: {outpass.expected_return_time.strftime('%b %d, %H:%M')}. Please review and approve/reject.",
            category="OUTPASS",
            priority="WARNING",
            link_url=f"/#parent-outpasses"
        )

def alert_rc_pending_approval(db: Session, outpass: models.Outpass, rc_user_id: int, is_routed: bool = False):
    student = outpass.student
    prefix = "[FALLBACK ROUTED] " if is_routed else ""
    create_notification(
        db=db,
        user_id=rc_user_id,
        title=f"{prefix}Outpass Approval Requested",
        message=f"{prefix}Student {student.user.full_name} ({student.reg_number}, Room {student.room.room_number}) has submitted outpass #{outpass.outpass_code} with parent consent verified. Destination: {outpass.destination}.",
        category="OUTPASS",
        priority="INFO",
        link_url="/#rc-approvals"
    )

def alert_student_outpass_status(db: Session, outpass: models.Outpass, status_text: str):
    create_notification(
        db=db,
        user_id=outpass.student.user_id,
        title=f"Outpass Update: {status_text}",
        message=f"Your Outpass #{outpass.outpass_code} to {outpass.destination} is now {status_text}. " + 
                ("Your digital QR pass is ready for gate exit." if status_text == "APPROVED" else ""),
        category="OUTPASS",
        priority="INFO" if status_text == "APPROVED" else "WARNING",
        link_url="/#student-outpass"
    )

def alert_gate_exit(db: Session, outpass: models.Outpass):
    student = outpass.student
    # Notify Parent
    if student.parent:
        create_notification(
            db=db,
            user_id=student.parent.user_id,
            title="Student Exited Hostel Gate",
            message=f"{student.user.full_name} has officially departed the hostel gate on approved Outpass #{outpass.outpass_code}. Expected return: {outpass.expected_return_time.strftime('%b %d, %I:%M %p')}.",
            category="GATE",
            priority="INFO"
        )
    # Notify Student
    create_notification(
        db=db,
        user_id=student.user_id,
        title="Gate Exit Recorded",
        message=f"Your exit has been verified. Remember to return before {outpass.expected_return_time.strftime('%b %d, %I:%M %p')}.",
        category="GATE",
        priority="INFO"
    )

def alert_gate_return(db: Session, outpass: models.Outpass):
    student = outpass.student
    # Notify Parent
    if student.parent:
        create_notification(
            db=db,
            user_id=student.parent.user_id,
            title="Student Returned to Hostel",
            message=f"{student.user.full_name} has safely re-entered the hostel gate. Outpass #{outpass.outpass_code} is now closed.",
            category="GATE",
            priority="INFO"
        )
    # Notify Student
    create_notification(
        db=db,
        user_id=student.user_id,
        title="Welcome Back - Return Recorded",
        message=f"Your return has been verified at the gate. Outpass #{outpass.outpass_code} marked RETURNED.",
        category="GATE",
        priority="INFO"
    )

def alert_outpass_overdue(db: Session, outpass: models.Outpass):
    student = outpass.student
    # Alert RC
    if outpass.assigned_rc_id:
        create_notification(
            db=db,
            user_id=outpass.assigned_rc_id,
            title="CRITICAL: Student Overdue for Return",
            message=f"Student {student.user.full_name} ({student.reg_number}, Room {student.room.room_number}) has NOT returned by expected deadline ({outpass.expected_return_time.strftime('%b %d, %I:%M %p')}). Outpass: #{outpass.outpass_code}.",
            category="ALERT",
            priority="CRITICAL"
        )
    # Alert Parent
    if student.parent:
        create_notification(
            db=db,
            user_id=student.parent.user_id,
            title="Overdue Notice: Expected Return Time Passed",
            message=f"{student.user.full_name} has not checked in at the hostel gate by the scheduled return time ({outpass.expected_return_time.strftime('%b %d, %I:%M %p')}). Hostel staff has been alerted.",
            category="ALERT",
            priority="CRITICAL"
        )
