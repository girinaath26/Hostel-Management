import datetime
import uuid
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from .. import models, schemas, security
from ..database import get_db
from ..services.audit_service import log_audit_event

router = APIRouter(prefix="/fees", tags=["Hostel & Mess Fees"])

@router.get("/my-dues", response_model=List[schemas.FeeResponse])
def get_my_fees(
    current_user: models.User = Depends(security.require_roles([models.UserRole.STUDENT])),
    db: Session = Depends(get_db)
):
    student = current_user.student_profile
    if not student:
        return []
    fees = db.query(models.Fee).filter(models.Fee.student_id == student.id).order_by(models.Fee.due_date.asc()).all()
    
    results = []
    for f in fees:
        results.append({
            "id": f.id,
            "student_id": f.student_id,
            "student_name": current_user.full_name,
            "fee_type": f.fee_type,
            "amount": f.amount,
            "due_date": f.due_date,
            "status": f.status,
            "paid_at": f.paid_at,
            "payment_ref": f.payment_ref,
            "academic_term": f.academic_term
        })
    return results

@router.post("/pay/{fee_id}", response_model=schemas.FeeResponse)
def pay_fee_mock(
    fee_id: int,
    req: schemas.FeePayRequest,
    current_user: models.User = Depends(security.require_roles([models.UserRole.STUDENT, models.UserRole.PARENT])),
    db: Session = Depends(get_db)
):
    fee = db.query(models.Fee).filter(models.Fee.id == fee_id).first()
    if not fee:
        raise HTTPException(status_code=404, detail="Fee invoice not found")

    if current_user.role == models.UserRole.STUDENT:
        if not current_user.student_profile or fee.student_id != current_user.student_profile.id:
            raise HTTPException(status_code=403, detail="You may pay only your own fee invoices")
    else:
        parent = current_user.parent_profile
        if not parent or fee.student_id not in {student.id for student in parent.students}:
            raise HTTPException(status_code=403, detail="You may pay only invoices for your linked students")
        
    if fee.status == "PAID":
        raise HTTPException(status_code=400, detail="Fee is already paid")

    old_status = fee.status
    fee.status = "PAID"
    fee.paid_at = datetime.datetime.utcnow()
    fee.payment_ref = f"PAY-MOCK-{uuid.uuid4().hex[:8].upper()}"
    
    db.commit()
    db.refresh(fee)

    log_audit_event(
        db=db,
        user=current_user,
        action="FEE_PAYMENT_RECORDED",
        entity_name="Fee",
        entity_id=fee.id,
        old_state=old_status,
        new_state="PAID",
        details=f"Payment of Rs. {fee.amount} for {fee.fee_type} recorded via {req.payment_method}. Ref: {fee.payment_ref}"
    )

    return {
        "id": fee.id,
        "student_id": fee.student_id,
        "student_name": fee.student.user.full_name,
        "fee_type": fee.fee_type,
        "amount": fee.amount,
        "due_date": fee.due_date,
        "status": fee.status,
        "paid_at": fee.paid_at,
        "payment_ref": fee.payment_ref,
        "academic_term": fee.academic_term
    }
