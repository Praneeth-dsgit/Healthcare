"""
Seed Sydney placeholder doctors (from frontend doctorsGeo fixtures) into the database.
Adds facility latitude/longitude and links doctors to Sydney clinics.
"""
import os
import json
from dotenv import load_dotenv
import pymysql

load_dotenv()

SYDNEY_LOCATIONS = {
    'sydney-cbd': {'suburb': 'Sydney', 'state': 'NSW', 'lat': -33.8688, 'lng': 151.2093},
    'parramatta': {'suburb': 'Parramatta', 'state': 'NSW', 'lat': -33.815, 'lng': 151.0011},
    'bondi': {'suburb': 'Bondi', 'state': 'NSW', 'lat': -33.8915, 'lng': 151.2767},
    'chatswood': {'suburb': 'Chatswood', 'state': 'NSW', 'lat': -33.7969, 'lng': 151.183},
    'liverpool': {'suburb': 'Liverpool', 'state': 'NSW', 'lat': -33.92, 'lng': 150.923},
    'manly': {'suburb': 'Manly', 'state': 'NSW', 'lat': -33.7963, 'lng': 151.2877},
    'hurstville': {'suburb': 'Hurstville', 'state': 'NSW', 'lat': -33.9677, 'lng': 151.1026},
    'penrith': {'suburb': 'Penrith', 'state': 'NSW', 'lat': -33.7509, 'lng': 150.694},
    'darlinghurst': {'suburb': 'Darlinghurst', 'state': 'NSW', 'lat': -33.8794, 'lng': 151.2193},
    'campbelltown': {'suburb': 'Campbelltown', 'state': 'NSW', 'lat': -34.065, 'lng': 150.814},
}

