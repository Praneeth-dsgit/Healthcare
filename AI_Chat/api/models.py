from pydantic import BaseModel, Field, EmailStr, field_validator, model_validator
from typing import Optional, List, Dict, Any
from datetime import datetime, date
from enum import Enum

# Enums for type safety
class CapabilityType(str, Enum):
    GENERAL = "general"
    RADIOLOGY = "radiology"
    LAB = "lab"
    ENGAGEMENT = "engagement"

class GenderType(str, Enum):
    MALE = "male"
    FEMALE = "female"
    OTHER = "other"

class QueryType(str, Enum):
    DIAGNOSIS = "diagnosis"
    TREATMENT = "treatment"
    LAB = "lab"
    CHRONIC = "chronic"
    EMERGENCY = "emergency"
    GENERAL = "general"

# Base models for common fields
class TimestampMixin(BaseModel):
    timestamp: datetime = Field(default_factory=datetime.now)

# Patient Information Models
class PatientInfo(BaseModel):
    age: int = Field(..., ge=0, le=150, description="Patient age in years")
    weight: float = Field(..., ge=0, le=500, description="Patient weight in kg")
    height: float = Field(..., ge=0, le=300, description="Patient height in cm")
    gender: GenderType = Field(..., description="Patient gender")
    blood_pressure: Optional[str] = Field(None, max_length=50, description="Blood pressure reading")
    allergies: Optional[str] = Field(None, max_length=500, description="Known allergies")
    medications: Optional[str] = Field(None, max_length=1000, description="Current medications")
    medical_history: Optional[str] = Field(None, max_length=2000, description="Medical history")

    @field_validator('blood_pressure')
    @classmethod
    def validate_blood_pressure(cls, v):
        if v is not None:
            # Basic format validation for blood pressure (e.g., "120/80")
            if not v.replace('/', '').replace(' ', '').isdigit():
                raise ValueError('Blood pressure should be in format "systolic/diastolic"')
        return v

    @model_validator(mode='after')
    def validate_bmi(self):
        weight = self.weight
        height = self.height
        if weight and height and height > 0:
            bmi = weight / ((height / 100) ** 2)
            if bmi > 100:  # Unrealistic BMI
                raise ValueError('Invalid weight/height combination')
        return self

# Chat Message Models
class ChatMessage(BaseModel):
    role: str = Field(..., pattern='^(user|assistant)$', description="Message role")
    content: str = Field(..., min_length=1, max_length=10000, description="Message content")
    timestamp: datetime = Field(default_factory=datetime.now)
    patient_info: Optional[PatientInfo] = None
    file_url: Optional[str] = None
    file_type: Optional[str] = None
    file_name: Optional[str] = None

class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=5000, description="User message")
    user_email: Optional[str] = Field(None, description="User email for session tracking")
    patient_id: Optional[str] = Field(None, max_length=64, description="Patient ID to load profile and records from database")
    patient_info: Optional[PatientInfo] = None
    file_context: Optional[Dict[str, Any]] = None
    file_findings: Optional[str] = None
    previous_ai_message: Optional[str] = None
    reset_message: Optional[str] = None
    capability: CapabilityType = Field(default=CapabilityType.GENERAL)
    session_id: Optional[str] = Field(None, max_length=100)

    @field_validator('message')
    @classmethod
    def validate_message_length(cls, v):
        if len(v.strip()) == 0:
            raise ValueError('Message cannot be empty')
        return v.strip()

# File Upload Models
class FileUploadRequest(BaseModel):
    session_id: str = Field(..., min_length=1, max_length=100)
    capability: CapabilityType = Field(..., description="AI capability for file processing")

class FileUploadResponse(BaseModel):
    success: bool
    result: Optional[str] = None
    error: Optional[str] = None
    file_name: Optional[str] = None
    file_type: Optional[str] = None

# User Authentication Models
class UserSignup(BaseModel):
    email: EmailStr = Field(..., description="User email address")
    password: str = Field(..., min_length=8, max_length=128, description="User password")

    @field_validator('password')
    @classmethod
    def validate_password_strength(cls, v):
        if len(v) < 8:
            raise ValueError('Password must be at least 8 characters long')
        if not any(c.isupper() for c in v):
            raise ValueError('Password must contain at least one uppercase letter')
        if not any(c.islower() for c in v):
            raise ValueError('Password must contain at least one lowercase letter')
        if not any(c.isdigit() for c in v):
            raise ValueError('Password must contain at least one digit')
        return v

