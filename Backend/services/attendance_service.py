import datetime
from typing import List, Optional
from sqlalchemy.orm import Session
from .. import models
from .outpass_service import check_and_update_overdue_outpasses

def get_block_attendance_matrix(
    db: Session,
    block_id: Optional[int] = None,
    hostel_id: Optional[int] = None
) -> dict:
    # First sync any outpass that passed return time
    check_and_update_overdue_outpasses(db)
    
    query = db.query(models.Student)
    if block_id:
        query = query.filter(models.Student.block_id == block_id)
    elif hostel_id:
        query = query.filter(models.Student.hostel_id == hostel_id)

    students = query.all()
    
    total = len(students)
    present_count = 0
    outside_authorized = 0
    overdue_count = 0
    unaccounted_count = 0

    exceptions_list = []
    
    for s in students:
        status_label = "PRESENT"
        active_op = None
        action_required = False
        action_reason = ""
        
        # Check active outpass
        if s.is_outside and s.current_outpass_id:
            op = db.query(models.Outpass).filter(models.Outpass.id == s.current_outpass_id).first()
            if op:
                active_op = op
                if op.status == models.OutpassStatus.OVERDUE:
                    status_label = "OVERDUE"
                    overdue_count += 1
                    action_required = True
                    action_reason = f"Exceeded return time ({op.expected_return_time.strftime('%b %d, %I:%M %p')}). Student not returned."
                elif op.status == models.OutpassStatus.ACTIVE:
                    status_label = "OUTSIDE_AUTHORIZED"
                    outside_authorized += 1
                else:
                    status_label = "UNACCOUNTED"
                    unaccounted_count += 1
                    action_required = True
                    action_reason = f"Marked outside with non-active outpass state ({op.status})."
            else:
                status_label = "UNACCOUNTED"
                unaccounted_count += 1
                action_required = True
                action_reason = "Marked outside but no active outpass found in system."
        elif s.is_outside and not s.current_outpass_id:
            status_label = "UNACCOUNTED"
            unaccounted_count += 1
            action_required = True
            action_reason = "Student marked outside without an authorized outpass."
        else:
            status_label = "PRESENT"
            present_count += 1

        if action_required:
            exceptions_list.append({
                "student_id": s.id,
                "name": s.user.full_name,
                "reg_number": s.reg_number,
                "room": s.room.room_number if s.room else "N/A",
                "floor": s.room.floor_number if s.room else "N/A",
                "block": s.block.block_name if s.block else "N/A",
                "photo_url": s.photo_url,
                "status": status_label,
                "action_reason": action_reason,
                "outpass_code": active_op.outpass_code if active_op else None,
                "destination": active_op.destination if active_op else None,
                "expected_return": active_op.expected_return_time.strftime('%Y-%m-%d %H:%M') if active_op else None
            })

    accounted_rate = round(((present_count + outside_authorized) / total * 100), 1) if total > 0 else 100.0

    return {
        "total_assigned_students": total,
        "present_count": present_count,
        "outside_authorized_count": outside_authorized,
        "overdue_count": overdue_count,
        "unaccounted_count": unaccounted_count,
        "accounted_rate": accounted_rate,
        "exceptions_list": exceptions_list
    }

def get_room_level_hierarchy(
    db: Session,
    block_id: int
) -> List[dict]:
    check_and_update_overdue_outpasses(db)
    
    rooms = db.query(models.Room).filter(models.Room.block_id == block_id).order_by(models.Room.floor_number, models.Room.room_number).all()
    
    results = []
    for r in rooms:
        student_list = []
        for s in r.students:
            status_label = "PRESENT"
            active_op = None
            if s.is_outside and s.current_outpass_id:
                op = db.query(models.Outpass).filter(models.Outpass.id == s.current_outpass_id).first()
                if op:
                    active_op = op
                    status_label = "OVERDUE" if op.status == models.OutpassStatus.OVERDUE else "OUTSIDE_AUTHORIZED"
                else:
                    status_label = "UNACCOUNTED"
            elif s.is_outside:
                status_label = "UNACCOUNTED"
                
            student_list.append({
                "student_id": s.id,
                "user_id": s.user_id,
                "name": s.user.full_name,
                "reg_number": s.reg_number,
                "photo_url": s.photo_url,
                "status": status_label,
                "active_outpass_code": active_op.outpass_code if active_op else None,
                "destination": active_op.destination if active_op else None,
                "expected_return": active_op.expected_return_time.isoformat() if active_op else None,
                "is_outside": s.is_outside
            })
            
        results.append({
            "room_id": r.id,
            "room_number": r.room_number,
            "floor_number": r.floor_number,
            "capacity": r.capacity,
            "occupancy_count": len(r.students),
            "students": student_list
        })
        
    return results
