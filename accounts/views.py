from django.shortcuts import render
from django.contrib.auth.models import Group
from django.db import transaction, IntegrityError
from rest_framework import generics
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.exceptions import ValidationError
from .serializers import UserSerializer, UserDetailSerializer
from .tasks import send_welcome_email
from django.contrib.auth.tokens import PasswordResetTokenGenerator
from django.utils.http import urlsafe_base64_encode, urlsafe_base64_decode
from django.utils.encoding import force_bytes
from .tasks import send_reset_link
from django.contrib.auth import get_user_model
User = get_user_model()


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
        try:
            user = serializer.save()
        except IntegrityError:
            return Response({"message": "User with email id already exists."}, status=status.HTTP_409_CONFLICT)
        
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

def getPasswordTokenGenerator():
    return PasswordResetTokenGenerator()

class GeneratePasswordResetLinkView(APIView):
    def post(self, request):
        email = request.data.get('email')

        try:
            user = User.objects.get(email=email)
        except User.DoesNotExist:
            return Response({"message": "User with this email id does'nt exist."}, status=status.HTTP_404_NOT_FOUND)

        token_generator = getPasswordTokenGenerator()
        token = token_generator.make_token(user)
        user_id = urlsafe_base64_encode(force_bytes(user.id))
        url = f'http://127.0.0.1:8000/password?uid={user_id}&token={token}'
        send_reset_link.delay(url, email)
        return Response({"message": "Click the link sent via email to reset the password"}, status=status.HTTP_200_OK)


class ResetPasswordView(APIView):
    def post(self, request):
        uid = request.query_params.get('uid')
        token = request.query_params.get('token')

        user_id = int(urlsafe_base64_decode(uid).decode())

        try:
            user = User.objects.get(id=user_id)
        except User.DoesNotExist:
            return Response({"message": "User does'nt exist."}, status=status.HTTP_404_NOT_FOUND)

        token_generator = getPasswordTokenGenerator()
        token_generator.check_token(user, token)

        new_password = request.data.get('new_password')
        confirm_password = request.data.get('confirm_password')

        if new_password != confirm_password:
            raise ValidationError("Passwords does'nt match!")

        user.set_password(new_password)
        user.save()
        return Response({"message": "Password updated successfully"}, status=status.HTTP_200_OK)
        