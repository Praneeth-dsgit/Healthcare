-- ============================================================================
-- Healthcare Application - Optimized Database Schema
-- Patient ID Centric Design with Proper Relationships
-- ============================================================================

-- Drop existing tables if needed (in reverse dependency order)
-- SET FOREIGN_KEY_CHECKS = 0;
-- DROP TABLE IF EXISTS payments;
-- DROP TABLE IF EXISTS billing;
-- DROP TABLE IF EXISTS ai_chat_history;
-- DROP TABLE IF EXISTS medical_records;
-- DROP TABLE IF EXISTS radiology_bookings;
-- DROP TABLE IF EXISTS appointments;
-- DROP TABLE IF EXISTS family_members;
-- DROP TABLE IF EXISTS doctor_facilities;
-- DROP TABLE IF EXISTS facilities;
-- DROP TABLE IF EXISTS doctors;
-- DROP TABLE IF EXISTS specialties;
-- DROP TABLE IF EXISTS patients;
-- DROP TABLE IF EXISTS users;
-- SET FOREIGN_KEY_CHECKS = 1;

-- ============================================================================
-- 1. USER AUTHENTICATION TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    is_verified BOOLEAN DEFAULT FALSE NOT NULL,
    role VARCHAR(50) NULL COMMENT 'admin, doctor, radiology, lab_technician, non_medical_staff',
    otp VARCHAR(6),
    otp_expiry INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    last_login TIMESTAMP NULL,
    INDEX idx_email (email),
    INDEX idx_verified (is_verified),
    INDEX idx_role (role)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- 2. PATIENTS TABLE (Central Entity - Patient ID is Primary Key)