SYDNEY_DOCTORS = [
    {'doctor_id': 101, 'first_name': 'Emily', 'last_name': 'Watson', 'specialty': 'General Medicine', 'qualification': 'MBBS, FRACGP', 'experience_years': 12, 'consultation_fee': 85, 'is_available': True, 'location_id': 'sydney-cbd', 'facility_name': 'Harbour Medical Centre', 'languages': ['English'], 'insurance': ['Medicare', 'Bupa', 'Cash']},
    {'doctor_id': 102, 'first_name': 'James', 'last_name': 'Chen', 'specialty': 'Cardiology', 'qualification': 'MBBS, FRACP', 'experience_years': 18, 'consultation_fee': 150, 'is_available': True, 'location_id': 'parramatta', 'facility_name': 'Westmead Heart Clinic', 'languages': ['English', 'Mandarin'], 'insurance': ['Medicare', 'Medibank', 'Cash']},
    {'doctor_id': 103, 'first_name': 'Sophie', 'last_name': 'Nguyen', 'specialty': 'Pediatrics', 'qualification': 'MBBS, DCH', 'experience_years': 9, 'consultation_fee': 95, 'is_available': False, 'location_id': 'bondi', 'facility_name': 'Bondi Kids Health', 'languages': ['English', 'Vietnamese'], 'insurance': ['Medicare', 'HCF', 'Cash']},
    {'doctor_id': 104, 'first_name': 'Michael', 'last_name': 'Patel', 'specialty': 'Orthopedics', 'qualification': 'MBBS, FRACS', 'experience_years': 15, 'consultation_fee': 180, 'is_available': True, 'location_id': 'chatswood', 'facility_name': 'North Shore Ortho', 'languages': ['English', 'Hindi'], 'insurance': ['Medicare', 'Bupa', 'Cash']},
    {'doctor_id': 105, 'first_name': 'Sarah', 'last_name': 'Okafor', 'specialty': 'Dermatology', 'qualification': 'MBBS, FACD', 'experience_years': 7, 'consultation_fee': 120, 'is_available': True, 'location_id': 'liverpool', 'facility_name': 'South West Skin Clinic', 'languages': ['English'], 'insurance': ['Medicare', 'Medibank', 'Cash']},
    {'doctor_id': 106, 'first_name': 'David', 'last_name': 'Murphy', 'specialty': 'General Medicine', 'qualification': 'MBBS, FRACGP', 'experience_years': 20, 'consultation_fee': 90, 'is_available': True, 'location_id': 'manly', 'facility_name': 'Manly Family Practice', 'languages': ['English'], 'insurance': ['Medicare', 'Bupa', 'HCF']},
    {'doctor_id': 107, 'first_name': 'Lisa', 'last_name': 'Zhang', 'specialty': 'Endocrinology', 'qualification': 'MBBS, FRACP', 'experience_years': 14, 'consultation_fee': 140, 'is_available': True, 'location_id': 'hurstville', 'facility_name': 'St George Diabetes Care', 'languages': ['English', 'Mandarin', 'Cantonese'], 'insurance': ['Medicare', 'Medibank', 'Cash']},
    {'doctor_id': 108, 'first_name': 'Andrew', 'last_name': 'Taylor', 'specialty': 'Sports Medicine', 'qualification': 'MBBS, FACSP', 'experience_years': 11, 'consultation_fee': 110, 'is_available': True, 'location_id': 'penrith', 'facility_name': 'Penrith Active Health', 'languages': ['English'], 'insurance': ['Medicare', 'Bupa', 'Cash']},
    {'doctor_id': 109, 'first_name': 'Rachel', 'last_name': 'Kim', 'specialty': 'Psychiatry', 'qualification': 'MBBS, FRANZCP', 'experience_years': 10, 'consultation_fee': 200, 'is_available': True, 'location_id': 'darlinghurst', 'facility_name': 'Inner City Mind Clinic', 'languages': ['English', 'Korean'], 'insurance': ['Medicare', 'Medibank', 'HCF']},
    {'doctor_id': 110, 'first_name': 'Thomas', 'last_name': 'Baker', 'specialty': 'General Medicine', 'qualification': 'MBBS, FRACGP', 'experience_years': 16, 'consultation_fee': 80, 'is_available': True, 'location_id': 'campbelltown', 'facility_name': 'Macarthur Medical Hub', 'languages': ['English', 'Arabic'], 'insurance': ['Medicare', 'HCF', 'Cash']},
    {'doctor_id': 111, 'first_name': 'Charlotte', 'last_name': 'Mitchell', 'specialty': 'Ophthalmology', 'qualification': 'MBBS, FRANZCO', 'experience_years': 13, 'consultation_fee': 165, 'is_available': True, 'location_id': 'sydney-cbd', 'facility_name': 'Circular Quay Eye Centre', 'languages': ['English'], 'insurance': ['Medicare', 'Bupa', 'Medibank']},
    {'doctor_id': 112, 'first_name': 'Lachlan', 'last_name': "O'Brien", 'specialty': 'Gastroenterology', 'qualification': 'MBBS, FRACP', 'experience_years': 17, 'consultation_fee': 155, 'is_available': True, 'location_id': 'parramatta', 'facility_name': 'Parramatta Digestive Health', 'languages': ['English'], 'insurance': ['Medicare', 'Medibank', 'Cash']},
    {'doctor_id': 113, 'first_name': 'Matilda', 'last_name': 'Fraser', 'specialty': "Women's Health", 'qualification': 'MBBS, FRANZCOG', 'experience_years': 11, 'consultation_fee': 130, 'is_available': True, 'location_id': 'bondi', 'facility_name': "Bondi Women's Clinic", 'languages': ['English'], 'insurance': ['Medicare', 'Bupa', 'HCF']},
    {'doctor_id': 114, 'first_name': 'William', 'last_name': 'Hughes', 'specialty': 'Neurology', 'qualification': 'MBBS, FRACP', 'experience_years': 19, 'consultation_fee': 195, 'is_available': False, 'location_id': 'chatswood', 'facility_name': 'North Shore Neurology', 'languages': ['English'], 'insurance': ['Medicare', 'Bupa', 'Cash']},
    {'doctor_id': 115, 'first_name': 'Cooper', 'last_name': 'Stevens', 'specialty': 'Urology', 'qualification': 'MBBS, FRACS', 'experience_years': 14, 'consultation_fee': 175, 'is_available': True, 'location_id': 'liverpool', 'facility_name': 'South West Urology', 'languages': ['English'], 'insurance': ['Medicare', 'Medibank', 'HCF']},
    {'doctor_id': 116, 'first_name': 'Pippa', 'last_name': 'Collins', 'specialty': 'ENT', 'qualification': 'MBBS, FRACS', 'experience_years': 10, 'consultation_fee': 145, 'is_available': True, 'location_id': 'manly', 'facility_name': 'Manly Ear Nose Throat', 'languages': ['English'], 'insurance': ['Medicare', 'Bupa', 'Cash']},
    {'doctor_id': 117, 'first_name': 'Angus', 'last_name': 'McKenzie', 'specialty': 'Rheumatology', 'qualification': 'MBBS, FRACP', 'experience_years': 16, 'consultation_fee': 160, 'is_available': True, 'location_id': 'hurstville', 'facility_name': 'St George Rheumatology', 'languages': ['English'], 'insurance': ['Medicare', 'HCF', 'Cash']},
    {'doctor_id': 118, 'first_name': 'Holly', 'last_name': 'Robinson', 'specialty': 'Obstetrics', 'qualification': 'MBBS, FRANZCOG', 'experience_years': 12, 'consultation_fee': 135, 'is_available': True, 'location_id': 'penrith', 'facility_name': 'Nepean Maternity Care', 'languages': ['English'], 'insurance': ['Medicare', 'Bupa', 'Medibank']},
    {'doctor_id': 119, 'first_name': 'Finn', 'last_name': 'Campbell', 'specialty': 'Psychiatry', 'qualification': 'MBBS, FRANZCP', 'experience_years': 8, 'consultation_fee': 210, 'is_available': True, 'location_id': 'darlinghurst', 'facility_name': 'Darlinghurst Psychiatry', 'languages': ['English'], 'insurance': ['Medicare', 'Medibank', 'HCF']},
    {'doctor_id': 120, 'first_name': 'Sienna', 'last_name': 'Walker', 'specialty': 'Allergy & Immunology', 'qualification': 'MBBS, FRACP', 'experience_years': 9, 'consultation_fee': 125, 'is_available': True, 'location_id': 'campbelltown', 'facility_name': 'Macarthur Allergy Clinic', 'languages': ['English'], 'insurance': ['Medicare', 'Bupa', 'Cash']},
    {'doctor_id': 121, 'first_name': 'Jack', 'last_name': 'Thompson', 'specialty': 'Pulmonology', 'qualification': 'MBBS, FRACP', 'experience_years': 15, 'consultation_fee': 170, 'is_available': True, 'location_id': 'sydney-cbd', 'facility_name': 'Martin Place Respiratory', 'languages': ['English'], 'insurance': ['Medicare', 'Medibank', 'Cash']},
    {'doctor_id': 122, 'first_name': 'Ella', 'last_name': 'Martin', 'specialty': 'Physiotherapy', 'qualification': 'BPhysio, APAM', 'experience_years': 7, 'consultation_fee': 95, 'is_available': True, 'location_id': 'bondi', 'facility_name': 'Bondi Beach Physio', 'languages': ['English'], 'insurance': ['Medicare', 'Bupa', 'HCF', 'Cash']},
]

