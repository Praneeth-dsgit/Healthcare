"""Migration: referrals, attached records, and patient consent requests."""
import os
from dotenv import load_dotenv
import pymysql

load_dotenv()

conn = pymysql.connect(
    host=os.getenv('MYSQL_HOST', 'localhost'),
    port=int(os.getenv('MYSQL_PORT', '3306')),
    user=os.getenv('MYSQL_USER', 'root'),
    password=os.getenv('MYSQL_PASSWORD', ''),
    database=os.getenv('MYSQL_DATABASE', 'medchat_db'),
)
try:
    with conn.cursor() as cur:
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS referrals (
                referral_id INT AUTO_INCREMENT PRIMARY KEY,
                from_doctor_id INT NOT NULL,
                to_doctor_id INT NOT NULL,
                patient_id VARCHAR(50) NOT NULL,
                specialty VARCHAR(100),
                urgency ENUM('routine', 'urgent', 'emergency') NOT NULL DEFAULT 'routine',
                status ENUM(
                    'draft', 'pending_consent', 'pending', 'accepted',
                    'rejected', 'completed', 'more_info'
                ) NOT NULL DEFAULT 'pending',
                consent_status ENUM('pending', 'approved', 'declined') NOT NULL DEFAULT 'approved',
                clinical_notes TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (from_doctor_id) REFERENCES doctors(doctor_id) ON DELETE RESTRICT,
                FOREIGN KEY (to_doctor_id) REFERENCES doctors(doctor_id) ON DELETE RESTRICT,
                FOREIGN KEY (patient_id) REFERENCES patients(patient_id) ON DELETE CASCADE,
                INDEX idx_from_doctor (from_doctor_id),
                INDEX idx_to_doctor (to_doctor_id),
                INDEX idx_patient (patient_id),
                INDEX idx_status (status),
                INDEX idx_created (created_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            """
        )
        print("Ensured referrals table")

        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS referral_medical_records (
                referral_id INT NOT NULL,
                record_id INT NOT NULL,
                PRIMARY KEY (referral_id, record_id),
                FOREIGN KEY (referral_id) REFERENCES referrals(referral_id) ON DELETE CASCADE,
                FOREIGN KEY (record_id) REFERENCES medical_records(record_id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            """
        )
        print("Ensured referral_medical_records table")

        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS referral_consent_requests (
                consent_id INT AUTO_INCREMENT PRIMARY KEY,
                referral_id INT NOT NULL,
                patient_id VARCHAR(50) NOT NULL,
                title VARCHAR(255) NOT NULL,
                message TEXT,
                status ENUM('pending', 'approved', 'declined') NOT NULL DEFAULT 'pending',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                responded_at DATETIME NULL,
                FOREIGN KEY (referral_id) REFERENCES referrals(referral_id) ON DELETE CASCADE,
                FOREIGN KEY (patient_id) REFERENCES patients(patient_id) ON DELETE CASCADE,
                INDEX idx_patient (patient_id),
                INDEX idx_status (status),
                INDEX idx_referral (referral_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            """
        )
        print("Ensured referral_consent_requests table")

        conn.commit()
finally:
    conn.close()