-- ============================================================================
CREATE TABLE IF NOT EXISTS patients (
    patient_id VARCHAR(50) PRIMARY KEY COMMENT 'Globally unique Patient ID',
    user_id INT UNIQUE,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    date_of_birth DATE NOT NULL,
    gender ENUM('male', 'female', 'other') NOT NULL,
    phone VARCHAR(20),
    email VARCHAR(255),
    address TEXT,
    city VARCHAR(100),
    state VARCHAR(100),
    zip_code VARCHAR(20),
    country VARCHAR(100) DEFAULT 'India',
    blood_type VARCHAR(10),
    height_cm DECIMAL(5,2),
    weight_kg DECIMAL(5,2),
    bmi DECIMAL(4,2),
    emergency_contact_name VARCHAR(200),
    emergency_contact_phone VARCHAR(20),
    emergency_contact_relation VARCHAR(50),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_user_id (user_id),
    INDEX idx_email (email),
    INDEX idx_phone (phone),
    INDEX idx_name (first_name, last_name),
    INDEX idx_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- 3. FAMILY MEMBERS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS family_members (
    family_member_id INT AUTO_INCREMENT PRIMARY KEY,
    primary_patient_id VARCHAR(50) NOT NULL COMMENT 'Links to main patient account',
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    date_of_birth DATE NOT NULL,
    gender ENUM('male', 'female', 'other') NOT NULL,
    relationship ENUM('self', 'spouse', 'child', 'parent', 'sibling', 'other') NOT NULL,
    phone VARCHAR(20),
    email VARCHAR(255),
    blood_type VARCHAR(10),
    height_cm DECIMAL(5,2),
    weight_kg DECIMAL(5,2),
    medical_history TEXT,
    allergies TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (primary_patient_id) REFERENCES patients(patient_id) ON DELETE CASCADE,
    INDEX idx_primary_patient (primary_patient_id),
    INDEX idx_relationship (relationship),
    INDEX idx_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- 4. SPECIALTIES TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS specialties (
    specialty_id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    category VARCHAR(50) COMMENT 'e.g., General, Surgical, Diagnostic',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_name (name),
    INDEX idx_category (category)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- 5. DOCTORS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS doctors (
    doctor_id INT AUTO_INCREMENT PRIMARY KEY,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    specialty_id INT NOT NULL,
    qualification TEXT COMMENT 'MD, MBBS, etc.',
    experience_years INT DEFAULT 0,
    consultation_fee DECIMAL(10,2),
    phone VARCHAR(20),
    email VARCHAR(255),
    bio TEXT,
    profile_image_url VARCHAR(500),
    is_available BOOLEAN DEFAULT TRUE,
    offers_telemedicine BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (specialty_id) REFERENCES specialties(specialty_id) ON DELETE RESTRICT,
    INDEX idx_specialty (specialty_id),
    INDEX idx_name (first_name, last_name),
    INDEX idx_available (is_available),
    INDEX idx_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- 6. FACILITIES TABLE (Hospitals/Clinics)
-- ============================================================================
CREATE TABLE IF NOT EXISTS facilities (
    facility_id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    type ENUM('hospital', 'clinic', 'diagnostic_center', 'pharmacy', 'other') NOT NULL,
    address TEXT NOT NULL,
    city VARCHAR(100),
    state VARCHAR(100),
    zip_code VARCHAR(20),
    country VARCHAR(100) DEFAULT 'India',
    phone VARCHAR(20),
    email VARCHAR(255),
    website VARCHAR(255),
    services_offered TEXT COMMENT 'JSON or comma-separated list',
    operating_hours JSON COMMENT 'Structured hours data',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_name (name),
    INDEX idx_type (type),
    INDEX idx_city (city),
    INDEX idx_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- 7. DOCTOR-FACILITY RELATIONSHIP (Many-to-Many)
-- ============================================================================
CREATE TABLE IF NOT EXISTS doctor_facilities (
    doctor_facility_id INT AUTO_INCREMENT PRIMARY KEY,
    doctor_id INT NOT NULL,
    facility_id INT NOT NULL,
    consultation_fee DECIMAL(10,2) COMMENT 'Fee at this specific facility',
    available_days JSON COMMENT 'Days of week: ["Monday", "Wednesday", "Friday"]',
    available_time_slots JSON COMMENT 'Time slots: {"start": "09:00", "end": "17:00"}',
    is_primary BOOLEAN DEFAULT FALSE COMMENT 'Primary facility for this doctor',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (doctor_id) REFERENCES doctors(doctor_id) ON DELETE CASCADE,
    FOREIGN KEY (facility_id) REFERENCES facilities(facility_id) ON DELETE CASCADE,
    UNIQUE KEY unique_doctor_facility (doctor_id, facility_id),
    INDEX idx_doctor (doctor_id),
    INDEX idx_facility (facility_id),
    INDEX idx_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- 8. APPOINTMENTS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS appointments (
    appointment_id INT AUTO_INCREMENT PRIMARY KEY,
    patient_id VARCHAR(50) NOT NULL COMMENT 'Primary patient or family member',
    family_member_id INT NULL COMMENT 'If booking for family member',
    doctor_id INT NOT NULL,
    facility_id INT NOT NULL,
    appointment_date DATE NOT NULL,
    appointment_time TIME NOT NULL,
    appointment_type ENUM('consultation', 'follow_up', 'emergency', 'routine', 'video') DEFAULT 'consultation',
    reason TEXT,
    status ENUM('scheduled', 'confirmed', 'completed', 'cancelled', 'no_show', 'rescheduled') DEFAULT 'scheduled',
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    cancelled_at TIMESTAMP NULL,
    cancellation_reason TEXT,
    FOREIGN KEY (patient_id) REFERENCES patients(patient_id) ON DELETE CASCADE,
    FOREIGN KEY (family_member_id) REFERENCES family_members(family_member_id) ON DELETE SET NULL,
    FOREIGN KEY (doctor_id) REFERENCES doctors(doctor_id) ON DELETE RESTRICT,
    FOREIGN KEY (facility_id) REFERENCES facilities(facility_id) ON DELETE RESTRICT,
    INDEX idx_patient (patient_id),
    INDEX idx_family_member (family_member_id),
    INDEX idx_doctor (doctor_id),
    INDEX idx_facility (facility_id),
    INDEX idx_date_time (appointment_date, appointment_time),
    INDEX idx_status (status),
    INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- 9. RADIOLOGY BOOKINGS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS radiology_bookings (
    booking_id INT AUTO_INCREMENT PRIMARY KEY,
    patient_id VARCHAR(50) NOT NULL,
    family_member_id INT NULL,
    facility_id INT NOT NULL COMMENT 'Diagnostic center',
    scan_type ENUM('mri', 'ct', 'xray', 'ultrasound', 'mammography', 'pet_scan', 'other') NOT NULL,
    body_part VARCHAR(100) COMMENT 'e.g., Head, Chest, Abdomen',
    appointment_date DATE NOT NULL,
    appointment_time TIME NOT NULL,
    referring_doctor_id INT NULL COMMENT 'Doctor who referred this scan',
    reason TEXT,
    status ENUM('scheduled', 'completed', 'cancelled', 'rescheduled') DEFAULT 'scheduled',
    report_available BOOLEAN DEFAULT FALSE,
    report_url VARCHAR(500),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (patient_id) REFERENCES patients(patient_id) ON DELETE CASCADE,
    FOREIGN KEY (family_member_id) REFERENCES family_members(family_member_id) ON DELETE SET NULL,
    FOREIGN KEY (facility_id) REFERENCES facilities(facility_id) ON DELETE RESTRICT,
    FOREIGN KEY (referring_doctor_id) REFERENCES doctors(doctor_id) ON DELETE SET NULL,
    INDEX idx_patient (patient_id),
    INDEX idx_family_member (family_member_id),
    INDEX idx_facility (facility_id),
    INDEX idx_scan_type (scan_type),
    INDEX idx_date_time (appointment_date, appointment_time),
    INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- 10. MEDICAL RECORDS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS medical_records (
    record_id INT AUTO_INCREMENT PRIMARY KEY,
    patient_id VARCHAR(50) NOT NULL,
    family_member_id INT NULL,
    record_type ENUM('prescription', 'lab_report', 'radiology_report', 'visit_summary', 'discharge_summary', 'other') NOT NULL,
    title VARCHAR(200) NOT NULL,
    description TEXT,
    file_path VARCHAR(500),
    file_type VARCHAR(50),
    file_size INT COMMENT 'Size in bytes',
    visit_date DATE,
    doctor_id INT NULL,
    facility_id INT NULL,
    appointment_id INT NULL,
    radiology_booking_id INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (patient_id) REFERENCES patients(patient_id) ON DELETE CASCADE,
    FOREIGN KEY (family_member_id) REFERENCES family_members(family_member_id) ON DELETE SET NULL,
    FOREIGN KEY (doctor_id) REFERENCES doctors(doctor_id) ON DELETE SET NULL,
    FOREIGN KEY (facility_id) REFERENCES facilities(facility_id) ON DELETE SET NULL,
    FOREIGN KEY (appointment_id) REFERENCES appointments(appointment_id) ON DELETE SET NULL,
    FOREIGN KEY (radiology_booking_id) REFERENCES radiology_bookings(booking_id) ON DELETE SET NULL,
    INDEX idx_patient (patient_id),
    INDEX idx_family_member (family_member_id),
    INDEX idx_record_type (record_type),
    INDEX idx_visit_date (visit_date),
    INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- 11. BILLING TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS billing (
    bill_id INT AUTO_INCREMENT PRIMARY KEY,
    bill_number VARCHAR(50) UNIQUE NOT NULL COMMENT 'Unique bill number',
    patient_id VARCHAR(50) NOT NULL,
    family_member_id INT NULL,
    bill_type ENUM('consultation', 'radiology', 'lab', 'pharmacy', 'other') NOT NULL,
    appointment_id INT NULL,
    radiology_booking_id INT NULL,
    facility_id INT NOT NULL,
    subtotal DECIMAL(10,2) NOT NULL,
    tax_amount DECIMAL(10,2) DEFAULT 0.00,
    discount_amount DECIMAL(10,2) DEFAULT 0.00,
    total_amount DECIMAL(10,2) NOT NULL,
    status ENUM('pending', 'paid', 'partially_paid', 'cancelled', 'refunded') DEFAULT 'pending',
    due_date DATE,
    paid_date DATE NULL,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (patient_id) REFERENCES patients(patient_id) ON DELETE CASCADE,
    FOREIGN KEY (family_member_id) REFERENCES family_members(family_member_id) ON DELETE SET NULL,
    FOREIGN KEY (appointment_id) REFERENCES appointments(appointment_id) ON DELETE SET NULL,
    FOREIGN KEY (radiology_booking_id) REFERENCES radiology_bookings(booking_id) ON DELETE SET NULL,
    FOREIGN KEY (facility_id) REFERENCES facilities(facility_id) ON DELETE RESTRICT,
    INDEX idx_patient (patient_id),
    INDEX idx_bill_number (bill_number),
    INDEX idx_status (status),
    INDEX idx_due_date (due_date),
    INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- 12. PAYMENTS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS payments (
    payment_id INT AUTO_INCREMENT PRIMARY KEY,
    bill_id INT NOT NULL,
    patient_id VARCHAR(50) NOT NULL,
    payment_method ENUM('cash', 'card', 'upi', 'netbanking', 'wallet', 'other') NOT NULL,
    payment_amount DECIMAL(10,2) NOT NULL,
    transaction_id VARCHAR(100) UNIQUE,
    payment_status ENUM('pending', 'completed', 'failed', 'refunded') DEFAULT 'pending',
    payment_date TIMESTAMP NULL,
    payment_gateway VARCHAR(50),
    gateway_response TEXT COMMENT 'JSON response from payment gateway',
    refund_amount DECIMAL(10,2) DEFAULT 0.00,
    refund_date TIMESTAMP NULL,
    refund_reason TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (bill_id) REFERENCES billing(bill_id) ON DELETE RESTRICT,
    FOREIGN KEY (patient_id) REFERENCES patients(patient_id) ON DELETE CASCADE,
    INDEX idx_bill (bill_id),
    INDEX idx_patient (patient_id),
    INDEX idx_transaction (transaction_id),
    INDEX idx_status (payment_status),
    INDEX idx_payment_date (payment_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- 13. AI CHAT HISTORY TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS ai_chat_history (
    chat_id INT AUTO_INCREMENT PRIMARY KEY,
    patient_id VARCHAR(50) NOT NULL,
    session_id VARCHAR(100) NOT NULL,
    user_message TEXT NOT NULL,
    ai_response TEXT NOT NULL,
    capability ENUM('general', 'radiology', 'lab', 'engagement') DEFAULT 'general',
    message_type ENUM('question', 'home_remedy', 'general_health') DEFAULT 'question',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (patient_id) REFERENCES patients(patient_id) ON DELETE CASCADE,
    INDEX idx_patient (patient_id),
    INDEX idx_session (session_id),
    INDEX idx_capability (capability),
    INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- 14. ADMISSIONS TABLE (for existing hospital records)
-- ============================================================================
CREATE TABLE IF NOT EXISTS admissions (
    admission_id INT AUTO_INCREMENT PRIMARY KEY,
    patient_id VARCHAR(50) NOT NULL,
    facility_id INT NOT NULL,
    admit_date DATE NOT NULL,
    discharge_date DATE NULL,
    diagnosis TEXT,
    room_number VARCHAR(50),
    doctor_id INT NULL,
    status ENUM('admitted', 'discharged', 'transferred') DEFAULT 'admitted',
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (patient_id) REFERENCES patients(patient_id) ON DELETE CASCADE,
    FOREIGN KEY (facility_id) REFERENCES facilities(facility_id) ON DELETE RESTRICT,
    FOREIGN KEY (doctor_id) REFERENCES doctors(doctor_id) ON DELETE SET NULL,
    INDEX idx_patient (patient_id),
    INDEX idx_facility (facility_id),
    INDEX idx_admit_date (admit_date),
    INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- INSERT DEFAULT DATA
-- ============================================================================

-- Insert default specialties
INSERT INTO specialties (name, description, category) VALUES
('General Medicine', 'General medical consultation and treatment', 'General'),
('Cardiology', 'Heart and cardiovascular system', 'General'),
('Orthopedics', 'Bones, joints, and musculoskeletal system', 'Surgical'),
('Radiology', 'Medical imaging and diagnostics', 'Diagnostic'),
('Neurology', 'Brain and nervous system', 'General'),
('Pediatrics', 'Child healthcare', 'General'),
('Gynecology', 'Women\'s health', 'General'),
('Dermatology', 'Skin, hair, and nails', 'General'),
('Oncology', 'Cancer treatment', 'General'),
('Psychiatry', 'Mental health', 'General')
ON DUPLICATE KEY UPDATE name=name;

-- ============================================================================
-- VIEWS FOR COMMON QUERIES
-- ============================================================================

-- View: Patient with User Info
CREATE OR REPLACE VIEW v_patient_user AS
SELECT 
    p.patient_id,
    p.user_id,
    u.email,
    p.first_name,
    p.last_name,
    p.date_of_birth,
    p.gender,
    p.phone,
    p.email as patient_email,
    p.is_active,
    u.is_verified,
    p.created_at
FROM patients p
LEFT JOIN users u ON p.user_id = u.id;

-- View: Doctor with Specialty
CREATE OR REPLACE VIEW v_doctor_specialty AS
SELECT 
    d.doctor_id,
    d.first_name,
    d.last_name,
    CONCAT(d.first_name, ' ', d.last_name) as full_name,
    s.name as specialty_name,
    s.category as specialty_category,
    d.qualification,
    d.experience_years,
    d.consultation_fee,
    d.is_available,
    d.is_active
FROM doctors d
INNER JOIN specialties s ON d.specialty_id = s.specialty_id;

-- View: Upcoming Appointments
CREATE OR REPLACE VIEW v_upcoming_appointments AS
SELECT 
    a.appointment_id,
    a.patient_id,
    p.first_name as patient_first_name,
    p.last_name as patient_last_name,
    a.family_member_id,
    fm.first_name as family_member_first_name,
    fm.last_name as family_member_last_name,
    d.doctor_id,
    CONCAT(d.first_name, ' ', d.last_name) as doctor_name,
    s.name as specialty,
    f.name as facility_name,
    a.appointment_date,
    a.appointment_time,
    a.appointment_type,
    a.status
FROM appointments a
INNER JOIN patients p ON a.patient_id = p.patient_id
LEFT JOIN family_members fm ON a.family_member_id = fm.family_member_id
INNER JOIN doctors d ON a.doctor_id = d.doctor_id
INNER JOIN specialties s ON d.specialty_id = s.specialty_id
INNER JOIN facilities f ON a.facility_id = f.facility_id
WHERE a.appointment_date >= CURDATE()
AND a.status IN ('scheduled', 'confirmed')
ORDER BY a.appointment_date, a.appointment_time;

-- ============================================================================
-- 15. EMPLOYEES TABLE (for admin, lab_technician, non_medical_staff, etc.)
-- ============================================================================
CREATE TABLE IF NOT EXISTS employees (
    employee_id VARCHAR(50) PRIMARY KEY COMMENT 'Globally unique Employee ID',
    user_id INT UNIQUE,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    role VARCHAR(50) NOT NULL COMMENT 'admin, doctor, lab_technician, non_medical_staff, radiology',
    email VARCHAR(255),
    phone VARCHAR(20),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_user_id (user_id),
    INDEX idx_email (email),
    INDEX idx_role (role),
    INDEX idx_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- 16. NOTIFICATIONS TABLE (for in-app notifications to patients)
-- ============================================================================
CREATE TABLE IF NOT EXISTS notifications (
    notification_id INT AUTO_INCREMENT PRIMARY KEY,
    patient_id VARCHAR(50),
    notification_type VARCHAR(50) COMMENT 'appointment_update, appointment_status, medication_reminder, etc.',
    title VARCHAR(255),
    message TEXT,
    is_read BOOLEAN DEFAULT FALSE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (patient_id) REFERENCES patients(patient_id) ON DELETE CASCADE,
    INDEX idx_patient_id (patient_id),
    INDEX idx_notification_type (notification_type),
    INDEX idx_is_read (is_read),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- END OF SCHEMA
-- ============================================================================

