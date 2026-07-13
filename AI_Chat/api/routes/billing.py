"""Patient billing routes — wires BillingDashboard to the billing/payments tables."""
from __future__ import annotations

import io
import logging
import traceback
from datetime import datetime

from flask import Blueprint, g, jsonify, request, send_file
from utils.jwt_utils import require_jwt
from config import db

logger = logging.getLogger(__name__)

billing_bp = Blueprint('billing', __name__, url_prefix='/api/patient/billing')


def _row_to_dict(row):
    if row is None:
        return {}
    if hasattr(row, '_mapping'):
        return dict(row._mapping)
    try:
        return dict(row)
    except Exception:
        return {}


def _map_bill(row) -> dict:
    d = _row_to_dict(row)
    if not d:
        return {}
    total = float(d.get('total_amount') or 0)
    discount = float(d.get('discount_amount') or 0)
    tax = float(d.get('tax_amount') or 0)
    status = (d.get('status') or 'pending').replace('partially_paid', 'partial')
    return {
        'billing_id': d.get('bill_id'),
        'bill_number': d.get('bill_number'),
        'patient_id': d.get('patient_id'),
        'family_member_id': d.get('family_member_id'),
        'appointment_id': d.get('appointment_id'),
        'radiology_booking_id': d.get('radiology_booking_id'),
        'total_amount': float(d.get('subtotal') or total),
        'discount_amount': discount,
        'tax_amount': tax,
        'final_amount': total,
        'status': status if status in ('pending', 'partial', 'paid', 'cancelled') else 'pending',
        'due_date': str(d.get('due_date')) if d.get('due_date') else None,
        'created_at': str(d.get('created_at')) if d.get('created_at') else None,
        'notes': d.get('notes'),
        'bill_type': d.get('bill_type'),
    }


def _map_payment(row) -> dict:
    d = _row_to_dict(row)
    method = (d.get('payment_method') or 'other').replace('netbanking', 'net_banking')
    return {
        'payment_id': d.get('payment_id'),
        'billing_id': d.get('bill_id'),
        'payment_method': method,
        'amount': float(d.get('payment_amount') or 0),
        'transaction_id': d.get('transaction_id'),
        'payment_date': str(d.get('payment_date') or d.get('created_at') or ''),
        'status': d.get('payment_status') or 'pending',
        'notes': d.get('refund_reason'),
    }


def _ensure_tables():
    """Create minimal billing tables if schema migration was not applied."""
    try:
        db.session.execute(
            db.text(
                """
                CREATE TABLE IF NOT EXISTS billing (
                    bill_id INT AUTO_INCREMENT PRIMARY KEY,
                    bill_number VARCHAR(50) UNIQUE NOT NULL,
                    patient_id VARCHAR(50) NOT NULL,
                    family_member_id INT NULL,
                    bill_type VARCHAR(32) NOT NULL DEFAULT 'consultation',
                    appointment_id INT NULL,
                    radiology_booking_id INT NULL,
                    facility_id INT NULL,
                    subtotal DECIMAL(10,2) NOT NULL DEFAULT 0,
                    tax_amount DECIMAL(10,2) DEFAULT 0.00,
                    discount_amount DECIMAL(10,2) DEFAULT 0.00,
                    total_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
                    status VARCHAR(32) DEFAULT 'pending',
                    due_date DATE NULL,
                    paid_date DATE NULL,
                    notes TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    INDEX idx_patient (patient_id),
                    INDEX idx_status (status)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
                """
            )
        )
        db.session.execute(
            db.text(
                """
                CREATE TABLE IF NOT EXISTS payments (
                    payment_id INT AUTO_INCREMENT PRIMARY KEY,
                    bill_id INT NOT NULL,
                    patient_id VARCHAR(50) NOT NULL,
                    payment_method VARCHAR(32) NOT NULL,
                    payment_amount DECIMAL(10,2) NOT NULL,
                    transaction_id VARCHAR(100) NULL,
                    payment_status VARCHAR(32) DEFAULT 'pending',
                    payment_date TIMESTAMP NULL,
                    payment_gateway VARCHAR(50) NULL,
                    gateway_response TEXT NULL,
                    refund_amount DECIMAL(10,2) DEFAULT 0.00,
                    refund_date TIMESTAMP NULL,
                    refund_reason TEXT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    INDEX idx_bill (bill_id),
                    INDEX idx_patient (patient_id)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
                """
            )
        )
        db.session.commit()
    except Exception as exc:
        logger.warning('Could not ensure billing tables: %s', exc)
        try:
            db.session.rollback()
        except Exception:
            pass


