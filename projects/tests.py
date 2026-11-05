from django.test import TestCase
from django.urls import reverse
from django.contrib.auth.models import User
from .models import Task

# Create your tests here.
class ProjectMembershipTest(TestCase):
    def setUp(self):
        pass
    # def testFetchMembersOfProject(self):
    #     response = self.client.get(path='/api/v1/projects/1/members/')
    #     print(response)

class TaskTest(TestCase):
    def setUp(self):
        User.objects.create(id=17, username='muzammil', password='muzammil1')

    def test_list_tasks(self):
        url = reverse('task-list')
        headers = {
            'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0b2tlbl90eXBlIjoiYWNjZXNzIiwiZXhwIjoxNzkzNjg4NTc1LCJpYXQiOjE3OTM2ODQ5NzUsImp0aSI6ImJiNDg3ZjEyNGNhNzQ2ODU4ODhmNWRiYmFjZDczM2ExIiwidXNlcl9pZCI6IjE1In0.mSvwjhLcU_UyZq6W1gjRWJ1kDKNu0cRkOTPrePyA4as'
        }
        response = self.client.get(path=url, headers=headers)
        print(response)

    def test_retrieve_task(self):
        kwargs = {
            'pk': 1,
        }
        url = reverse('task-detail', kwargs=kwargs)
        headers = {
            'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0b2tlbl90eXBlIjoiYWNjZXNzIiwiZXhwIjoxNzkzNjk0MzQ2LCJpYXQiOjE3OTM2OTA3NDYsImp0aSI6IjM5NTk1YTE4MzczMzQ5MGNiZGU0MWY5ZWEzMGI0YzBkIiwidXNlcl9pZCI6IjE3In0.t5iNy-aehweqExH-LHQ-vocfi104gH6JIkenJuxT6QU'
        }
        response = self.client.get(url ,headers=headers)
        print(response)