# WorkSpaceCanvas

A full-stack office floor-plan editor. Companies build office layouts (walls, desks, rooms, doors, furniture) that employees can later use to book seats.

- **Frontend:** React + TypeScript (Vite)
- **Backend:** Django + Django REST Framework
- **Database:** PostgreSQL

The project is split into two folders:

```
propelon/
├── frontend/   React + Vite app
└── backend/    Django + DRF API
```

---

## Prerequisites

Make sure these are installed first:

- **Python 3.11+** and **pip**
- **Node.js 18+** and **npm**
- **PostgreSQL** (installed and running)
- **Git**

---

## 1. Clone the repository

```bash
git clone https://github.com/Asif-10/workspacecanvas.git
cd workspacecanvas
```

---

## 2. Backend setup (Django + Postgres)

### 2.1 Create and activate a virtual environment

```bash
cd backend
python -m venv venv
```

Activate it:

- **Windows (PowerShell):** `venv\Scripts\Activate.ps1`
- **Mac/Linux:** `source venv/bin/activate`

Your prompt should now show `(venv)`.

> If PowerShell blocks the activate script, run once:
> `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` then try again.

### 2.2 Install Python dependencies

```bash
pip install -r requirements.txt
```

### 2.3 Create the database in Postgres

Open psql:

```bash
psql -U postgres
```

Then run:

```sql
CREATE DATABASE workspacecanvas;
\q
```

### 2.4 Configure your database password

Open `backend/config/settings.py` and find the `DATABASES` section. Replace the placeholder password with **your own Postgres password**:

```python
'PASSWORD': 'CHANGE_ME',   # <-- put your local Postgres password here
```

(Keep the database name as `workspacecanvas` unless you created it under a different name.)

### 2.5 Run migrations (build the tables)

```bash
python manage.py makemigrations
python manage.py migrate
```

### 2.6 Seed the starter floor layouts

This loads the two demo floors (downstairs + upstairs) into your database. Run it once:

```bash
python seed_floors.py
```

You should see:

```
Seeded 'downstairs' with 85 objects.
Seeded 'upstairs' with 95 objects.
Done.
```

> Note: this script deletes and recreates those two floors each time you run it. Run it once for initial setup. Don't run it again after you start editing, or it will overwrite your changes.

### 2.7 (Optional) Create an admin login

To use the Django admin panel at `/admin/`:

```bash
python manage.py createsuperuser
```

### 2.8 Start the backend server

```bash
python manage.py runserver
```

The API is now live at **http://127.0.0.1:8000/api/**

Quick check, open these in a browser:
- http://127.0.0.1:8000/api/floors/ (both floors)
- http://127.0.0.1:8000/api/floors/upstairs/ (one floor)

Leave this terminal running.

---

## 3. Frontend setup (React + Vite)

Open a **second terminal** (leave the backend running in the first).

```bash
cd frontend
npm install
npm run dev
```

The app opens at **http://localhost:5173/**

The frontend talks to the backend at `http://127.0.0.1:8000/api` (set in `frontend/src/FloorPlanner.tsx` as `API_BASE`). If your backend runs on a different address, update that constant.

---

## 4. Using the app

- Opens on the **Upstairs** floor; use the dropdown (top bar) to switch floors.
- **Admin role** (default): full editing. Changes auto-save to the database, plus a manual **Save** button.
- **Employee role:** view-only, for booking (pass `role="employee"` to the component).
- Resize a component, then **Set as default size** to make new components of that type use that size (saved to the database).

---

## API reference

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/floors/` | List all floors |
| GET | `/api/floors/{slug}/` | Load one floor's layout |
| POST | `/api/floors/` | Create a new floor |
| PUT | `/api/floors/{slug}/layout/` | Save a floor's layout |
| GET | `/api/floors/default/` | Get the default floor |
| GET | `/api/default-sizes/` | Get saved default component sizes |
| PUT | `/api/default-sizes/{type}/` | Set a component type's default size |

`{slug}` is `downstairs` or `upstairs`.

---

## Data model

Each floor is a `Floor` row. Each desk/wall/chair/door is a `FloorObject` row linked to its floor, with fields: `object_id`, `type`, `label`, `x`, `y`, `w`, `h`, `rotation`, `zone`, `is_bookable`, `layer_group`, `is_visible`, `custom_color`, `image_src`.

Bookable seats are `FloorObject` rows where `is_bookable = true` (desks and chairs). Booking features can attach to these rows directly.

---

## Common issues

- **`ModuleNotFoundError: No module named 'django'`** → your virtual environment isn't activated. Run the activate command (see 2.1).
- **`password authentication failed for user "postgres"`** → the password in `settings.py` doesn't match your Postgres password (see 2.4).
- **Frontend loads but floors are empty / error toast** → the backend isn't running, or the database wasn't seeded (see 2.6).
