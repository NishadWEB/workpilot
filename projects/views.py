from drf_spectacular.utils import extend_schema, OpenApiResponse
from django.utils import timezone
from django.db import transaction
from django.contrib.auth.models import  Group
from django.db.models import Count, Q
from django.utils.decorators import method_decorator
from django.shortcuts import get_object_or_404
from rest_framework.viewsets import ModelViewSet
from rest_framework.generics import (
    ListCreateAPIView,
    RetrieveUpdateDestroyAPIView,
    UpdateAPIView,
    DestroyAPIView,
    ListAPIView,
)
from rest_framework.pagination import PageNumberPagination
from rest_framework.decorators import action
from rest_framework.filters import SearchFilter, OrderingFilter
from rest_framework.permissions import IsAuthenticated
from rest_framework import status
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend
from .models import Project, ProjectMembership, Task, TaskComment
from .serializers import (
    ProjectSerializer,
    ProjectMembershipSerializer,
    ProjectMembershipAddMemberSerializer,
    TaskSerializer,
    TaskStatusSerializer,
    TaskCommentSerializer,
    AvailableUserSerializer,
)
from accounts.serializers import UserSerializer
from .permissions import (
    IsProjectManager,
    IsTaskCommenter,
    IsProjectManagerOfProject,
)
from django.contrib.auth import get_user_model
User = get_user_model()

class AvailableUsersView(ListAPIView):
    serializer_class = AvailableUserSerializer
    permission_classes = [IsAuthenticated, IsProjectManager]

    filter_backends = [SearchFilter]
    search_fields = ['username', 'email']

    def get_queryset(self):
        return User.objects.filter(
            is_active=True,
            groups__name='MEMBER',
            project_memberships__isnull=True
        ).distinct().order_by('id')


class ProjectView(ModelViewSet):
    """
    API endpoints for managing projects.

    Requires authentication. Users can access projects associated
    with their account.

    Supported operations:
        GET: List accessible projects with search, filtering,
             and ordering.
        POST: Create a project (Manager only).
        GET (detail): Retrieve project details.
        PATCH: Partially update project details.
        DELETE: Soft-delete a project by marking it unavailable.
        GET (statistics): Retrieve project details, team members,
                          manager information, and task statistics.
    """

    serializer_class = ProjectSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = PageNumberPagination
    http_method_names = ['get', 'post', 'patch', 'delete', 'head', 'options']

    filter_backends = [SearchFilter, DjangoFilterBackend, OrderingFilter]
    search_fields = ['name', 'description']
    filterset_fields = ['status', 'deadline', 'is_available', 'created_at']
    ordering_fields = ['status', 'created_at', 'deadline']


    @action(detail=True, methods=['get'])
    def statistics(self, request, pk=None):
        project = Project.objects.prefetch_related(
            'users__groups',
            'tasks'
        ).get(pk=pk)
        project_data = ProjectSerializer(project).data

        manager = None

        for user in project.users.all():
            for group in user.groups.all():
                if group.name == 'MANAGER':
                    manager = user

        manager_id = manager.id
        members = [
            member
            for member in project_data.get('users')
            if member['id'] != manager_id
        ]
        project_data.pop('users')

        manager = UserSerializer(manager).data

        tasks_stat = project.tasks.all().aggregate(
            total_tasks=Count('id'),
            pending_tasks=Count('id', filter=Q(status='PENDING')),
            in_progress_tasks=Count('id', filter=Q(status='IN_PROGRESS')),
            completed_tasks=Count('id', filter=Q(status='COMPLETED')),
            overdue_tasks=Count(
                'id',
                filter=Q(due_date__lt=timezone.localdate())
            ),
        )

        statistics_template = {
            "project": project_data,
            "team": {
                "manager": manager,
                "members": members,
                "total_members": len(members) + 1
            },
            "task_statistics": tasks_stat
        }

        return Response(
            statistics_template,
            status=status.HTTP_200_OK
        )

    def get_permissions(self):
        if self.action in ['partial_update', 'destroy']:
            return [IsAuthenticated(), IsProjectManagerOfProject()]
        return [IsAuthenticated()]
    
    def get_queryset(self):
        print("fetching projects...")
        return self.request.user.projects.filter(is_available=True)

    def create(self, request, *args, **kwargs):
        manager_grp = Group.objects.get(id=3)
        curr_user_groups = self.request.user.groups.all()

        if curr_user_groups.contains(manager_grp):
            serializer = self.get_serializer(data=request.data)
            serializer.is_valid(raise_exception=True)

            with transaction.atomic():
                self.perform_create(serializer)
                project = serializer.instance
                ProjectMembership.objects.create(
                    project=project,
                    user=self.request.user,
                    role='MANAGER'
                )

            headers = self.get_success_headers(serializer.data)
            return Response(
                serializer.data,
                status=status.HTTP_201_CREATED,
                headers=headers
            )

        return Response(
            {"message": "Only Manager can Create a Project."},
            status=status.HTTP_401_UNAUTHORIZED
        )

    def destroy(self, request, *args, **kwargs):
        project = self.get_object()
        project.is_available = False

        ProjectMembership.objects.filter(project_id=project.id).delete()
        
        project.save()
        return Response(status=status.HTTP_204_NO_CONTENT)


