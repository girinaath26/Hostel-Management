import datetime
from sqlalchemy import (
    Column, Integer, String, Boolean, DateTime, ForeignKey, 
    Text, Float, UniqueConstraint
)
from sqlalchemy.orm import relationship
from .database import Base

class UserRole(str):
    STUDENT = "STUDENT"
    PARENT = "PARENT"
    RC = "RC"
    WARDEN = "WARDEN"
    GATEKEEPER = "GATEKEEPER"
    MESS_STAFF = "MESS_STAFF"
    ADMIN = "ADMIN"

class OutpassStatus(str):
    DRAFT = "DRAFT"
    PENDING_PARENT = "PENDING_PARENT"
    PENDING_RC = "PENDING_RC"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"
    CANCELLED = "CANCELLED"
    ACTIVE = "ACTIVE"       # Exited through gate
    OVERDUE = "OVERDUE"     # Past return time
    RETURNED = "RETURNED"   # Re-entered gate
    CLOSED = "CLOSED"

class ConsentStatus(str):
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"

class MessTokenStatus(str):
    ISSUED = "ISSUED"
    REDEEMED = "REDEEMED"
    CANCELLED = "CANCELLED"
    EXPIRED = "EXPIRED"

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(120), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    full_name = Column(String(100), nullable=False)
    role = Column(String(20), nullable=False, default=UserRole.STUDENT)
    phone = Column(String(20), nullable=True)
    is_active = Column(Boolean, default=True)
    avatar_url = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    # Relationships with explicit foreign_keys to prevent ambiguity
    student_profile = relationship("Student", back_populates="user", uselist=False, foreign_keys="Student.user_id")
    parent_profile = relationship("Parent", back_populates="user", uselist=False, foreign_keys="Parent.user_id")
    rc_profile = relationship("RCProfile", back_populates="user", uselist=False, foreign_keys="RCProfile.user_id")
    notifications = relationship("Notification", back_populates="user", cascade="all, delete-orphan", foreign_keys="Notification.user_id")
    audit_logs = relationship("AuditLog", back_populates="user", foreign_keys="AuditLog.user_id")

class Hostel(Base):
    __tablename__ = "hostels"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    code = Column(String(20), unique=True, nullable=False)
    gender = Column(String(10), default="MALE")
    description = Column(String(255), nullable=True)

    blocks = relationship("Block", back_populates="hostel")
    students = relationship("Student", back_populates="hostel")

class Block(Base):
    __tablename__ = "blocks"

    id = Column(Integer, primary_key=True, index=True)
    hostel_id = Column(Integer, ForeignKey("hostels.id"), nullable=False)
    block_name = Column(String(50), nullable=False)
    total_floors = Column(Integer, default=4)

    hostel = relationship("Hostel", back_populates="blocks")
    rooms = relationship("Room", back_populates="block")
    rc_profiles = relationship("RCProfile", back_populates="block")
    students = relationship("Student", back_populates="block")

class Room(Base):
    __tablename__ = "rooms"

    id = Column(Integer, primary_key=True, index=True)
    block_id = Column(Integer, ForeignKey("blocks.id"), nullable=False)
    room_number = Column(String(20), nullable=False)
    floor_number = Column(Integer, nullable=False)
    capacity = Column(Integer, default=2)
    occupancy_count = Column(Integer, default=0)

    block = relationship("Block", back_populates="rooms")
    students = relationship("Student", back_populates="room")

class Parent(Base):
    __tablename__ = "parents"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True, nullable=False)
    emergency_contact = Column(String(20), nullable=True)
    relationship_type = Column(String(30), default="Father")

    user = relationship("User", back_populates="parent_profile", foreign_keys=[user_id])
    students = relationship("Student", back_populates="parent")

class RCProfile(Base):
    __tablename__ = "rc_profiles"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True, nullable=False)
    hostel_id = Column(Integer, ForeignKey("hostels.id"), nullable=True)
    block_id = Column(Integer, ForeignKey("blocks.id"), nullable=True)
    is_available = Column(Boolean, default=True) # Online/available for approvals
    on_duty = Column(Boolean, default=True)
    backup_rc_id = Column(Integer, ForeignKey("users.id"), nullable=True) # Fallback RC user_id
    workload_count = Column(Integer, default=0)

    user = relationship("User", back_populates="rc_profile", foreign_keys=[user_id])
    backup_rc = relationship("User", foreign_keys=[backup_rc_id])
    block = relationship("Block", back_populates="rc_profiles")

