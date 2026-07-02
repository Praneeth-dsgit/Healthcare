"""One-off migration: add 'rescheduled' to appointments.status ENUM.

Also repairs any rows whose status was blanked out (empty string) by a
previous failed reschedule (MySQL stores '' on ENUM truncation in non-strict mode).
"""
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
            "SELECT appointment_id, status FROM appointments "
            "WHERE status NOT IN ('scheduled','confirmed','completed','cancelled','no_show','rescheduled')"
        )
        bad = cur.fetchall()
        print("Rows with invalid status (id, status):", bad)

        if bad:
            cur.execute(
                "UPDATE appointments SET status = 'scheduled' "
                "WHERE status NOT IN ('scheduled','confirmed','completed','cancelled','no_show','rescheduled')"
            )
            print(f"Repaired {cur.rowcount} row(s) -> 'scheduled'")

        cur.execute(
            "ALTER TABLE appointments MODIFY COLUMN status "
            "ENUM('scheduled','confirmed','completed','cancelled','no_show','rescheduled') "
            "DEFAULT 'scheduled'"
        )
        conn.commit()
        cur.execute("SHOW COLUMNS FROM appointments LIKE 'status'")
        print("Updated column definition:", cur.fetchone())
finally:
    conn.close()
