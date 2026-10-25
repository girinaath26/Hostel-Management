from enum import Enum
from typing import List, Optional, Any
from pydantic import BaseModel, EmailStr, Field
import datetime

class OutpassType(str, Enum):
    HOME = "HOME"
    LOCAL = "LOCAL"
    EMERGENCY = "EMERGENCY"

class ApprovalDecision(str, Enum):
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"

class GateScanType(str, Enum):
    AUTO = "AUTO"
    EXIT = "EXIT"
    RETURN = "RETURN"

class ComplaintStatus(str, Enum):
    SUBMITTED = "SUBMITTED"
    ASSIGNED = "ASSIGNED"
    IN_PROGRESS = "IN_PROGRESS"
    RESOLVED = "RESOLVED"
    CLOSED = "CLOSED"

class ComplaintPriority(str, Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    EMERGENCY = "EMERGENCY"

# --- Auth Schemas ---
class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str
    user_id: int
    full_name: str
    email: str

class LoginRequest(BaseModel):
    email: str
    password: str

class UserResponse(BaseModel):
    id: int
    email: str
    full_name: str
    role: str
    phone: Optional[str] = None
    avatar_url: Optional[str] = None
    is_active: bool

    class Config:
        from_attributes = True

class StudentProfileResponse(BaseModel):
    id: int
    user_id: int
    full_name: str
    email: str
    reg_number: str
    hostel_name: str
    block_name: str
    room_number: str
    course: str
    batch: str
    photo_url: str
    is_outside: bool
    parent_name: Optional[str] = None
    parent_phone: Optional[str] = None
    assigned_rc_name: Optional[str] = None
    assigned_rc_available: Optional[bool] = None

# --- Outpass Schemas ---
class OutpassCreate(BaseModel):
    destination: str = Field(..., min_length=2, max_length=150)
    reason: str = Field(..., min_length=5)
    outpass_type: OutpassType = OutpassType.HOME
    departure_time: datetime.datetime
    expected_return_time: datetime.datetime

class ParentConsentAction(BaseModel):
    outpass_id: int
    decision: ApprovalDecision
    remarks: Optional[str] = None

class RCApprovalAction(BaseModel):
    outpass_id: int
    decision: ApprovalDecision
    remarks: Optional[str] = None

class OutpassResponse(BaseModel):
    id: int
    outpass_code: str
    student_id: int
    student_name: str
    student_reg_number: str
    hostel_name: str
    room_number: str
    photo_url: Optional[str] = None
    destination: str
    reason: str
    outpass_type: str
    departure_time: datetime.datetime
    expected_return_time: datetime.datetime
    actual_exit_time: Optional[datetime.datetime] = None
    actual_return_time: Optional[datetime.datetime] = None
    status: str
    parent_consent_status: str
    parent_remarks: Optional[str] = None
    assigned_rc_name: Optional[str] = None
    approved_by_rc_name: Optional[str] = None
    rc_remarks: Optional[str] = None
    is_fallback_routed: bool
    routing_log: Optional[str] = None
    qr_payload: Optional[str] = None
    created_at: datetime.datetime

    class Config:
        from_attributes = True

# --- Gate Verification Schemas ---
class GateScanRequest(BaseModel):
    qr_payload: str
    gate_id: str = "MAIN_GATE_NORTH"
    scan_type: GateScanType = GateScanType.AUTO

class GateScanResponse(BaseModel):
    success: bool
    message: str
    event_type: str # EXIT or RETURN
    timestamp: datetime.datetime
    student: dict
    outpass: dict
    is_overdue: bool = False

# --- Mess Schemas ---
class MealScheduleResponse(BaseModel):
    id: int
    meal_id: int
    meal_name: str
    category: str
    meal_date: str
    meal_time: str
    total_capacity: int
    remaining_capacity: int
    is_active: bool
    has_claimed_token: bool = False
    my_token_code: Optional[str] = None
    my_token_status: Optional[str] = None
    my_qr_payload: Optional[str] = None

class MessTokenRequest(BaseModel):
    schedule_id: int

class MessTokenRedeemRequest(BaseModel):
    qr_payload: str

class MessTokenResponse(BaseModel):
    id: int
    token_code: str
    student_name: str
    student_reg: str
    meal_name: str
    meal_date: str
    meal_time: str
    status: str
    issued_at: datetime.datetime
    redeemed_at: Optional[datetime.datetime] = None
    qr_payload: Optional[str] = None

# --- Complaint Schemas ---
class ComplaintCreate(BaseModel):
    category: str
    title: str
    description: str
    location: str
    priority: ComplaintPriority = ComplaintPriority.MEDIUM

class ComplaintStatusUpdate(BaseModel):
    status: ComplaintStatus
    assigned_to_id: Optional[int] = None
    resolution_notes: Optional[str] = None

class ComplaintResponse(BaseModel):
    id: int
    complaint_code: str
    student_id: int
    student_name: str
    room_number: str
    category: str
    title: str
    description: str
    location: str
    priority: str
    status: str
    assigned_to_name: Optional[str] = None
    resolution_notes: Optional[str] = None
    created_at: datetime.datetime
    resolved_at: Optional[datetime.datetime] = None

# --- Attendance Schemas ---
class RoomPresenceStudent(BaseModel):
    student_id: int
    user_id: int
    name: str
    reg_number: str
    photo_url: str
    status: str # PRESENT, OUTSIDE_AUTHORIZED, OVERDUE, UNACCOUNTED
    active_outpass_code: Optional[str] = None
    destination: Optional[str] = None
    expected_return: Optional[datetime.datetime] = None
    is_outside: bool

class RoomPresenceInfo(BaseModel):
    room_id: int
    room_number: str
    floor_number: int
    capacity: int
    occupancy_count: int
    students: List[RoomPresenceStudent]

class NightAttendanceSummary(BaseModel):
    total_assigned_students: int
    present_count: int
    outside_authorized_count: int
    overdue_count: int
    unaccounted_count: int
    accounted_rate: float
    exceptions_list: List[dict]

# --- Fee Schemas ---
class FeeResponse(BaseModel):
    id: int
    student_id: int
    student_name: str
    fee_type: str
    amount: float
    due_date: datetime.datetime
    status: str
    paid_at: Optional[datetime.datetime] = None
    payment_ref: Optional[str] = None
    academic_term: str

class FeePayRequest(BaseModel):
    payment_method: str = "NET_BANKING_MOCK"

# --- Notification Schema ---
class NotificationResponse(BaseModel):
    id: int
    title: str
    message: str
    category: str
    priority: str
    link_url: Optional[str] = None
    is_read: bool
    created_at: datetime.datetime

# --- RCAvailability Schema ---
class RCAvailabilityUpdate(BaseModel):
    is_available: bool
    on_duty: bool
    backup_rc_id: Optional[int] = None

# --- Audit Log Schema ---
class AuditLogResponse(BaseModel):
    id: int
    actor_name: str
    actor_role: str
    action: str
    entity_name: str
    entity_id: str
    old_state: Optional[str] = None
    new_state: Optional[str] = None
    details: Optional[str] = None
    ip_address: str
    timestamp: datetime.datetime
