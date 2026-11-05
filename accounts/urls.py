from django.urls import path, include
from .views import RegisterView, DetailView
from rest_framework_simplejwt.views import TokenObtainPairView,TokenRefreshView, TokenBlacklistView


urlpatterns = [
    path('register/', RegisterView.as_view(), name='register'),

    # JWT
    path('login/', TokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('logout/', TokenBlacklistView.as_view(), name='logout'),
    path('refresh/', TokenRefreshView.as_view(), name='token_refresh'),

    
    path('users/me/', DetailView.as_view(), name='user-detail'),
]