@billing_bp.route('', methods=['GET', 'OPTIONS'])
@require_jwt
def list_bills():
    try:
        _ensure_tables()
        patient_id = g.patient_id or request.headers.get('X-Patient-ID')
        if not patient_id:
            return jsonify({'success': False, 'error': 'No patient record'}), 400

        clauses = ['patient_id = :pid']
        params = {'pid': patient_id}
        status = request.args.get('status')
        if status:
            db_status = 'partially_paid' if status == 'partial' else status
            clauses.append('status = :status')
            params['status'] = db_status
        if request.args.get('start_date'):
            clauses.append('DATE(created_at) >= :start_date')
            params['start_date'] = request.args.get('start_date')
        if request.args.get('end_date'):
            clauses.append('DATE(created_at) <= :end_date')
            params['end_date'] = request.args.get('end_date')

        rows = db.session.execute(
            db.text(
                f"""
                SELECT * FROM billing
                WHERE {' AND '.join(clauses)}
                ORDER BY created_at DESC
                """
            ),
            params,
        ).fetchall()
        return jsonify({'success': True, 'bills': [_map_bill(r) for r in rows]}), 200
    except Exception as exc:
        logger.error('list_bills error: %s\n%s', exc, traceback.format_exc())
        return jsonify({'success': False, 'error': 'Failed to load bills'}), 500


@billing_bp.route('/<int:billing_id>', methods=['GET', 'OPTIONS'])
@require_jwt
def get_bill(billing_id: int):
    try:
        _ensure_tables()
        patient_id = g.patient_id or request.headers.get('X-Patient-ID')
        row = db.session.execute(
            db.text('SELECT * FROM billing WHERE bill_id = :bid AND patient_id = :pid'),
            {'bid': billing_id, 'pid': patient_id},
        ).fetchone()
        if not row:
            return jsonify({'success': False, 'error': 'Bill not found'}), 404
        bill = _map_bill(row)
        # Optional line items table may not exist — return empty items
        bill['items'] = []
        return jsonify({'success': True, 'bill': bill}), 200
    except Exception as exc:
        logger.error('get_bill error: %s', exc)
        return jsonify({'success': False, 'error': 'Failed to load bill'}), 500


