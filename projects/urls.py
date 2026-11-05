from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    ProjectView, 
    ProjectMembershipListCreateAPIView, 
    ProjectMembershipRetrieveUpdateDestroyAPIView, 
    TaskView,
    TaskCommentListCreateView,
    TaskCommentRetrieveUpdateDestroyView,
    TaskStatusUpdateView,
    AvailableUsersView,
)

router = DefaultRouter()
router.register('projects', ProjectView, basename='project')
router.register('tasks', TaskView, basename='task')

urlpatterns = [
    path('', include(router.urls)),

    path('users/available/', AvailableUsersView.as_view(), name='available-users'),

    path('projects/<int:project_id>/members/', ProjectMembershipListCreateAPIView.as_view(), name='project_membership_non_pk'),
    path('projects/<int:project_id>/members/<int:member_id>/', ProjectMembershipRetrieveUpdateDestroyAPIView.as_view(), name='project_membership_pk'),

    path('tasks/<int:task_id>/status/', TaskStatusUpdateView.as_view(), name='task-status-update'),

    # TaskComments
    path('tasks/<int:task_id>/comments/', TaskCommentListCreateView.as_view(), name='task_comment_non_pk'),
    path('tasks/<int:task_id>/comments/<int:comment_id>/', TaskCommentRetrieveUpdateDestroyView.as_view(), name='task_comment_pk'),
]