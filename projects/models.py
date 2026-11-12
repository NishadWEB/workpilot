from django.db import models
from django.contrib.auth import get_user_model
User = get_user_model()


class Project(models.Model):
    class Status(models.TextChoices):
        ACTIVE = 'ACTIVE', 'Active'
        COMPLETED = 'COMPLETED', 'Completed'
        ARCHIVED = 'ARCHIVED', 'Archived'

    name = models.CharField(max_length=30, blank=False)
    description = models.TextField()

    users = models.ManyToManyField(
        User,
        through='ProjectMembership', # Junction-Table defined by the Developer
        related_name='projects',
    )

    status = models.CharField(max_length=15, choices=Status.choices, default=Status.ACTIVE, blank=True)
    is_available = models.BooleanField(blank=True, default=True)
    deadline = models.DateField(blank=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'projects'
        ordering = ['id']
        constraints = [
            models.UniqueConstraint(
                fields=['name'],
                condition=models.Q(is_available=True),
                name='unique_active_project_name'
            )
        ]

    def __str__(self):
        return self.name

class ProjectMembership(models.Model):
    class Role(models.TextChoices):
        MEMBER = 'MEMBER', 'Member'
        MANAGER = 'MANAGER', 'Manager'

    project = models.ForeignKey(
        Project,
        on_delete=models.CASCADE,
        related_name='memberships',
    )

    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='project_memberships',
    )

    role = models.CharField(
        max_length=15,
        choices=Role.choices,
        default=Role.MEMBER,
    )

    class Meta:
        db_table = 'project_membership'
        ordering = ['id']
        constraints = [
            models.UniqueConstraint(
                fields=['project', 'user'],
                name='unique_project_user_membership',
            )
        ]

    def __str__(self):
        return f'{self.user.username} - {self.project.name} ({self.role})'


class Task(models.Model):
    class Status(models.TextChoices):
        PENDING = 'PENDING', 'Pending'
        IN_PROGRESS = 'IN_PROGRESS', 'In Progress'
        COMPLETED = 'COMPLETED', 'Completed'

    class Priority(models.TextChoices):
        LOW = 'LOW', 'Low'
        MEDIUM = 'MEDIUM', 'Medium'
        HIGH = 'HIGH', 'High'

    title = models.CharField(max_length=100, blank=False)
    description = models.CharField(max_length=250)

    project = models.ForeignKey(
        Project,
        on_delete=models.CASCADE,
        related_name='tasks',
    )

    created_by = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='manager_tasks'
    )

    assignee = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='member_tasks'
    )

    status = models.CharField(max_length=15, choices=Status.choices, default=Status.PENDING)
    priority = models.CharField(max_length=15, choices=Priority.choices, default=Priority.MEDIUM)
    due_date = models.DateField()
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'tasks'
        ordering = ['id']

    def __str__(self):
        return f'Task : "{self.title}", {self.assignee} - ({self.project})'


class TaskComment(models.Model):
    task = models.ForeignKey(Task, on_delete=models.CASCADE, related_name='comments')
    author = models.ForeignKey(User, on_delete=models.CASCADE, related_name='my_comments')
    content  = models.TextField(blank=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'comments'
        ordering = ['id']

    def __str__(self):
        return f'Comment by {self.author.username} on Task {self.task.id}'