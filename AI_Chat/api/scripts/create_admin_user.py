"""
Script to create the first admin user
Run this script to create an admin user if you don't have one yet.

Usage:
    python scripts/create_admin_user.py <email> <password>
    
Example:
    python scripts/create_admin_user.py admin@example.com admin123
"""

import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from config import db, app
from werkzeug.security import generate_password_hash
from datetime import datetime

def create_admin_user(email: str, password: str):
    """Create an admin user"""
    with app.app_context():
        try:
            # Check if role column exists, if not add it
            try:
                db.session.execute(db.text("ALTER TABLE users ADD COLUMN role VARCHAR(50) NULL"))
                db.session.commit()
                print("✅ Added 'role' column to users table")
            except Exception as e:
                # Column might already exist
                db.session.rollback()
                if 'Duplicate column name' not in str(e).lower() and 'already exists' not in str(e).lower():
                    print(f"⚠️  Could not add role column (might already exist): {e}")
            
            # Check if user already exists
            existing_user = db.session.execute(
                db.text("SELECT id, email FROM users WHERE email = :email"),
                {"email": email}
            ).fetchone()
            
            if existing_user:
                user_id = existing_user[0]
                # Update existing user to admin
                db.session.execute(
                    db.text("""
                        UPDATE users
                        SET role = 'admin', password_hash = :password_hash,
                            is_verified = TRUE, otp = NULL, otp_expiry = NULL, updated_at = NOW()
                        WHERE id = :user_id
                    """),
                    {"password_hash": generate_password_hash(password), "user_id": user_id}
                )
                db.session.commit()
                print(f"✅ Updated existing user {email} to admin role")
            else:
                # Create new admin user
                password_hash = generate_password_hash(password)
                db.session.execute(
                    db.text("""
                        INSERT INTO users (email, password_hash, is_verified, otp, otp_expiry, role, created_at, updated_at)
                        VALUES (:email, :password_hash, :is_verified, :otp, :otp_expiry, :role, NOW(), NOW())
                    """),
                    {
                        'email': email,
                        'password_hash': password_hash,
                        'is_verified': True,
                        'otp': None,
                        'otp_expiry': None,
                        'role': 'admin'
                    }
                )
                db.session.commit()
                print(f"✅ Created admin user: {email}")
            
            print(f"\n📋 Admin user credentials:")
            print(f"   Email: {email}")
            print(f"   Password: {password}")
            print(f"\n🔗 Login URL: http://localhost:5173/login/admin")
            print(f"🔗 Dashboard URL: http://localhost:5173/admin/dashboard")
            
        except Exception as e:
            db.session.rollback()
            print(f"❌ Error creating admin user: {e}")
            import traceback
            traceback.print_exc()
            return False
    
    return True

if __name__ == '__main__':
    if len(sys.argv) < 3:
        print("Usage: python create_admin_user.py <email> <password>")
        print("\nExample:")
        print("  python create_admin_user.py admin@example.com admin123")
        sys.exit(1)
    
    email = sys.argv[1]
    password = sys.argv[2]
    
    print(f"Creating admin user: {email}")
    create_admin_user(email, password)

