"""Migration: AI patient engagement platform tables."""
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

STATEMENTS = [
    """
    CREATE TABLE IF NOT EXISTS patient_engagement_preferences (
        preference_id INT AUTO_INCREMENT PRIMARY KEY,
        patient_id VARCHAR(50) NOT NULL UNIQUE,
        channel_in_app TINYINT(1) NOT NULL DEFAULT 1,
        channel_email TINYINT(1) NOT NULL DEFAULT 1,
        channel_sms TINYINT(1) NOT NULL DEFAULT 0,
        channel_whatsapp TINYINT(1) NOT NULL DEFAULT 0,
        quiet_hours_start TIME NULL,
        quiet_hours_end TIME NULL,
        language VARCHAR(16) NOT NULL DEFAULT 'en',
        appointment_reminders TINYINT(1) NOT NULL DEFAULT 1,
        medication_reminders TINYINT(1) NOT NULL DEFAULT 1,
        preventive_reminders TINYINT(1) NOT NULL DEFAULT 1,
        marketing_opt_in TINYINT(1) NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (patient_id) REFERENCES patients(patient_id) ON DELETE CASCADE,
        INDEX idx_pref_patient (patient_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    """,
    """
    CREATE TABLE IF NOT EXISTS engagement_campaigns (
        campaign_id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        campaign_type VARCHAR(64) NOT NULL DEFAULT 'manual',
        message_template TEXT NOT NULL,
        channels_json TEXT,
        cohort_json TEXT,
        status ENUM('draft', 'scheduled', 'running', 'completed', 'cancelled') NOT NULL DEFAULT 'draft',
        scheduled_at DATETIME NULL,
        created_by VARCHAR(255) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_campaign_status (status),
        INDEX idx_campaign_scheduled (scheduled_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    """,
    """
    CREATE TABLE IF NOT EXISTS engagement_events (
        event_id INT AUTO_INCREMENT PRIMARY KEY,
        patient_id VARCHAR(50) NOT NULL,
        event_type VARCHAR(64) NOT NULL,
        channel VARCHAR(32) NOT NULL,
        title VARCHAR(255) NULL,
        message TEXT NOT NULL,
        payload_json TEXT,
        status ENUM('pending', 'scheduled', 'sent', 'failed', 'cancelled', 'responded') NOT NULL DEFAULT 'pending',
        scheduled_at DATETIME NULL,
        sent_at DATETIME NULL,
        response_json TEXT,
        campaign_id INT NULL,
        related_appointment_id INT NULL,
        related_care_gap_id INT NULL,
        error_message TEXT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (patient_id) REFERENCES patients(patient_id) ON DELETE CASCADE,
        FOREIGN KEY (campaign_id) REFERENCES engagement_campaigns(campaign_id) ON DELETE SET NULL,
        INDEX idx_event_patient (patient_id),
        INDEX idx_event_status (status),
        INDEX idx_event_scheduled (scheduled_at),
        INDEX idx_event_type (event_type),
        INDEX idx_event_channel (channel)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    """,
    """
    CREATE TABLE IF NOT EXISTS care_gaps (
        care_gap_id INT AUTO_INCREMENT PRIMARY KEY,
        patient_id VARCHAR(50) NOT NULL,
        gap_type VARCHAR(64) NOT NULL,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        priority ENUM('low', 'medium', 'high', 'urgent') NOT NULL DEFAULT 'medium',
        status ENUM('open', 'scheduled', 'closed', 'dismissed') NOT NULL DEFAULT 'open',
        due_date DATE NULL,
        metadata_json TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        closed_at DATETIME NULL,
        FOREIGN KEY (patient_id) REFERENCES patients(patient_id) ON DELETE CASCADE,
        INDEX idx_gap_patient (patient_id),
        INDEX idx_gap_status (status),
        INDEX idx_gap_type (gap_type),
        INDEX idx_gap_due (due_date)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    """,
    """
    CREATE TABLE IF NOT EXISTS medication_adherence_logs (
        log_id INT AUTO_INCREMENT PRIMARY KEY,
        patient_id VARCHAR(50) NOT NULL,
        medication_name VARCHAR(255) NOT NULL,
        dosage VARCHAR(128) NULL,
        action ENUM('taken', 'skipped', 'snoozed') NOT NULL,
        scheduled_for DATETIME NULL,
        logged_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        notes TEXT NULL,
        FOREIGN KEY (patient_id) REFERENCES patients(patient_id) ON DELETE CASCADE,
        INDEX idx_adh_patient (patient_id),
        INDEX idx_adh_logged (logged_at),
        INDEX idx_adh_action (action)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    """,
    """
    CREATE TABLE IF NOT EXISTS sdoh_assessments (
        assessment_id INT AUTO_INCREMENT PRIMARY KEY,
        patient_id VARCHAR(50) NOT NULL,
        transportation_need TINYINT(1) NOT NULL DEFAULT 0,
        financial_stress TINYINT(1) NOT NULL DEFAULT 0,
        health_literacy_score INT NULL,
        housing_instability TINYINT(1) NOT NULL DEFAULT 0,
        food_insecurity TINYINT(1) NOT NULL DEFAULT 0,
        notes TEXT NULL,
        answers_json TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (patient_id) REFERENCES patients(patient_id) ON DELETE CASCADE,
        INDEX idx_sdoh_patient (patient_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    """,
    """
    CREATE TABLE IF NOT EXISTS sdoh_resources (
        resource_id INT AUTO_INCREMENT PRIMARY KEY,
        category VARCHAR(64) NOT NULL,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        url VARCHAR(512) NULL,
        phone VARCHAR(64) NULL,
        region VARCHAR(128) NULL,
        is_active TINYINT(1) NOT NULL DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_sdoh_cat (category),
        INDEX idx_sdoh_active (is_active)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    """,
    """
    CREATE TABLE IF NOT EXISTS decision_aids_sessions (
        session_id INT AUTO_INCREMENT PRIMARY KEY,
        patient_id VARCHAR(50) NOT NULL,
        topic VARCHAR(128) NOT NULL,
        options_json TEXT,
        preference_json TEXT,
        chosen_option VARCHAR(255) NULL,
        status ENUM('in_progress', 'completed', 'abandoned') NOT NULL DEFAULT 'in_progress',
        related_appointment_id INT NULL,
        related_referral_id INT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        completed_at DATETIME NULL,
        FOREIGN KEY (patient_id) REFERENCES patients(patient_id) ON DELETE CASCADE,
        INDEX idx_da_patient (patient_id),
        INDEX idx_da_topic (topic),
        INDEX idx_da_status (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    """,
    """
    CREATE TABLE IF NOT EXISTS engagement_metrics_daily (
        metric_id INT AUTO_INCREMENT PRIMARY KEY,
        metric_date DATE NOT NULL,
        reminders_sent INT NOT NULL DEFAULT 0,
        reminders_failed INT NOT NULL DEFAULT 0,
        appointments_scheduled INT NOT NULL DEFAULT 0,
        appointments_completed INT NOT NULL DEFAULT 0,
        appointments_no_show INT NOT NULL DEFAULT 0,
        med_checkins INT NOT NULL DEFAULT 0,
        portal_notifications_unread INT NOT NULL DEFAULT 0,
        campaigns_sent INT NOT NULL DEFAULT 0,
        satisfaction_responses INT NOT NULL DEFAULT 0,
        satisfaction_score_sum DECIMAL(10,2) NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_metric_date (metric_date)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    """,
    """
    CREATE TABLE IF NOT EXISTS patient_risk_scores (
        risk_id INT AUTO_INCREMENT PRIMARY KEY,
        patient_id VARCHAR(50) NOT NULL UNIQUE,
        risk_tier ENUM('low', 'medium', 'high', 'critical') NOT NULL DEFAULT 'low',
        risk_score INT NOT NULL DEFAULT 0,
        factors_json TEXT,
        computed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (patient_id) REFERENCES patients(patient_id) ON DELETE CASCADE,
        INDEX idx_risk_tier (risk_tier)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    """,
    """
    CREATE TABLE IF NOT EXISTS engagement_satisfaction (
        response_id INT AUTO_INCREMENT PRIMARY KEY,
        patient_id VARCHAR(50) NOT NULL,
        appointment_id INT NULL,
        score INT NOT NULL,
        feedback TEXT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (patient_id) REFERENCES patients(patient_id) ON DELETE CASCADE,
        INDEX idx_sat_patient (patient_id),
        INDEX idx_sat_created (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    """,
]

