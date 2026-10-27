import hmac
import hashlib
import json
import base64
import datetime
import bcrypt
from typing import Optional, List
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from sqlalchemy.orm import Session
from .config import settings
from .database import get_db
from . import models

oauth2_scheme = OAuth2PasswordBearer(tokenUrl=f"{settings.API_V1_STR}/auth/token")

def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        # Truncate to 72 bytes max for bcrypt security standard
        pwd_bytes = plain_password[:72].encode('utf-8')
        hashed_bytes = hashed_password.encode('utf-8')
        return bcrypt.checkpw(pwd_bytes, hashed_bytes)
    except Exception:
        return False

def get_password_hash(password: str) -> str:
    pwd_bytes = password[:72].encode('utf-8')
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(pwd_bytes, salt).decode('utf-8')

def create_access_token(data: dict, expires_delta: Optional[datetime.timedelta] = None) -> str:
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.datetime.utcnow() + expires_delta
    else:
        expire = datetime.datetime.utcnow() + datetime.timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return encoded_jwt

# Cryptographic QR Token Signer & Verifier for Outpasses and Mess Tokens
def generate_signed_qr_payload(data: dict) -> str:
    """
    Generates a tamper-proof cryptographically signed payload for QR code rendering.
    Payload includes JSON payload + HMAC-SHA256 signature.
    """
    payload_str = json.dumps(data, sort_keys=True, separators=(',', ':'))
    signature = hmac.new(
        settings.SECRET_KEY.encode('utf-8'),
        payload_str.encode('utf-8'),
        hashlib.sha256
    ).hexdigest()
    
    combined = {
        "d": data,
        "sig": signature[:32] # 32-char compact cryptographic MAC
    }
    raw_bytes = json.dumps(combined).encode('utf-8')
    return base64.urlsafe_b64encode(raw_bytes).decode('utf-8')

def normalize_qr_payload(qr_string: str) -> str:
    """Normalise harmless Base64 transport changes made by QR scanners."""
    normalized_qr = "".join(qr_string.split())
    return normalized_qr + "=" * (-len(normalized_qr) % 4)

def verify_signed_qr_payload(qr_string: str) -> dict:
    """
    Decodes and verifies HMAC signature on a scanned QR token.
    Raises HTTPException(400) if manipulated or signature mismatch.
    """
    try:
        # Camera scanners commonly omit Base64 padding or insert line breaks.
        # Normalise only transport formatting; the HMAC still protects contents.
        normalized_qr = normalize_qr_payload(qr_string)
        raw_bytes = base64.urlsafe_b64decode(normalized_qr.encode('ascii'))
        combined = json.loads(raw_bytes.decode('utf-8'))
        data = combined.get("d")
        sig = combined.get("sig")
        
        payload_str = json.dumps(data, sort_keys=True, separators=(',', ':'))
        expected_sig = hmac.new(
            settings.SECRET_KEY.encode('utf-8'),
            payload_str.encode('utf-8'),
            hashlib.sha256
        ).hexdigest()[:32]
        
        if not hmac.compare_digest(sig, expected_sig):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Security Alert: Invalid cryptographic QR signature (tampered pass)"
            )
        return data
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Malformed or unreadable QR code"
        )

# Authentication & RBAC Dependencies
def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> models.User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        user_id_str: str = payload.get("sub")
        if user_id_str is None:
            raise credentials_exception
        user_id = int(user_id_str)
    except JWTError:
        raise credentials_exception
    
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if user is None or not user.is_active:
        raise HTTPException(status_code=403, detail="Inactive or non-existent user")
    return user

def require_roles(allowed_roles: List[str]):
    def role_checker(current_user: models.User = Depends(get_current_user)):
        if current_user.role not in allowed_roles and current_user.role != models.UserRole.ADMIN:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied: User role '{current_user.role}' is not authorized for this resource"
            )
        return current_user
    return role_checker