@method_decorator(transaction.atomic, name='dispatch')
class ProjectMembershipListCreateAPIView(ListCreateAPIView):
    """
    API endpoints for managing project memberships.

    Requires authentication and project manager permissions.

    Supported operations:
        GET: List all members belonging to a specific project.
        POST: Add an existing user to a project with the specified
              membership role.

    Project association is determined from the project_id
    URL parameter.
    """

    permission_classes = [IsAuthenticated, IsProjectManager]

    def get_queryset(self):
        project = get_object_or_404(
            Project,
            pk=self.kwargs.get('project_id')
        )
        return ProjectMembership.objects.filter(project=project)

    def get_serializer_class(self):
        if self.request.method == 'POST':
            return ProjectMembershipAddMemberSerializer
        return ProjectMembershipSerializer

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)

        response_serializer = ProjectMembershipSerializer(
            serializer.instance,
            many=True
        )
        print(response_serializer.data)

        return Response(
            response_serializer.data,
            status=status.HTTP_201_CREATED
        )

    def list(self, request, *args, **kwargs):
        return super().list(request, *args, **kwargs)

    def perform_create(self, serializer):
        serializer.save(project_id=self.kwargs.get('project_id'))


class ProjectMembershipRetrieveUpdateDestroyAPIView(RetrieveUpdateDestroyAPIView):
    """
    API endpoints for retrieving and removing project memberships.

    Requires authentication and project manager permissions.

    Supported operations:
        GET: Retrieve user details associated with a membership.
        DELETE: Remove a user from the project.

    Membership lookup is scoped to the specified project.
    """

    permission_classes = [IsAuthenticated, IsProjectManager]
    lookup_url_kwarg = "member_id"
    lookup_field = "user_id"
    http_method_names = ['get', 'delete', 'head', 'options']

    def get_queryset(self):
        return ProjectMembership.objects.filter(
            project_id=self.kwargs.get('project_id')
        )

    def retrieve(self, request, *args, **kwargs):
        membership = self.get_object()
        serializer = UserSerializer(membership.user)
        return Response(serializer.data)

    def destroy(self, request, *args, **kwargs):
        membership = self.get_object()

        # Compare the member's user ID with the authenticated user's ID.
        if membership.user_id == request.user.id:
            return Response(
                {
                    "message": (
                        "You cannot remove yourself from the project."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST
            )

        self.perform_destroy(membership)
        return Response(status=status.HTTP_204_NO_CONTENT)


class TaskView(ModelViewSet):
    """
    API endpoints for managing project tasks.

    Requires authentication.

    Managers:
        - View tasks belonging to projects they manage.
        - View tasks assigned to them.
        - Create, update, and delete tasks.
        - Cannot update task status through this endpoint.

    Members:
        - View tasks assigned to them.
        - Retrieve accessible task details.

    Supports filtering, searching, and pagination.
    """

    serializer_class = TaskSerializer
    http_method_names = ['get', 'post', 'patch', 'delete', 'head', 'options']

    filter_backends = [DjangoFilterBackend, SearchFilter]
    filterset_fields = ['project_id', 'status', 'priority']
    search_fields = ['title', 'description']

    def get_permissions(self):
        if self.action in ['create', 'partial_update', 'destroy']:
            return [IsAuthenticated(), IsProjectManager()]

        return [IsAuthenticated()]


    def create(self, request, *args, **kwargs):
        return super().create(request, *args, **kwargs)

    def get_queryset(self):
        user = self.request.user

        if user.groups.filter(name='MANAGER').exists():
            return Task.objects.filter(
                Q(assignee=user) |
                Q(
                    project__memberships__user=user,
                    project__memberships__role='MANAGER'
                )
            ).distinct()

        return Task.objects.filter(assignee=user)

    @extend_schema(
        summary="Update task details",
        description="""
        Allows project managers to update task details.

        Managers can update title, description, project,
        priority, assignee, and due date.

        Task status cannot be updated through this endpoint.
        Members must use the dedicated task status endpoint.
        """,
        request=TaskSerializer,
        responses={
            200: TaskSerializer,
            400: OpenApiResponse(description="Validation errors."),
            403: OpenApiResponse(description="Permission denied."),
            404: OpenApiResponse(description="Task not found."),
        }
    )
    def partial_update(self, request, *args, **kwargs):
        return super().partial_update(request, *args, **kwargs)

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)


class TaskStatusUpdateView(UpdateAPIView):
    """
    API endpoint for updating the status of assigned tasks.

    Requires authentication.

    Members can update the status of tasks assigned to them.
    Other task details cannot be modified through this endpoint.

    Supported operations:
        PATCH: Update task status.

    Task identification is handled through the task_id URL parameter.
    """

    serializer_class = TaskStatusSerializer
    permission_classes = [IsAuthenticated]
    lookup_url_kwarg = 'task_id'
    lookup_field = 'id'
    http_method_names = ['patch', 'head', 'options']

    def get_queryset(self):
        return Task.objects.filter(assignee=self.request.user)

    @extend_schema(
        summary="Update task status",
        description="""
        Allows members to update the status of their assigned tasks.
        Only the status field can be modified.
        """,
        request=TaskStatusSerializer,
        responses={
            200: TaskStatusSerializer,
            400: OpenApiResponse(description="Invalid status."),
            404: OpenApiResponse(
                description="Task not found or not assigned to you."
            ),
        }
    )
    def update(self, request, *args, **kwargs):
        return super().update(request, *args, **kwargs)


class TaskCommentListCreateView(ListCreateAPIView):
    """
    API endpoints for listing and creating task comments.

    Requires authentication.

    Supported operations:
        GET: List all comments associated with a task, provided
             the authenticated user is the task's assignee or creator.
        POST: Create a comment for a task under the same access rule.

    The task is identified through the task_id URL parameter.
    The comment author is assigned from the authenticated user.
    """

    serializer_class = TaskCommentSerializer
    permission_classes = [IsAuthenticated]

    def get_task(self):
        """
        Return the requested task only when the authenticated user
        is its assignee or creator. Return 404 otherwise.
        """
        task_id = self.kwargs.get('task_id')

        return get_object_or_404(
            Task.objects.filter(
                Q(assignee=self.request.user) |
                Q(created_by=self.request.user)
            ),
            id=task_id
        )

    def get_queryset(self):
        # Check task access before retrieving any comments.
        task = self.get_task()

        # Return every comment in the task conversation.
        return TaskComment.objects.filter(
            task=task
        ).select_related('author').order_by('created_at')

    def perform_create(self, serializer):
        # Apply the same task access check before creating a comment.
        task = self.get_task()

        serializer.save(
            author=self.request.user,
            task=task
        )


class TaskCommentRetrieveUpdateDestroyView(UpdateAPIView, DestroyAPIView):
    """
    API endpoints for updating and deleting task comments.

    Requires authentication and task comment ownership permissions.

    Supported operations:
        PATCH: Partially update an existing comment.
        DELETE: Delete an existing comment.

    Comment lookup is restricted to the authenticated user's
    comments within the specified task.
    """

    lookup_url_kwarg = 'comment_id'
    lookup_field = 'id'
    serializer_class = TaskCommentSerializer
    permission_classes = [IsAuthenticated, IsTaskCommenter]
    http_method_names = ['patch', 'delete', 'head', 'options']

    def get_queryset(self):
        return TaskComment.objects.filter(
            task_id=self.kwargs.get('task_id'),
            author=self.request.user
        )
