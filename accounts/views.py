from django.shortcuts import render
from django.contrib.auth.models import User, Group
from django.db import transaction
from rest_framework import generics
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework import status
from rest_framework.response import Response
from .serializers import UserSerializer, UserDetailSerializer
from .tasks import send_welcome_email


class RegisterView(generics.CreateAPIView):
    """
    API endpoint for user registration.

    Allows unauthenticated users to create a new account.
    Validates the submitted user details, creates the user within
    an atomic database transaction, and queues a welcome email
    through Celery after successful registration.

    Returns:
        201 Created: Registration successful.
        400 Bad Request: Validation errors.
    """
    serializer_class = UserSerializer
    permission_classes = [AllowAny]

    @transaction.atomic
    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        headers = self.get_success_headers(serializer.data)
        send_welcome_email.delay(username=serializer.validated_data.get('username'), to_email=serializer.validated_data.get('email'))
        return Response({"message": "Registered successfully."}, status=status.HTTP_201_CREATED, headers=headers)

    def perform_create(self, serializer):
        user = serializer.save()
        member_grp = Group.objects.get(name='MEMBER')
        user.groups.add(member_grp)

class DetailView(generics.RetrieveUpdateDestroyAPIView):
    """
    API endpoint for retrieving, updating, and deactivating user accounts.

    Requires authentication. Users can only access and modify their
    own account details.

    Supported operations:
        GET: Retrieve the authenticated user's details.
        PATCH: Partially update the user's details.
        DELETE: Deactivate the authenticated user's account
                by setting is_active to False.

    Returns:
        200 OK: User details retrieved or updated successfully.
        204 No Content: Account deactivated successfully.
        401 Unauthorized: Authentication required.
        404 Not Found: User account not found.
    """
    serializer_class = UserDetailSerializer
    permission_classes = [IsAuthenticated]
    http_method_names = ['get', 'patch', 'delete', 'head', 'options']

    
    def get_queryset(self):
        return User.objects.filter(id=self.request.user.id)

    def get_object(self):
        return self.request.user

    def destroy(self, request, *args, **kwargs):
        user = self.get_object()
        user.is_active = False
        user.save()
        return Response(status=status.HTTP_204_NO_CONTENT)