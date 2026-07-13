"""Migration: telemedicine doctors, video appointment type, telemedicine_visits table."""
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
        try:
            cur.execute(
                "ALTER TABLE doctors ADD COLUMN offers_telemedicine BOOLEAN NOT NULL DEFAULT FALSE"
            )
            print("Added doctors.offers_telemedicine")
        except pymysql.err.OperationalError as e:
            if e.args[0] == 1060:
                print("doctors.offers_telemedicine already exists")
            else:
                raise

        cur.execute(
            "ALTER TABLE appointments MODIFY COLUMN appointment_type "
            "ENUM('consultation','follow_up','emergency','routine','video') DEFAULT 'consultation'"
        )
        print("Updated appointments.appointment_type ENUM")

        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS telemedicine_visits (
                visit_id VARCHAR(64) PRIMARY KEY,
                appointment_id INT NULL,
                patient_id VARCHAR(50) NOT NULL,
                doctor_id INT NOT NULL,
                scheduled_at DATETIME NOT NULL,
                status ENUM('scheduled','in_progress','completed','cancelled') DEFAULT 'scheduled',
                fee DECIMAL(10,2) NULL,
                duration_minutes INT DEFAULT 30,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_patient (patient_id),
                INDEX idx_doctor (doctor_id),
                INDEX idx_scheduled (scheduled_at),
                INDEX idx_status (status)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            """
        )
        print("Ensured telemedicine_visits table")

        cur.execute(
            """
            UPDATE doctors SET offers_telemedicine = TRUE
            WHERE doctor_id IN (
                SELECT doctor_id FROM (
                    SELECT doctor_id FROM doctors
                    WHERE is_active = TRUE
                    ORDER BY doctor_id ASC
                    LIMIT 5
                ) AS tele_docs
            )
            """
        )
        print(f"Marked {cur.rowcount} doctor(s) for telemedicine")

        cur.execute(
            """
            UPDATE doctors SET offers_telemedicine = TRUE, is_available = TRUE
            WHERE LOWER(first_name) = 'ganesh'
              AND LOWER(last_name) = 'ch'
            """
        )
        if cur.rowcount:
            print(f"Ensured Dr Ganesh ch is telemedicine-enabled ({cur.rowcount} row)")

        conn.commit()
finally:
    conn.close()
