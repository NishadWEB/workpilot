from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer, TokenRefreshSerializer
from rest_framework.exceptions import AuthenticationFailed
from django.contrib.auth import get_user_model
from rest_framework_simplejwt.tokens import RefreshToken
from django.contrib.auth import get_user_model
User = get_user_model()

def get_user_role(user):
    if user.groups.filter(name="MANAGER").exists():
        return "MANAGER"

    if user.groups.filter(name="MEMBER").exists():
        return "MEMBER"

    raise AuthenticationFailed("User does not have a valid WorkPilot role.")


class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        token['role'] = get_user_role(user)
        token['username'] = user.username
        return token


class CustomTokenRefreshSerializer(TokenRefreshSerializer):

    def validate(self, attrs):

        # 1. Read and validate the incoming refresh token
        refresh = RefreshToken(attrs["refresh"])

        # 2. Extract the user ID from the token
        user_id = refresh.payload.get('user_id')

        # 3. Retrieve the current user from the database
        User = get_user_model()

        try:
            user = User.objects.get(id=user_id)
        except (User.DoesNotExist, ValueError, TypeError):
            raise AuthenticationFailed("User not found.")

        # 4. Check whether the user is active
        if not user.is_active:
            raise AuthenticationFailed("User account is inactive.")

        # 5. Get the user's current role from Django Groups
        role = get_user_role(user)

        # 6. Update claims in the incoming refresh token
        refresh["role"] = role
        refresh["username"] = user.username

        # 7. Pass the updated token to Simple JWT's original implementation
        attrs["refresh"] = str(refresh)

        return super().validate(attrs)

    
class UserSerializer(serializers.ModelSerializer):
    email = serializers.EmailField(required=True)
    confirm_password = serializers.CharField(write_only=True, required=True)

    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'password', 'confirm_password']
        extra_kwargs = {
            'id': {'read_only': True},
            'password' : {'write_only': True},
        }

    def validate(self, attrs):
        password = attrs.get('password')
        confirm_password = attrs.get('confirm_password')
        if password != confirm_password:
            raise serializers.ValidationError("Passwords does'nt match!")
        return attrs
        
    def create(self, validated_data):
        username = validated_data.get('username')
        password = validated_data.get('password')
        email = validated_data.get('email')
        user = User.objects.create_user(username=username, password=password, email=email)
        return user


class UserDetailSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'is_superuser', 'is_staff', 'is_active', 'date_joined']
        extra_kwargs = {
            'id': {'read_only': True},
            'is_superuser': {'read_only': True},
            'is_staff': {'read_only': True},
            'is_active': {'read_only': True},
            'date_joined': {'read_only': True},
        }

