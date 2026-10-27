import datetime
from sqlalchemy.orm import Session
from .. import models

def log_audit_event(
    db: Session,
    user: models.User,
    action: str,
    entity_name: str,
    entity_id: str,
    old_state: str = None,
    new_state: str = None,
    details: str = None,
    ip_address: str = "127.0.0.1"
):
    audit = models.AuditLog(
        user_id=user.id if user else None,
        actor_name=user.full_name if user else "SYSTEM_AUTOMATION",
        actor_role=user.role if user else "SYSTEM",
        action=action,
        entity_name=entity_name,
        entity_id=str(entity_id),
        old_state=str(old_state) if old_state is not None else None,
        new_state=str(new_state) if new_state is not None else None,
        details=details,
        ip_address=ip_address,
        timestamp=datetime.datetime.utcnow()
    )
    db.add(audit)
    db.commit()
    return audit
