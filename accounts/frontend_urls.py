from django.urls import path
from . import frontend_views

urlpatterns = [
    path("", frontend_views.index_page, name="frontend_index"),
    path("login/", frontend_views.login_page, name="frontend_login"),
    path("register/", frontend_views.register_page, name="frontend_register"),
    path("dashboard/", frontend_views.dashboard_page, name="frontend_dashboard"),
    path("projects/", frontend_views.projects_page, name="frontend_projects"),
    path("projects/<int:project_id>/", frontend_views.project_detail_page, name="frontend_project_detail"),
    path("tasks/", frontend_views.tasks_page, name="frontend_tasks"),
    path("tasks/<int:task_id>/", frontend_views.task_detail_page, name="frontend_task_detail"),
    path("profile/", frontend_views.profile_page, name="frontend_profile"),
    path('email-input/', frontend_views.email_input_page, name='email_input'),
    path('password/', frontend_views.reset_password_page, name='reset_password'),
]
