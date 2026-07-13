"""Migration: doctor professional network tables and seed data from existing doctors/specialties."""
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
            CREATE TABLE IF NOT EXISTS doctor_network_profiles (
                doctor_id INT PRIMARY KEY,
                headline VARCHAR(255),
                visibility ENUM('public', 'connections') NOT NULL DEFAULT 'connections',
                verified BOOLEAN NOT NULL DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (doctor_id) REFERENCES doctors(doctor_id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            """
        )
        print("Ensured doctor_network_profiles")

        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS doctor_connections (
                connection_id INT AUTO_INCREMENT PRIMARY KEY,
                requester_doctor_id INT NOT NULL,
                target_doctor_id INT NOT NULL,
                status ENUM('pending', 'accepted', 'declined') NOT NULL DEFAULT 'pending',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                responded_at DATETIME NULL,
                UNIQUE KEY unique_connection_pair (requester_doctor_id, target_doctor_id),
                FOREIGN KEY (requester_doctor_id) REFERENCES doctors(doctor_id) ON DELETE CASCADE,
                FOREIGN KEY (target_doctor_id) REFERENCES doctors(doctor_id) ON DELETE CASCADE,
                INDEX idx_requester (requester_doctor_id),
                INDEX idx_target (target_doctor_id),
                INDEX idx_status (status)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            """
        )
        print("Ensured doctor_connections")

        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS doctor_network_threads (
                thread_id INT AUTO_INCREMENT PRIMARY KEY,
                doctor_low_id INT NOT NULL,
                doctor_high_id INT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY unique_thread_pair (doctor_low_id, doctor_high_id),
                FOREIGN KEY (doctor_low_id) REFERENCES doctors(doctor_id) ON DELETE CASCADE,
                FOREIGN KEY (doctor_high_id) REFERENCES doctors(doctor_id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            """
        )
        print("Ensured doctor_network_threads")

        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS doctor_network_messages (
                message_id INT AUTO_INCREMENT PRIMARY KEY,
                thread_id INT NOT NULL,
                sender_doctor_id INT NOT NULL,
                body TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (thread_id) REFERENCES doctor_network_threads(thread_id) ON DELETE CASCADE,
                FOREIGN KEY (sender_doctor_id) REFERENCES doctors(doctor_id) ON DELETE CASCADE,
                INDEX idx_thread (thread_id),
                INDEX idx_created (created_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            """
        )
        print("Ensured doctor_network_messages")

        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS doctor_network_posts (
                post_id INT AUTO_INCREMENT PRIMARY KEY,
                author_doctor_id INT NULL,
                author_name VARCHAR(200) NULL,
                author_specialty VARCHAR(100) NULL,
                content TEXT NOT NULL,
                post_type ENUM('publication', 'case', 'event') NOT NULL DEFAULT 'publication',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (author_doctor_id) REFERENCES doctors(doctor_id) ON DELETE SET NULL,
                INDEX idx_created (created_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            """
        )
        print("Ensured doctor_network_posts")

        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS doctor_network_post_likes (
                post_id INT NOT NULL,
                doctor_id INT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (post_id, doctor_id),
                FOREIGN KEY (post_id) REFERENCES doctor_network_posts(post_id) ON DELETE CASCADE,
                FOREIGN KEY (doctor_id) REFERENCES doctors(doctor_id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            """
        )
        print("Ensured doctor_network_post_likes")

        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS doctor_network_groups (
                group_id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(200) NOT NULL,
                description TEXT,
                specialty_id INT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (specialty_id) REFERENCES specialties(specialty_id) ON DELETE SET NULL
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            """
        )
        print("Ensured doctor_network_groups")

        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS doctor_network_group_members (
                group_id INT NOT NULL,
                doctor_id INT NOT NULL,
                joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (group_id, doctor_id),
                FOREIGN KEY (group_id) REFERENCES doctor_network_groups(group_id) ON DELETE CASCADE,
                FOREIGN KEY (doctor_id) REFERENCES doctors(doctor_id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            """
        )
        print("Ensured doctor_network_group_members")

        # Network profiles for all active doctors
        cur.execute(
            """
            INSERT IGNORE INTO doctor_network_profiles (doctor_id, headline, visibility, verified)
            SELECT
                d.doctor_id,
                COALESCE(
                    NULLIF(TRIM(SUBSTRING(d.bio, 1, 200)), ''),
                    CONCAT(COALESCE(s.name, 'Medicine'), ' | Acufore Health Network')
                ),
                'connections',
                TRUE
            FROM doctors d
            LEFT JOIN specialties s ON s.specialty_id = d.specialty_id
            WHERE d.is_active = TRUE
            """
        )
        print(f"Seeded/updated {cur.rowcount} doctor network profiles")

        # Groups from specialties
        cur.execute(
            """
            INSERT IGNORE INTO doctor_network_groups (name, description, specialty_id)
            SELECT
                CONCAT(s.name, ' Network'),
                CONCAT('Peer network for ', LOWER(s.name), ' specialists.'),
                s.specialty_id
            FROM specialties s
            WHERE s.is_active = TRUE
            """
        )
        print(f"Seeded {cur.rowcount} specialty groups")

        cur.execute(
            """
            INSERT IGNORE INTO doctor_network_groups (name, description, specialty_id)
            VALUES
                ('Telehealth Practitioners', 'Best practices and case discussions for virtual care.', NULL),
                ('Physicians Referral Circle', 'Local referral network and continuing medical education.', NULL)
            """
        )

        # Auto-join doctors to their specialty group
        cur.execute(
            """
            INSERT IGNORE INTO doctor_network_group_members (group_id, doctor_id)
            SELECT g.group_id, d.doctor_id
            FROM doctors d
            JOIN doctor_network_groups g ON g.specialty_id = d.specialty_id
            WHERE d.is_active = TRUE
            """
        )
        print(f"Auto-joined {cur.rowcount} doctors to specialty groups")

        # Connections from referral history (both directions accepted)
        cur.execute(
            """
            INSERT IGNORE INTO doctor_connections (requester_doctor_id, target_doctor_id, status, responded_at)
            SELECT from_doctor_id, to_doctor_id, 'accepted', NOW()
            FROM referrals
            WHERE from_doctor_id != to_doctor_id
            """
        )
        print(f"Seeded {cur.rowcount} connections from referrals")

        # Threads + starter messages from referrals
        cur.execute("SELECT referral_id, from_doctor_id, to_doctor_id, clinical_notes, specialty FROM referrals")
        referrals = cur.fetchall()
        for ref_id, from_id, to_id, notes, specialty in referrals:
            low_id, high_id = (from_id, to_id) if from_id < to_id else (to_id, from_id)
            cur.execute(
                """
                INSERT IGNORE INTO doctor_network_threads (doctor_low_id, doctor_high_id)
                VALUES (%s, %s)
                """,
                (low_id, high_id),
            )
            cur.execute(
                """
                SELECT thread_id FROM doctor_network_threads
                WHERE doctor_low_id = %s AND doctor_high_id = %s
                """,
                (low_id, high_id),
            )
            thread_row = cur.fetchone()
            if not thread_row:
                continue
            thread_id = thread_row[0]
            body = (notes or f"Referral for {specialty or 'specialist'} care.").strip()[:1000]
            cur.execute(
                """
                SELECT COUNT(*) FROM doctor_network_messages
                WHERE thread_id = %s AND sender_doctor_id = %s AND body = %s
                """,
                (thread_id, from_id, body),
            )
            if cur.fetchone()[0] == 0:
                cur.execute(
                    """
                    INSERT INTO doctor_network_messages (thread_id, sender_doctor_id, body)
                    VALUES (%s, %s, %s)
                    """,
                    (thread_id, from_id, body),
                )

        # Feed posts from doctor bios
        cur.execute(
            """
            INSERT INTO doctor_network_posts (author_doctor_id, content, post_type)
            SELECT d.doctor_id, TRIM(d.bio), 'publication'
            FROM doctors d
            WHERE d.is_active = TRUE
              AND d.bio IS NOT NULL
              AND TRIM(d.bio) != ''
              AND NOT EXISTS (
                  SELECT 1 FROM doctor_network_posts p
                  WHERE p.author_doctor_id = d.doctor_id
              )
            LIMIT 20
            """
        )
        print(f"Seeded {cur.rowcount} feed posts from doctor bios")

        cur.execute(
            """
            INSERT INTO doctor_network_posts (author_name, author_specialty, content, post_type)
            SELECT 'Acufore Medical Network', 'Admin', content, 'event'
            FROM (
                SELECT 'Join colleagues across specialties for case discussions, referrals, and CME updates on the professional network.' AS content
            ) seed
            WHERE NOT EXISTS (
                SELECT 1 FROM doctor_network_posts
                WHERE author_name = 'Acufore Medical Network'
            )
            """
        )

        conn.commit()
finally:
    conn.close()
