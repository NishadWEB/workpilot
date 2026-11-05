
from django.test import TestCase
from django.contrib.auth.models import User, Group
from django.urls import reverse

from rest_framework.test import APIClient
from rest_framework import status


class RegisterViewTest(TestCase):

    def setUp(self):
        Group.objects.create(name="MEMBER")

    def test_register_user(self):
        url = reverse("register")
        data = {
            "username": "testuser",
            "email": "test@gmail.com",
            "password": "Test12345!",
            "confirm_password": "Test12345!"
        }

        response = self.client.post(url, data, format="json")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        user = User.objects.get(username="testuser")

        self.assertTrue(user.groups.filter(name="MEMBER").exists())


class DetailViewTest(TestCase):

    def setUp(self):
        self.client = APIClient()

        self.user = User.objects.create_user(
            username="testuser",
            email="test@gmail.com",
            password="Test12345!"
        )

        self.url = reverse("user-detail")

        self.client.force_authenticate(user=self.user)

    def test_get_user_details(self):
        response = self.client.get(self.url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_update_user_details(self):
        data = {
            "username": "updateduser"
        }

        response = self.client.patch(
            self.url,
            data,
            format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)

        self.user.refresh_from_db()

        self.assertEqual(self.user.username, "updateduser")

    def test_delete_user_account(self):
        response = self.client.delete(self.url)

        self.assertEqual(
            response.status_code,
            status.HTTP_204_NO_CONTENT
        )

        self.user.refresh_from_db()

        self.assertFalse(self.user.is_active)
