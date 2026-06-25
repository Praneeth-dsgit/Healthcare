"""Condition trend service: normalize diagnosis, store events, and compute trend/surge analytics."""
from __future__ import annotations

import re
from collections import defaultdict
from datetime import date, datetime, timedelta
from typing import Any, Dict, List, Optional

from config import db


def ensure_condition_events_table() -> None:
    db.session.execute(
        db.text(
            """
            CREATE TABLE IF NOT EXISTS condition_events (
                id INT AUTO_INCREMENT PRIMARY KEY,
                patient_id VARCHAR(50) NULL,
                doctor_id INT NULL,
                source_type VARCHAR(40) NOT NULL,
                source_id INT NULL,
                diagnosis_raw TEXT NOT NULL,
                condition_code VARCHAR(100) NOT NULL,
                condition_name VARCHAR(255) NOT NULL,
                condition_group VARCHAR(100) NULL,
                confidence FLOAT DEFAULT 0.7,
                event_date DATE NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_condition_events_event_date (event_date),
                INDEX idx_condition_events_doctor (doctor_id),
                INDEX idx_condition_events_condition (condition_code)
            )
            """
        )
    )
    db.session.commit()


_CONDITION_RULES: List[tuple[str, str, str, str]] = [
    (r"\b(diabetes|dm|hyperglycemia)\b", "E11", "Type 2 Diabetes Mellitus", "metabolic"),
    (r"\b(hypertension|htn|high blood pressure)\b", "I10", "Hypertension", "cardiovascular"),
    (r"\b(fever|pyrexia)\b", "R50", "Fever", "infectious"),
    (r"\b(upper respiratory|uri|flu|influenza|cold)\b", "J06", "Upper Respiratory Infection", "respiratory"),
    (r"\b(asthma|wheeze)\b", "J45", "Asthma", "respiratory"),
    (r"\b(gastritis|acid reflux|gerd|dyspepsia|acidity)\b", "K21", "Acid-Peptic Disorder", "gastrointestinal"),
    (r"\b(diarrhea|gastroenteritis)\b", "A09", "Acute Gastroenteritis", "gastrointestinal"),
    (r"\b(migraine|headache)\b", "G43", "Migraine/Headache", "neurology"),
    (r"\b(uti|urinary tract infection)\b", "N39.0", "Urinary Tract Infection", "genitourinary"),
    (r"\b(arthritis|joint pain|arthralgia)\b", "M25", "Arthralgia/Arthritis", "musculoskeletal"),
]


def normalize_condition(diagnosis_text: str) -> Dict[str, Any]:
    raw = (diagnosis_text or "").strip()
    normalized = re.sub(r"\s+", " ", raw.lower())
    for pattern, code, name, group in _CONDITION_RULES:
        if re.search(pattern, normalized):
            return {
                "condition_code": code,
                "condition_name": name,
                "condition_group": group,
                "confidence": 0.8,
            }
    fallback = raw[:120] or "Unspecified Condition"
    safe_code = re.sub(r"[^a-z0-9]+", "_", fallback.lower()).strip("_")[:90] or "unspecified_condition"
    return {
        "condition_code": f"FREE_{safe_code}",
        "condition_name": fallback,
        "condition_group": "other",
        "confidence": 0.55,
    }


def extract_diagnosis_text(description: str) -> str:
    text = description or ""
    match = re.search(r"Diagnosis:\s*(.+?)(?:\n|$)", text, flags=re.IGNORECASE)
    if match:
        return match.group(1).strip()
    # Fallback: first line, truncated
    return text.strip().split("\n")[0][:180]


def record_condition_event(
    *,
    patient_id: Optional[str],
    doctor_id: Optional[int],
    source_type: str,
    source_id: Optional[int],
    diagnosis_text: str,
    event_date: Optional[str],
) -> Optional[int]:
    diagnosis = (diagnosis_text or "").strip()
    if not diagnosis:
        return None
    ensure_condition_events_table()
    normalized = normalize_condition(diagnosis)
    evt_date = event_date or date.today().isoformat()
    result = db.session.execute(
        db.text(
            """
            INSERT INTO condition_events
            (patient_id, doctor_id, source_type, source_id, diagnosis_raw, condition_code, condition_name, condition_group, confidence, event_date, created_at)
            VALUES
            (:patient_id, :doctor_id, :source_type, :source_id, :diagnosis_raw, :condition_code, :condition_name, :condition_group, :confidence, :event_date, NOW())
            """
        ),
        {
            "patient_id": patient_id,
            "doctor_id": doctor_id,
            "source_type": source_type,
            "source_id": source_id,
            "diagnosis_raw": diagnosis,
            "condition_code": normalized["condition_code"],
            "condition_name": normalized["condition_name"],
            "condition_group": normalized["condition_group"],
            "confidence": normalized["confidence"],
            "event_date": evt_date,
        },
    )
    db.session.commit()
    return result.lastrowid


