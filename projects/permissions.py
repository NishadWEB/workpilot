from rest_framework.permissions import BasePermission
from .models import TaskComment, ProjectMembership


class IsProjectMember(BasePermission):
    def has_permission(self, request, view):
        user = request.user
        return user.projects.filter(pk=view.kwargs.get('project_id')).exists()


class IsProjectManager(BasePermission):
    def has_permission(self, request, view):
        user = request.user
        return user.groups.filter(name='MANAGER').exists()


class IsTaskCommenter(BasePermission):
    def has_permission(self, request, view):
        return TaskComment.objects.filter(author=request.user, task_id=view.kwargs.get('task_id')).exists()


class IsProjectManagerOfProject(BasePermission):
    def has_object_permission(self, request, view, obj):
        return ProjectMembership.objects.filter(
            project=obj,
            user=request.user,
            role=ProjectMembership.Role.MANAGER
        ).exists()