from django.contrib import admin
from .models import Project, ProjectMembership, Task,TaskComment

# Register your models here.
admin.site.register([Project, ProjectMembership, Task, TaskComment])