@billing_bp.route('/payments', methods=['GET', 'POST', 'OPTIONS'])
@require_jwt
def payments():
    try:
        _ensure_tables()
        patient_id = g.patient_id or request.headers.get('X-Patient-ID')
        if not patient_id:
            return jsonify({'success': False, 'error': 'No patient record'}), 400

        if request.method == 'GET':
            params = {'pid': patient_id}
            where = 'patient_id = :pid'
            billing_id = request.args.get('billing_id')
            if billing_id:
                where += ' AND bill_id = :bid'
                params['bid'] = int(billing_id)
            rows = db.session.execute(
                db.text(f'SELECT * FROM payments WHERE {where} ORDER BY created_at DESC'),
                params,
            ).fetchall()
            return jsonify({'success': True, 'payments': [_map_payment(r) for r in rows]}), 200

        data = request.get_json() or {}
        billing_id = data.get('billing_id')
        amount = data.get('amount')
        method = (data.get('payment_method') or 'other').replace('net_banking', 'netbanking')
        if not billing_id or amount is None:
            return jsonify({'success': False, 'error': 'billing_id and amount required'}), 400

        bill = db.session.execute(
            db.text('SELECT * FROM billing WHERE bill_id = :bid AND patient_id = :pid'),
            {'bid': billing_id, 'pid': patient_id},
        ).fetchone()
        if not bill:
            return jsonify({'success': False, 'error': 'Bill not found'}), 404

        bill_d = _row_to_dict(bill)
        txn = data.get('transaction_id') or f'TXN-{billing_id}-{int(datetime.utcnow().timestamp())}'
        result = db.session.execute(
            db.text(
                """
                INSERT INTO payments (
                  bill_id, patient_id, payment_method, payment_amount,
                  transaction_id, payment_status, payment_date
                ) VALUES (
                  :bid, :pid, :method, :amount, :txn, 'completed', NOW()
                )
                """
            ),
            {
                'bid': billing_id,
                'pid': patient_id,
                'method': method,
                'amount': float(amount),
                'txn': txn,
            },
        )
        payment_id = int(result.lastrowid)

        paid_total_row = db.session.execute(
            db.text(
                """
                SELECT COALESCE(SUM(payment_amount), 0) AS paid
                FROM payments
                WHERE bill_id = :bid AND payment_status = 'completed'
                """
            ),
            {'bid': billing_id},
        ).fetchone()
        paid = float(_row_to_dict(paid_total_row).get('paid') or 0)
        total = float(bill_d.get('total_amount') or 0)
        if paid >= total:
            new_status = 'paid'
            paid_date_sql = ', paid_date = CURDATE()'
        elif paid > 0:
            new_status = 'partially_paid'
            paid_date_sql = ''
        else:
            new_status = 'pending'
            paid_date_sql = ''

        db.session.execute(
            db.text(f'UPDATE billing SET status = :status{paid_date_sql} WHERE bill_id = :bid'),
            {'status': new_status, 'bid': billing_id},
        )
        db.session.commit()

        payment = {
            'payment_id': payment_id,
            'billing_id': billing_id,
            'payment_method': data.get('payment_method') or method,
            'amount': float(amount),
            'transaction_id': txn,
            'payment_date': datetime.utcnow().isoformat() + 'Z',
            'status': 'completed',
            'notes': data.get('notes'),
        }
        return jsonify({'success': True, 'payment': payment}), 200
    except Exception as exc:
        logger.error('payments error: %s\n%s', exc, traceback.format_exc())
        try:
            db.session.rollback()
        except Exception:
            pass
        return jsonify({'success': False, 'error': 'Payment failed'}), 500


@billing_bp.route('/<int:billing_id>/invoice', methods=['GET', 'OPTIONS'])
@require_jwt
def invoice(billing_id: int):
    try:
        _ensure_tables()
        patient_id = g.patient_id or request.headers.get('X-Patient-ID')
        row = db.session.execute(
            db.text('SELECT * FROM billing WHERE bill_id = :bid AND patient_id = :pid'),
            {'bid': billing_id, 'pid': patient_id},
        ).fetchone()
        if not row:
            return jsonify({'success': False, 'error': 'Bill not found'}), 404
        bill = _map_bill(row)

        try:
            from reportlab.lib.pagesizes import letter
            from reportlab.pdfgen import canvas

            buf = io.BytesIO()
            c = canvas.Canvas(buf, pagesize=letter)
            c.setFont('Helvetica-Bold', 16)
            c.drawString(72, 750, 'Acufore Health — Invoice')
            c.setFont('Helvetica', 11)
            y = 720
            lines = [
                f"Bill #: {bill.get('bill_number') or billing_id}",
                f"Patient ID: {bill.get('patient_id')}",
                f"Status: {bill.get('status')}",
                f"Subtotal: {bill.get('total_amount')}",
                f"Tax: {bill.get('tax_amount')}",
                f"Discount: {bill.get('discount_amount')}",
                f"Total due: {bill.get('final_amount')}",
                f"Due date: {bill.get('due_date') or 'N/A'}",
                '',
                'This invoice was generated from the patient portal.',
            ]
            for line in lines:
                c.drawString(72, y, str(line))
                y -= 18
            c.showPage()
            c.save()
            buf.seek(0)
            return send_file(
                buf,
                mimetype='application/pdf',
                as_attachment=True,
                download_name=f'invoice-{billing_id}.pdf',
            )
        except ImportError:
            # Fallback plain text
            content = (
                f"Acufore Health Invoice\n"
                f"Bill #{bill.get('bill_number') or billing_id}\n"
                f"Patient: {bill.get('patient_id')}\n"
                f"Total: {bill.get('final_amount')}\n"
                f"Status: {bill.get('status')}\n"
            ).encode('utf-8')
            return send_file(
                io.BytesIO(content),
                mimetype='text/plain',
                as_attachment=True,
                download_name=f'invoice-{billing_id}.txt',
            )
    except Exception as exc:
        logger.error('invoice error: %s', exc)
        return jsonify({'success': False, 'error': 'Failed to generate invoice'}), 500