def get_condition_trends(
    *,
    days: int = 30,
    doctor_id: Optional[int] = None,
    top_n: int = 8,
) -> Dict[str, Any]:
    ensure_condition_events_table()
    end_date = date.today()
    start_date = end_date - timedelta(days=days)
    prev_start = start_date - timedelta(days=7)
    prev_end = start_date - timedelta(days=1)

    params: Dict[str, Any] = {"start_date": start_date, "end_date": end_date}
    doctor_clause = ""
    if doctor_id:
        doctor_clause = " AND doctor_id = :doctor_id "
        params["doctor_id"] = doctor_id

    rows = db.session.execute(
        db.text(
            f"""
            SELECT condition_code, condition_name, DATE(event_date) AS bucket_date, COUNT(*) AS cnt
            FROM condition_events
            WHERE event_date BETWEEN :start_date AND :end_date
            {doctor_clause}
            GROUP BY condition_code, condition_name, DATE(event_date)
            ORDER BY DATE(event_date) ASC
            """
        ),
        params,
    ).fetchall()

    cur_params = {"cur_start": start_date, "cur_end": end_date, "prev_start": prev_start, "prev_end": prev_end}
    if doctor_id:
        cur_params["doctor_id"] = doctor_id
    doctor_clause2 = " AND doctor_id = :doctor_id " if doctor_id else ""
    summary_rows = db.session.execute(
        db.text(
            f"""
            SELECT
                condition_code,
                condition_name,
                SUM(CASE WHEN event_date BETWEEN :cur_start AND :cur_end THEN 1 ELSE 0 END) AS current_count,
                SUM(CASE WHEN event_date BETWEEN :prev_start AND :prev_end THEN 1 ELSE 0 END) AS prev_count
            FROM condition_events
            WHERE event_date BETWEEN :prev_start AND :cur_end
            {doctor_clause2}
            GROUP BY condition_code, condition_name
            """
        ),
        cur_params,
    ).fetchall()

    series_map: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    for row in rows:
        m = row._mapping if hasattr(row, "_mapping") else row
        series_map[m["condition_code"]].append(
            {"date": m["bucket_date"].isoformat() if hasattr(m["bucket_date"], "isoformat") else str(m["bucket_date"]), "count": int(m["cnt"])}
        )

    trends: List[Dict[str, Any]] = []
    for row in summary_rows:
        m = row._mapping if hasattr(row, "_mapping") else row
        cur = int(m["current_count"] or 0)
        prev = int(m["prev_count"] or 0)
        wow_pct = ((cur - prev) / prev * 100.0) if prev > 0 else (100.0 if cur > 0 else 0.0)
        trends.append(
            {
                "condition_code": m["condition_code"],
                "condition_name": m["condition_name"],
                "current_count": cur,
                "prev_count": prev,
                "wow_pct": round(wow_pct, 2),
                "series": series_map.get(m["condition_code"], []),
            }
        )

    trends.sort(key=lambda x: (x["wow_pct"], x["current_count"]), reverse=True)
    top_trends = trends[:top_n]

    surges = []
    for t in top_trends:
        if t["current_count"] < 3:
            continue
        severity = None
        if t["wow_pct"] >= 100 and t["current_count"] >= 8:
            severity = "critical"
        elif t["wow_pct"] >= 50 and t["current_count"] >= 5:
            severity = "alert"
        elif t["wow_pct"] >= 25:
            severity = "watch"
        if severity:
            surges.append(
                {
                    "condition_name": t["condition_name"],
                    "condition_code": t["condition_code"],
                    "current_count": t["current_count"],
                    "previous_count": t["prev_count"],
                    "wow_pct": t["wow_pct"],
                    "severity": severity,
                }
            )

    return {
        "days": days,
        "start_date": start_date.isoformat(),
        "end_date": end_date.isoformat(),
        "trends": top_trends,
        "surges": surges,
    }
