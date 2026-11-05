import os
from celery import Celery
from celery.schedules import crontab

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')

app = Celery('myproject')
app.config_from_object('django.conf:settings', namespace='CELERY')
app.autodiscover_tasks()

app.conf.beat_schedule = {
    # Runs every Monday morning at 10:30 AM
    'daily-morning-reminder': {
        'task': 'accounts.tasks.send_morning_reminder',
        'schedule': crontab(hour=10, minute=30)
    },
}