SEED_RESOURCES = [
    (
        'transportation',
        'Community Medical Transport',
        'Low-cost or free transport to medical appointments for eligible patients.',
        'https://example.org/transport',
        '18005550101',
        'Sydney',
    ),
    (
        'financial',
        'Hospital Financial Assistance',
        'Sliding-scale billing and hardship assistance applications.',
        'https://example.org/financial-aid',
        '18005550102',
        'Sydney',
    ),
    (
        'health_literacy',
        'Patient Health Education Library',
        'Plain-language guides for common conditions, medications, and screenings.',
        'https://example.org/health-literacy',
        None,
        'General',
    ),
    (
        'food',
        'Local Food Assistance Programs',
        'Food pantry and nutrition support referrals near your area.',
        'https://example.org/food-support',
        '18005550103',
        'Sydney',
    ),
]

try:
    with conn.cursor() as cur:
        for stmt in STATEMENTS:
            cur.execute(stmt)
            print('Ensured engagement table')

        cur.execute('SELECT COUNT(*) FROM sdoh_resources')
        count = cur.fetchone()[0]
        if count == 0:
            cur.executemany(
                """
                INSERT INTO sdoh_resources (category, title, description, url, phone, region)
                VALUES (%s, %s, %s, %s, %s, %s)
                """,
                SEED_RESOURCES,
            )
            print(f'Seeded {len(SEED_RESOURCES)} SDOH resources')
    conn.commit()
    print('Migration 008 complete')
finally:
    conn.close()