class UserLogin(BaseModel):
    email: EmailStr = Field(..., description="User email address")
    password: str = Field(..., min_length=1, description="User password")

class OTPVerification(BaseModel):
    email: EmailStr = Field(..., description="User email address")
    otp: str = Field(..., pattern='^[0-9]{6}$', description="6-digit OTP code")

# Patient Engagement Models
class AppointmentReminder(BaseModel):
    patient_email: EmailStr = Field(..., description="Patient email address")
    appointment_date: date = Field(..., description="Appointment date")
    appointment_time: str = Field(..., pattern='^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$', description="Appointment time (HH:MM)")
    doctor_name: str = Field(..., min_length=1, max_length=100, description="Doctor name")
    appointment_type: str = Field(..., min_length=1, max_length=100, description="Type of appointment")

class MedicationReminder(BaseModel):
    patient_email: EmailStr = Field(..., description="Patient email address")
    medication_name: str = Field(..., min_length=1, max_length=100, description="Medication name")
    dosage: str = Field(..., min_length=1, max_length=50, description="Medication dosage")
    frequency: str = Field(..., min_length=1, max_length=50, description="Medication frequency")
    next_dose_time: datetime = Field(..., description="Next dose time")

class NotificationRequest(BaseModel):
    recipient_email: EmailStr = Field(..., description="Recipient email address")
    subject: str = Field(..., min_length=1, max_length=200, description="Email subject")
    message: str = Field(..., min_length=1, max_length=2000, description="Email message")
    notification_type: str = Field(..., pattern='^(appointment|medication|general)$', description="Type of notification")

# Response Models
class APIResponse(BaseModel):
    success: bool = Field(..., description="Request success status")
    message: str = Field(..., description="Response message")
    data: Optional[Dict[str, Any]] = None
    error: Optional[str] = None

class ChatResponse(BaseModel):
    success: bool
    message: str
    ai_response: Optional[str] = None
    query_type: Optional[QueryType] = None
    capability_used: Optional[CapabilityType] = None

# Health Check Model
class HealthCheck(BaseModel):
    status: str = Field(..., description="Service status")
    timestamp: datetime = Field(default_factory=datetime.now)
    version: str = Field(default="1.0.0", description="API version")
    uptime: Optional[float] = Field(None, description="Service uptime in seconds")

# Example usage and validation functions
def validate_patient_data(data: Dict[str, Any]) -> PatientInfo:
    """Validate patient data using Pydantic"""
    try:
        return PatientInfo(**data)
    except Exception as e:
        raise ValueError(f"Invalid patient data: {str(e)}")

def validate_chat_request(data: Dict[str, Any]) -> ChatRequest:
    """Validate chat request using Pydantic"""
    try:
        return ChatRequest(**data)
    except Exception as e:
        raise ValueError(f"Invalid chat request: {str(e)}")

def validate_file_upload(data: Dict[str, Any]) -> FileUploadRequest:
    """Validate file upload request using Pydantic"""
    try:
        return FileUploadRequest(**data)
    except Exception as e:
        raise ValueError(f"Invalid file upload request: {str(e)}")

# Custom validators for healthcare-specific data
class HealthcareValidator:
    @staticmethod
    def validate_bmi(weight: float, height: float) -> float:
        """Calculate and validate BMI"""
        if height <= 0:
            raise ValueError("Height must be positive")
        bmi = weight / ((height / 100) ** 2)
        if bmi < 10 or bmi > 100:
            raise ValueError(f"BMI {bmi:.1f} is outside normal range (10-100)")
        return bmi

    @staticmethod
    def validate_blood_pressure(systolic: int, diastolic: int) -> bool:
        """Validate blood pressure readings"""
        if systolic < 70 or systolic > 300:
            raise ValueError(f"Systolic pressure {systolic} is outside normal range (70-300)")
        if diastolic < 40 or diastolic > 200:
            raise ValueError(f"Diastolic pressure {diastolic} is outside normal range (40-200)")
        if systolic <= diastolic:
            raise ValueError("Systolic pressure must be greater than diastolic pressure")
        return True

    @staticmethod
    def validate_age_for_capability(age: int, capability: CapabilityType) -> bool:
        """Validate age appropriateness for medical capability"""
        if capability == CapabilityType.RADIOLOGY and age < 0:
            raise ValueError("Age cannot be negative for radiology analysis")
        if capability == CapabilityType.LAB and age > 150:
            raise ValueError("Age seems unrealistic for lab analysis")
        return True 