class Student(Base):
    __tablename__ = "students"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True, nullable=False)
    reg_number = Column(String(30), unique=True, index=True, nullable=False)
    hostel_id = Column(Integer, ForeignKey("hostels.id"), nullable=False)
    block_id = Column(Integer, ForeignKey("blocks.id"), nullable=False)
    room_id = Column(Integer, ForeignKey("rooms.id"), nullable=False)
    parent_id = Column(Integer, ForeignKey("parents.id"), nullable=True)
    assigned_rc_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    
    course = Column(String(50), default="B.Tech Computer Science")
    batch = Column(String(20), default="2022-2026")
    photo_url = Column(String(255), default="https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150")
    is_outside = Column(Boolean, default=False)
    current_outpass_id = Column(Integer, nullable=True)

    user = relationship("User", back_populates="student_profile", foreign_keys=[user_id])
    hostel = relationship("Hostel", back_populates="students")
    block = relationship("Block", back_populates="students")
    room = relationship("Room", back_populates="students")
    parent = relationship("Parent", back_populates="students", foreign_keys=[parent_id])
    assigned_rc = relationship("User", foreign_keys=[assigned_rc_id])
    outpasses = relationship("Outpass", back_populates="student", foreign_keys="Outpass.student_id")
    mess_tokens = relationship("MessToken", back_populates="student", foreign_keys="MessToken.student_id")
    complaints = relationship("Complaint", back_populates="student", foreign_keys="Complaint.student_id")
    fees = relationship("Fee", back_populates="student", foreign_keys="Fee.student_id")

class Outpass(Base):
    __tablename__ = "outpasses"

    id = Column(Integer, primary_key=True, index=True)
    outpass_code = Column(String(40), unique=True, index=True, nullable=False)
    student_id = Column(Integer, ForeignKey("students.id"), nullable=False)
    
    destination = Column(String(150), nullable=False)
    reason = Column(Text, nullable=False)
    outpass_type = Column(String(30), default="HOME") # HOME, LOCAL, EMERGENCY
    
    departure_time = Column(DateTime, nullable=False)
    expected_return_time = Column(DateTime, nullable=False)
    actual_exit_time = Column(DateTime, nullable=True)
    actual_return_time = Column(DateTime, nullable=True)
    
    status = Column(String(30), default=OutpassStatus.PENDING_PARENT, index=True)
    
    # Parent Consent
    parent_consent_status = Column(String(20), default=ConsentStatus.PENDING)
    parent_remarks = Column(String(255), nullable=True)
    parent_action_time = Column(DateTime, nullable=True)
    
    # RC Workflow & Fallback Routing
    assigned_rc_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    approved_by_rc_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    rc_remarks = Column(String(255), nullable=True)
    rc_action_time = Column(DateTime, nullable=True)
    is_fallback_routed = Column(Boolean, default=False)
    routing_log = Column(Text, nullable=True) # Audit trace of automatic hops
    
    # Digital Cryptographic QR Data
    qr_signature = Column(String(255), nullable=True)
    
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    student = relationship("Student", back_populates="outpasses", foreign_keys=[student_id])
    assigned_rc = relationship("User", foreign_keys=[assigned_rc_id])
    approved_by_rc = relationship("User", foreign_keys=[approved_by_rc_id])
    gate_events = relationship("GateEvent", back_populates="outpass", foreign_keys="GateEvent.outpass_id")

class GateEvent(Base):
    __tablename__ = "gate_events"

    id = Column(Integer, primary_key=True, index=True)
    outpass_id = Column(Integer, ForeignKey("outpasses.id"), nullable=False)
    student_id = Column(Integer, ForeignKey("students.id"), nullable=False)
    event_type = Column(String(20), nullable=False) # EXIT or RETURN
    gate_id = Column(String(50), default="MAIN_GATE_NORTH")
    scanned_by_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    timestamp = Column(DateTime, default=datetime.datetime.utcnow, nullable=False) # Server timestamp
    verification_method = Column(String(30), default="SECURE_QR_SCAN")
    notes = Column(String(255), nullable=True)

    outpass = relationship("Outpass", back_populates="gate_events", foreign_keys=[outpass_id])
    student = relationship("Student", foreign_keys=[student_id])
    scanned_by = relationship("User", foreign_keys=[scanned_by_id])

class Meal(Base):
    __tablename__ = "meals"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    category = Column(String(30), default="NON_VEG") # NON_VEG, SPECIAL_VEG, DIET
    description = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True)

    schedules = relationship("MealSchedule", back_populates="meal")

