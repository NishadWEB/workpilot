from django.contrib.auth.models import User
from django.db import IntegrityError
from rest_framework import serializers
from .models import Project, ProjectMembership, Task, TaskComment
from datetime import date
from accounts.serializers import UserSerializer


class AvailableUserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['id', 'username', 'email']


class ProjectSerializer(serializers.ModelSerializer):
    status = serializers.CharField(required=False)
    users = UserSerializer(many=True, read_only=True)

    class Meta:
        model = Project
        fields = ['id', 'name', 'description', 'users', 'status','is_available', 'deadline', 'created_at', 'updated_at']
        extra_kwargs = {
            'id': {'read_only': True},
            'users': {'read_only': True},
            'is_available': {'read_only': True},
            'created_at': {'read_only': True},
            'updated_at': {'read_only': True},
        }

    def validate_deadline(self, value):
        if value < date.today():
            raise serializers.ValidationError("Enter the correct date")
        return value

    def validate_status(self, value):
        if value not in Project.Status.values:
            raise serializers.ValidationError(f"Invalid status. Accepted values: ACTIVE, COMPLETED, ARCHIVED")
        return value


class ProjectMembershipSerializer(serializers.ModelSerializer):
    id = serializers.IntegerField(read_only=True, source='user.id')
    name = serializers.CharField(read_only=True, source='user.username')
    email = serializers.EmailField(read_only=True, source='user.email')

    class Meta:
        model = ProjectMembership
        fields = ['id', 'name', 'email', 'role']
        extra_kwargs = {
            'role': {'read_only': True},
        }


class ProjectMembershipAddMemberSerializer(serializers.Serializer):
    users = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.all(),
        many=True
    )

    def create(self, validated_data):
        created_memberships = []
        project_id = validated_data['project_id']
        users = validated_data['users']
        for user in users:
            try:
                membership = ProjectMembership.objects.create(
                    project_id=project_id, 
                    user=user, 
                    role=ProjectMembership.Role.MEMBER
                )
                created_memberships.append(membership)
            except IntegrityError as e:
                raise serializers.ValidationError({"message": f'{user.username.capitalize()} is already in this Project'})
            except Exception as e:
                raise e

        return created_memberships


class TaskSerializer(serializers.ModelSerializer):
    project_id = serializers.IntegerField(required=True)
    title = serializers.CharField(required=True)

    class Meta:
        model = Task
        fields = ['id', 'title', 'description', 'project_id','status', 'created_by', 'assignee','priority', 'due_date']

        extra_kwargs = {
            'id': {'read_only': True},
            'created_by': {'read_only': True},
            'status': {'read_only': True},
        }

    def validate(self, attrs):
        project_id = self.initial_data.get('project_id')
        assignee = attrs.get('assignee')

        if project_id and assignee:
            is_member = ProjectMembership.objects.filter(
                project_id=project_id,
                user=assignee,
                role=ProjectMembership.Role.MEMBER
            ).exists()

            if not is_member:
                raise serializers.ValidationError({
                    'assignee': 'This user is not a member of this project.'
                })

        return attrs

class TaskStatusSerializer(serializers.ModelSerializer):
    class Meta:
        model = Task
        fields = ['status']


class TaskCommentSerializer(serializers.ModelSerializer):
    task_id = serializers.IntegerField(source='task.id',  required=False)
    author_id = serializers.IntegerField(source='author.id', required=False)

    class Meta:
        model = TaskComment
        fields = ['id', 'task_id', 'author_id', 'content', 'created_at', 'updated_at']
        extra_kwargs = {
            'id': {'read_only': True},
            'task_id': {'read_only': True},
            'author_id': {'read_only': True},
            'created_at': {'read_only': True},
            'updated_at': {'read_only': True},
        }