EXTRA_SPECIALTIES = [
    'Endocrinology', 'Sports Medicine', "Women's Health", 'Ophthalmology',
    'Gastroenterology', 'Urology', 'ENT', 'Rheumatology', 'Obstetrics',
    'Allergy & Immunology', 'Pulmonology', 'Physiotherapy',
]


def ensure_geo_columns(cur):
    for col, ddl in (
        ('latitude', 'DECIMAL(10,7) NULL'),
        ('longitude', 'DECIMAL(10,7) NULL'),
    ):
        try:
            cur.execute(f'ALTER TABLE facilities ADD COLUMN {col} {ddl}')
            print(f'Added facilities.{col}')
        except pymysql.err.OperationalError as e:
            if e.args[0] == 1060:
                print(f'facilities.{col} already exists')
            else:
                raise


def get_or_create_specialty(cur, name: str) -> int:
    cur.execute('SELECT specialty_id FROM specialties WHERE name = %s LIMIT 1', (name,))
    row = cur.fetchone()
    if row:
        return int(row[0])
    cur.execute(
        'INSERT INTO specialties (name, description, category, is_active) VALUES (%s, %s, %s, TRUE)',
        (name, f'{name} specialists', 'General'),
    )
    return int(cur.lastrowid)


def get_or_create_facility(cur, doc: dict, loc: dict) -> int:
    suburb = loc['suburb']
    address = f"{doc['facility_name']}, {suburb}, NSW, Australia"
    cur.execute('SELECT facility_id FROM facilities WHERE name = %s LIMIT 1', (doc['facility_name'],))
    row = cur.fetchone()
    if row:
        facility_id = int(row[0])
        cur.execute(
            """
            UPDATE facilities
            SET address = %s, city = 'Sydney', state = %s, country = 'Australia',
                latitude = %s, longitude = %s, is_active = TRUE
            WHERE facility_id = %s
            """,
            (address, loc['state'], loc['lat'], loc['lng'], facility_id),
        )
        return facility_id

    cur.execute(
        """
        INSERT INTO facilities (
            name, type, address, city, state, country, latitude, longitude, is_active
        ) VALUES (%s, 'clinic', %s, 'Sydney', %s, 'Australia', %s, %s, TRUE)
        """,
        (doc['facility_name'], address, loc['state'], loc['lat'], loc['lng']),
    )
    return int(cur.lastrowid)


