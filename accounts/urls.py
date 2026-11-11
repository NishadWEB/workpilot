from django.urls import path, include
from .views import RegisterView, DetailView, GeneratePasswordResetLinkView, ResetPasswordView
from rest_framework_simplejwt.views import TokenObtainPairView,TokenRefreshView, TokenBlacklistView


urlpatterns = [
    path('register/', RegisterView.as_view(), name='register'),

    # JWT
    path('login/', TokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('logout/', TokenBlacklistView.as_view(), name='logout'),
    path('refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('email/', GeneratePasswordResetLinkView.as_view(), name='send_password_reset_email'),
    path('password/', ResetPasswordView.as_view(), name='password_reset_request'),
    
    path('users/me/', DetailView.as_view(), name='user-detail'),
]