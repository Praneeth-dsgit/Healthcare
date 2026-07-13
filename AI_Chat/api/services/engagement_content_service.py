"""AI-personalized engagement message content."""
from __future__ import annotations

import logging
from typing import Optional

logger = logging.getLogger(__name__)

DISCLAIMER = (
    "\n\nThis is an automated care engagement message from Acufore Health. "
    "It is not a diagnosis. Contact your care team for medical advice."
)


def render_template(
    event_type: str,
    patient_name: str,
    *,
    appointment_date: Optional[str] = None,
    appointment_time: Optional[str] = None,
    doctor_name: Optional[str] = None,
    medication_name: Optional[str] = None,
    dosage: Optional[str] = None,
    gap_title: Optional[str] = None,
    custom_message: Optional[str] = None,
) -> tuple[str, str]:
    """Return (title, message) for a standard engagement event."""
    first = (patient_name or 'there').split()[0]

    if custom_message:
        return ('Message from Acufore Health', f'Hi {first},\n\n{custom_message}{DISCLAIMER}')

    if event_type == 'appointment_reminder':
        when = ' '.join(p for p in [appointment_date, appointment_time] if p) or 'your upcoming visit'
        with_doc = f' with {doctor_name}' if doctor_name else ''
        title = 'Appointment reminder'
        body = (
            f'Hi {first},\n\n'
            f'This is a reminder of your appointment{with_doc} on {when}.\n'
            f'Please arrive a few minutes early, or join your telemedicine visit from the portal.'
        )
        return title, body + DISCLAIMER

    if event_type == 'appointment_confirmation':
        when = ' '.join(p for p in [appointment_date, appointment_time] if p) or 'the selected time'
        with_doc = f' with {doctor_name}' if doctor_name else ''
        title = 'Appointment confirmed'
        body = f'Hi {first},\n\nYour appointment{with_doc} is confirmed for {when}.'
        return title, body + DISCLAIMER

    if event_type == 'appointment_no_show':
        title = 'We missed you'
        body = (
            f'Hi {first},\n\n'
            f'It looks like you may have missed your recent appointment. '
            f'Please reschedule from the patient portal when you can.'
        )
        return title, body + DISCLAIMER

    if event_type == 'medication_reminder':
        med = medication_name or 'your medication'
        dose = f' ({dosage})' if dosage else ''
        title = 'Medication reminder'
        body = f'Hi {first},\n\nReminder to take {med}{dose}. Log it in your Engagement Hub when done.'
        return title, body + DISCLAIMER

    if event_type == 'preventive_reminder':
        title = gap_title or 'Preventive care reminder'
        body = (
            f'Hi {first},\n\n'
            f'A recommended preventive care item may be due: {title}. '
            f'Review care gaps in your portal and book a visit if needed.'
        )
        return title, body + DISCLAIMER

    if event_type == 'follow_up':
        title = 'Follow-up check-in'
        body = (
            f'Hi {first},\n\n'
            f'How are you feeling after your recent visit? '
            f'Reply in the portal chat or book a follow-up if symptoms persist.'
        )
        return title, body + DISCLAIMER

    if event_type == 'care_gap':
        title = gap_title or 'Care gap identified'
        body = f'Hi {first},\n\nOur care team identified an open care task: {title}. Please review it in your portal.'
        return title, body + DISCLAIMER

    title = 'Acufore Health update'
    body = f'Hi {first},\n\nYou have a new care engagement update in your patient portal.'
    return title, body + DISCLAIMER


def personalize_with_ai(base_message: str, patient_context: str = '') -> str:
    """Optionally polish message copy with OpenAI; fall back to base_message."""
    if not patient_context.strip():
        return base_message
    try:
        import openai

        response = openai.ChatCompletion.create(
            model='gpt-4.1-mini',
            messages=[
                {
                    'role': 'system',
                    'content': (
                        'Rewrite the outreach message to be warm, concise, and patient-friendly. '
                        'Do not invent clinical facts. Keep the disclaimer. Plain text only.'
                    ),
                },
                {
                    'role': 'user',
                    'content': f'Patient context:\n{patient_context[:1500]}\n\nMessage:\n{base_message}',
                },
            ],
            max_tokens=280,
            temperature=0.4,
        )
        text = (response.choices[0].message.content or '').strip()
        return text or base_message
    except Exception as exc:
        logger.warning('AI personalization skipped: %s', exc)
        return base_message