def seed_doctor(cur, doc: dict):
    loc = SYDNEY_LOCATIONS[doc['location_id']]
    specialty_id = get_or_create_specialty(cur, doc['specialty'])
    facility_id = get_or_create_facility(cur, doc, loc)
    email = f"sydney.dr.{doc['doctor_id']}@acufore.health"
    bio = json.dumps({
        'region': 'Sydney, NSW, Australia',
        'languages': doc['languages'],
        'insuranceAccepted': doc['insurance'],
        'location_id': doc['location_id'],
        'suburb': loc['suburb'],
    })

    cur.execute(
        """
        INSERT INTO doctors (
            doctor_id, first_name, last_name, specialty_id, qualification,
            experience_years, consultation_fee, email, bio, is_available, is_active
        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, TRUE)
        ON DUPLICATE KEY UPDATE
            first_name = VALUES(first_name),
            last_name = VALUES(last_name),
            specialty_id = VALUES(specialty_id),
            qualification = VALUES(qualification),
            experience_years = VALUES(experience_years),
            consultation_fee = VALUES(consultation_fee),
            email = VALUES(email),
            bio = VALUES(bio),
            is_available = VALUES(is_available),
            is_active = TRUE
        """,
        (
            doc['doctor_id'], doc['first_name'], doc['last_name'], specialty_id,
            doc['qualification'], doc['experience_years'], doc['consultation_fee'],
            email, bio, doc['is_available'],
        ),
    )

    cur.execute(
        """
        INSERT INTO doctor_facilities (doctor_id, facility_id, is_primary, is_active)
        VALUES (%s, %s, TRUE, TRUE)
        ON DUPLICATE KEY UPDATE is_primary = TRUE, is_active = TRUE
        """,
        (doc['doctor_id'], facility_id),
    )


conn = pymysql.connect(
    host=os.getenv('MYSQL_HOST', 'localhost'),
    port=int(os.getenv('MYSQL_PORT', '3306')),
    user=os.getenv('MYSQL_USER', 'root'),
    password=os.getenv('MYSQL_PASSWORD', ''),
    database=os.getenv('MYSQL_DATABASE', 'medchat_db'),
)
try:
    with conn.cursor() as cur:
        ensure_geo_columns(cur)

        for name in EXTRA_SPECIALTIES:
            get_or_create_specialty(cur, name)

        for doc in SYDNEY_DOCTORS:
            seed_doctor(cur, doc)

        cur.execute(
            """
            UPDATE doctors SET offers_telemedicine = TRUE
            WHERE doctor_id BETWEEN 101 AND 122 AND is_active = TRUE AND is_available = TRUE
            """
        )
        print(f'Marked {cur.rowcount} Sydney doctor(s) for telemedicine')

        conn.commit()
        print(f'Seeded/updated {len(SYDNEY_DOCTORS)} Sydney doctors (IDs 101–122)')
finally:
    conn.close()
