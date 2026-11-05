import os
from django.core.mail import send_mail, send_mass_mail
from celery import shared_task
from django.contrib.auth.models import User

@shared_task
def send_welcome_email(username, to_email):
    name = username.capitalize()
    subject = "Welcome to WorkPilot"
    message = (
        f"Welcome to WorkPilot, {name} 🎉\n\n"
        "We're glad to have you on board. "
        "Let's collaborate, achieve our goals, and grow together! 🚀"
    )

    return send_mail(
        subject=subject,
        message=message,
        from_email=None,
        recipient_list=[to_email],
        fail_silently=True
    )

@shared_task
def send_morning_reminder():
    users = User.objects.exclude(username='admin')
    messages = []

    for user in users:
        subject = 'Daily Reminders'
        message = (
            f"Hello {user.username},\n\n"
            "This is the daily reminder for you from our team...\n\n"
            "Lets grow together as one Team..."
        )
        from_email = None
        recipient_list = [user.email]
        messages.append((subject, message, from_email, recipient_list))

    send_mass_mail(tuple(messages), fail_silently=True)