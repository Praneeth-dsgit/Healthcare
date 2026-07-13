"""Enable Dr Ganesh for telemedicine and print booking details."""
import os
import sys

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
            SELECT doctor_id, first_name, last_name, email, is_active,
                   COALESCE(offers_telemedicine, 0) AS offers_telemedicine
            FROM doctors
            WHERE LOWER(first_name) LIKE %s
               OR LOWER(last_name) LIKE %s
               OR LOWER(CONCAT(first_name, ' ', last_name)) LIKE %s
            """,
            ('%ganesh%', '%ganesh%', '%ganesh%'),
        )
        doctors = cur.fetchall()
        print('Matching doctors:', doctors)

        if not doctors:
            cur.execute(
                """
                SELECT doctor_id, first_name, last_name, email, is_active,
                       COALESCE(offers_telemedicine, 0)
                FROM doctors
                WHERE LOWER(last_name) LIKE %s OR LOWER(email) LIKE %s
                """,
                ('%ch%', '%ganesh%'),
            )
            doctors = cur.fetchall()
            print('Fallback search (ch/ganesh):', doctors)

        if not doctors:
            print('ERROR: No doctor found matching Ganesh. Listing all doctors:')
            cur.execute(
                'SELECT doctor_id, first_name, last_name, email FROM doctors ORDER BY doctor_id LIMIT 20'
            )
            for row in cur.fetchall():
                print(' ', row)
            sys.exit(1)

        doctor_id = doctors[0][0]
        cur.execute(
            'UPDATE doctors SET offers_telemedicine = TRUE, is_available = TRUE WHERE doctor_id = %s',
            (doctor_id,),
        )
        conn.commit()
        print(f'Enabled telemedicine for doctor_id={doctor_id}')

        cur.execute(
            """
            SELECT d.doctor_id, d.first_name, d.last_name, d.email, d.offers_telemedicine,
                   s.name AS specialty, f.facility_id, f.name AS facility_name
            FROM doctors d
            LEFT JOIN specialties s ON d.specialty_id = s.specialty_id
            LEFT JOIN doctor_facilities df ON d.doctor_id = df.doctor_id AND df.is_primary = TRUE
            LEFT JOIN facilities f ON df.facility_id = f.facility_id
            WHERE d.doctor_id = %s
            """,
            (doctor_id,),
        )
        info = cur.fetchone()
        print('Doctor info:', info)

        cur.execute(
            "SELECT id, email, role FROM users WHERE LOWER(email) = LOWER(%s)",
            (info[3] or '',),
        )
        user = cur.fetchone()
        print('Linked user:', user)

        if not user and info[3]:
            print('Note: doctor has email but no user row with exact match')
            cur.execute(
                "SELECT id, email, role FROM users WHERE LOWER(email) LIKE %s",
                ('%ganesh%',),
            )
            print('Users with ganesh in email:', cur.fetchall())

        cur.execute(
            """
            INSERT INTO telemedicine_visits (visit_id, appointment_id, patient_id, doctor_id, scheduled_at, status, fee, duration_minutes)
            SELECT CONCAT('visit-', a.appointment_id), a.appointment_id, a.patient_id, a.doctor_id,
                   CONCAT(a.appointment_date, ' ', a.appointment_time), 'scheduled', d.consultation_fee, 30
            FROM appointments a
            JOIN doctors d ON a.doctor_id = d.doctor_id
            LEFT JOIN telemedicine_visits tv ON tv.appointment_id = a.appointment_id
            WHERE a.appointment_type = 'video' AND tv.visit_id IS NULL
              AND a.status NOT IN ('cancelled', 'no_show')
            """
        )
        if cur.rowcount:
            conn.commit()
            print(f'Backfilled {cur.rowcount} telemedicine visit row(s) from video appointments')
finally:
    conn.close()