class MealSchedule(Base):
    __tablename__ = "meal_schedules"

    id = Column(Integer, primary_key=True, index=True)
    meal_id = Column(Integer, ForeignKey("meals.id"), nullable=False)
    meal_date = Column(String(20), nullable=False) # YYYY-MM-DD
    meal_time = Column(String(20), default="LUNCH") # LUNCH, DINNER
    total_capacity = Column(Integer, default=200)
    remaining_capacity = Column(Integer, default=200)
    cutoff_time = Column(DateTime, nullable=True)
    is_active = Column(Boolean, default=True)

    meal = relationship("Meal", back_populates="schedules", foreign_keys=[meal_id])
    tokens = relationship("MessToken", back_populates="schedule", foreign_keys="MessToken.schedule_id")

    __table_args__ = (
        UniqueConstraint('meal_id', 'meal_date', 'meal_time', name='uix_meal_date_time'),
    )

class MessToken(Base):
    __tablename__ = "mess_tokens"

    id = Column(Integer, primary_key=True, index=True)
    token_code = Column(String(50), unique=True, index=True, nullable=False)
    student_id = Column(Integer, ForeignKey("students.id"), nullable=False)
    schedule_id = Column(Integer, ForeignKey("meal_schedules.id"), nullable=False)
    
    status = Column(String(20), default=MessTokenStatus.ISSUED, index=True)
    qr_signature = Column(String(255), nullable=True)
    issued_at = Column(DateTime, default=datetime.datetime.utcnow)
    redeemed_at = Column(DateTime, nullable=True)
    redeemed_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    student = relationship("Student", back_populates="mess_tokens", foreign_keys=[student_id])
    schedule = relationship("MealSchedule", back_populates="tokens", foreign_keys=[schedule_id])
    redeemed_by = relationship("User", foreign_keys=[redeemed_by_id])

    __table_args__ = (
        UniqueConstraint('student_id', 'schedule_id', name='uix_student_schedule_token'),
    )

class Complaint(Base):
    __tablename__ = "complaints"

    id = Column(Integer, primary_key=True, index=True)
    complaint_code = Column(String(40), unique=True, index=True, nullable=False)
    student_id = Column(Integer, ForeignKey("students.id"), nullable=False)
    category = Column(String(50), nullable=False) # ELECTRICAL, PLUMBING, CLEANLINESS, INTERNET, FOOD, OTHER
    title = Column(String(120), nullable=False)
    description = Column(Text, nullable=False)
    location = Column(String(100), nullable=False) # Room 304 / Block A 2nd Floor
    priority = Column(String(20), default="MEDIUM") # LOW, MEDIUM, HIGH, EMERGENCY
    status = Column(String(30), default="SUBMITTED") # SUBMITTED, ASSIGNED, IN_PROGRESS, RESOLVED, CLOSED
    assigned_to_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    resolution_notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    resolved_at = Column(DateTime, nullable=True)

    student = relationship("Student", back_populates="complaints", foreign_keys=[student_id])
    assigned_to = relationship("User", foreign_keys=[assigned_to_id])

class Fee(Base):
    __tablename__ = "fees"

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, ForeignKey("students.id"), nullable=False)
    fee_type = Column(String(50), nullable=False) # HOSTEL_RENT, MESS_ADVANCE, MAINTENANCE, AMENITY
    amount = Column(Float, nullable=False)
    due_date = Column(DateTime, nullable=False)
    status = Column(String(20), default="UNPAID") # UNPAID, PAID, OVERDUE
    paid_at = Column(DateTime, nullable=True)
    payment_ref = Column(String(100), nullable=True)
    academic_term = Column(String(30), default="Autumn 2026")

    student = relationship("Student", back_populates="fees", foreign_keys=[student_id])

class Notification(Base):
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    title = Column(String(150), nullable=False)
    message = Column(Text, nullable=False)
    category = Column(String(30), default="SYSTEM") # OUTPASS, GATE, MESS, ATTENDANCE, COMPLAINT, FEE, ALERT
    priority = Column(String(20), default="INFO") # INFO, WARNING, CRITICAL
    link_url = Column(String(255), nullable=True)
    is_read = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    user = relationship("User", back_populates="notifications", foreign_keys=[user_id])

class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    actor_name = Column(String(100), nullable=False)
    actor_role = Column(String(30), nullable=False)
    action = Column(String(80), nullable=False) # e.g. OUTPASS_PARENT_APPROVED, GATE_EXIT_RECORDED
    entity_name = Column(String(50), nullable=False)
    entity_id = Column(String(50), nullable=False)
    old_state = Column(Text, nullable=True)
    new_state = Column(Text, nullable=True)
    details = Column(Text, nullable=True)
    ip_address = Column(String(50), default="127.0.0.1")
    timestamp = Column(DateTime, default=datetime.datetime.utcnow, index=True)

    user = relationship("User", back_populates="audit_logs", foreign_keys=[user_id])
