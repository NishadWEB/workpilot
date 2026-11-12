# WorkPilot

WorkPilot is a role-based project and task management web application built with **Django**, **Django REST Framework**, and a responsive **Vanilla JavaScript + Bootstrap 5** frontend. It supports project creation, team membership management, task tracking, real-time statistics, and a chat-style task discussion interface with light/dark mode support.

## Key Features

- **JWT Authentication & Role Access**: Custom JWT claims (SimpleJWT) with token rotation, blacklisting, and role-scoped permissions (`MANAGER` and `MEMBER`).
- **Project & Team Management**: Create projects, assign team members, track deadlines, and monitor live project statistics.
- **Task Workflow & Chat Discussions**: Assign tasks to project members, filter by status or priority, update task progress, and collaborate via an inline comment thread.
- **Asynchronous Email & Task Queue**: Welcome emails, password-reset verification links, and scheduled daily reminders are offloaded to **Redis** and processed by **Celery**.
- **Interactive API Docs**: Built-in OpenAPI 3 schema generation with Swagger UI and ReDoc via `drf-spectacular`.

## Tech Stack

| Layer | Technology |
|---|---|
| **Backend** | Python 3.11+, Django 5.2, Django REST Framework |
| **Authentication** | `djangorestframework-simplejwt` (Access & Refresh JWTs) |
| **Database** | PostgreSQL |
| **Message Broker & Queue** | Redis + Celery (Worker & Beat) |
| **Frontend** | Django Templates, Vanilla JavaScript, Bootstrap 5, Custom CSS |
| **API Documentation** | `drf-spectacular` (Swagger UI & ReDoc) |

## Setup & Installation

### 1. Prerequisites

Ensure **Python 3.11+**, **PostgreSQL**, and **Redis** (`redis-server`) are installed and running on your machine.

### 2. Create & Activate Virtual Environment

```bash
cd WorkPilot
python -m venv env

# Windows
env\Scripts\activate

# macOS / Linux
source env/bin/activate
```

### 3. Install Dependencies

```bash
pip install -r requirements.txt
```

### 4. Configure Environment Variables

Create a `.env` file in the `WorkPilot/` root directory (next to `manage.py`):

```env
SECRET_KEY=your_secret_key

DB_NAME=db_name
DB_USER=user_name
DB_PASSWORD=password
DB_HOST=host_name
DB_PORT=port_number

DEBUG=true

EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_HOST_USER=your_email_id
EMAIL_HOST_PASSWORD=your_app_password

DEFAULT_FROM_EMAIL="your_project_name <your_email_id>"

CELERY_BROKER_URL=redis://localhost:6379/0
CELERY_RESULT_BACKEND=redis://localhost:6379/0
```

### 5. Run Migrations & Create Superuser

```bash
python manage.py migrate
python manage.py createsuperuser
```

> **Why a Superuser is Required:** All newly registered users are assigned to the `MEMBER` group by default. You must log into **Django Admin (`/admin/`)** with your superuser account to promote users from `MEMBER` to the `MANAGER` group so they can create projects, manage teams, and assign tasks.

### 6. Start the Application (All 3 Services Required)

Make sure **Redis** is running (`redis-server`), then open three terminals with your virtual environment activated.

**1. Run the Django development server:**

```bash
python manage.py runserver
```

**2. Run the Celery Worker (Required):**

WorkPilot uses `.delay()` to offload welcome emails and password-reset verification links to Redis. Without the Celery worker running, password-reset and welcome emails will not be sent.

```bash
# Linux / macOS
celery -A config worker -l info

# Windows
celery -A config worker -l info -P solo
```

**3. Run Celery Beat (Required for Scheduled Reminders):**

Dispatches scheduled background jobs.

```bash
celery -A config beat -l info
```

### 7. Open WorkPilot in Your Browser

Once the Django development server is running, open your browser and navigate to:

**[http://127.0.0.1:8000/](http://127.0.0.1:8000/)**

You can now access and start using WorkPilot.