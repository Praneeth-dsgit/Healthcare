"""Enable telemedicine for Sydney seeded doctors and Dr Ganesh ch."""
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
            SELECT COUNT(*) FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'doctors'
              AND COLUMN_NAME = 'offers_telemedicine'
            """
        )
        if not cur.fetchone()[0]:
            print('doctors.offers_telemedicine column missing — run 003_telemedicine_support.py first')
        else:
            cur.execute(
                """
                UPDATE doctors SET offers_telemedicine = TRUE
                WHERE doctor_id BETWEEN 101 AND 122 AND is_active = TRUE AND is_available = TRUE
                """
            )
            print(f'Marked {cur.rowcount} Sydney doctor(s) for telemedicine')

            cur.execute(
                """
                UPDATE doctors SET offers_telemedicine = TRUE, is_available = TRUE
                WHERE LOWER(first_name) = 'ganesh' AND LOWER(last_name) = 'ch'
                """
            )
            if cur.rowcount:
                print(f'Ensured Dr Ganesh ch is telemedicine-enabled ({cur.rowcount} row)')

        conn.commit()
finally:
    conn.close()
