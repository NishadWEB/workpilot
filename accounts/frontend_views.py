from django.shortcuts import redirect, render
from django.views.decorators.cache import never_cache


@never_cache
def index_page(request):
    """Redirect root URL to the dashboard page (auth-guard handles unauthenticated visitors)."""
    return redirect("frontend_dashboard")


@never_cache
def login_page(request):
    """Render the JWT login page."""
    return render(request, "login.html")


@never_cache
def register_page(request):
    """Render the user registration page."""
    return render(request, "register.html")


@never_cache
def dashboard_page(request):
    """Render the main dashboard overview page."""
    return render(request, "dashboard.html")


@never_cache
def projects_page(request):
    """Render the projects list and creation page."""
    return render(request, "projects.html")


@never_cache
def project_detail_page(request, project_id):
    """Render the project detail, statistics, team management, and project tasks page."""
    return render(request, "project_detail.html", {"project_id": project_id})


@never_cache
def tasks_page(request):
    """Render the tasks list, filters, and task creation page."""
    return render(request, "tasks.html")


@never_cache
def task_detail_page(request, task_id):
    """Render the task detail, assignee status control, and chat-style comments page."""
    return render(request, "task_detail.html", {"task_id": task_id})


@never_cache
def profile_page(request):
    """Render the user profile view/edit and account deactivation page."""
    return render(request, "profile.html")

@never_cache
def email_input_page(request):
    return render(request, "email_input.html")

@never_cache
def reset_password_page(request):
    return render(request, 'reset_password.html')