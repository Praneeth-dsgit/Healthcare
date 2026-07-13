"""APScheduler jobs for patient engagement automations."""
from __future__ import annotations

import logging
import os
from typing import Optional

logger = logging.getLogger(__name__)

_scheduler = None


def _with_app_context(app, fn):
    def wrapper():
        with app.app_context():
            try:
                result = fn()
                logger.info('Engagement job %s => %s', fn.__name__, result)
            except Exception as exc:
                logger.exception('Engagement job %s failed: %s', fn.__name__, exc)
    return wrapper


def start_engagement_scheduler(app) -> Optional[object]:
    """Start background scheduler once (disabled when ENGAGEMENT_SCHEDULER=false)."""
    global _scheduler
    if os.getenv('ENGAGEMENT_SCHEDULER', 'true').lower() in ('0', 'false', 'no'):
        logger.info('Engagement scheduler disabled via ENGAGEMENT_SCHEDULER')
        return None
    if _scheduler is not None:
        return _scheduler

    try:
        from apscheduler.schedulers.background import BackgroundScheduler
    except ImportError:
        logger.warning('APScheduler not installed — engagement jobs will not run automatically')
        return None

    from services import engagement_orchestrator as orchestrator
    from services import engagement_rules_engine as rules

    scheduler = BackgroundScheduler(daemon=True)

    scheduler.add_job(
        _with_app_context(app, orchestrator.process_due_events),
        'interval',
        minutes=15,
        id='engagement_process_due',
        replace_existing=True,
    )
    scheduler.add_job(
        _with_app_context(app, lambda: rules.schedule_appointment_reminders(24)),
        'cron',
        hour=8,
        minute=0,
        id='engagement_appt_24h',
        replace_existing=True,
    )
    scheduler.add_job(
        _with_app_context(app, lambda: rules.schedule_appointment_reminders(2)),
        'interval',
        minutes=30,
        id='engagement_appt_2h',
        replace_existing=True,
    )
    scheduler.add_job(
        _with_app_context(app, rules.process_no_show_followups),
        'interval',
        hours=2,
        id='engagement_no_show',
        replace_existing=True,
    )
    scheduler.add_job(
        _with_app_context(app, rules.schedule_medication_reminders),
        'cron',
        hour=9,
        minute=0,
        id='engagement_meds',
        replace_existing=True,
    )
    scheduler.add_job(
        _with_app_context(app, rules.scan_care_gaps),
        'cron',
        hour=6,
        minute=0,
        id='engagement_care_gaps',
        replace_existing=True,
    )
    scheduler.add_job(
        _with_app_context(app, rules.schedule_followup_sequences),
        'cron',
        hour=10,
        minute=0,
        id='engagement_followups',
        replace_existing=True,
    )
    scheduler.add_job(
        _with_app_context(app, rules.recompute_all_risks),
        'cron',
        hour=5,
        minute=30,
        id='engagement_risk',
        replace_existing=True,
    )

    scheduler.start()
    _scheduler = scheduler
    logger.info('Engagement APScheduler started')
    return scheduler
