<div align="center">

![Header](https://capsule-render.vercel.app/api?type=waving&color=0:0f172a,35:1d4ed8,70:0ea5e9,100:14b8a6&height=220&section=header&text=FlowBit&fontSize=48&fontColor=ffffff&fontAlignY=38&desc=Realtime%20Numeric%20Transaction%20Operations%20Platform&descAlignY=58&animation=fadeIn)

[![Release](https://img.shields.io/badge/Release-v0.1.0--beta-0ea5e9?style=for-the-badge)](https://github.com/dana-khaing/FlowBit_Capacity-Based-Numeric-Transaction-Management-System/releases/tag/v0.1.0-beta)
[![Status](https://img.shields.io/badge/Status-Deployed_Beta-0f766e?style=for-the-badge)](https://flowbitdev.vercel.app)
[![License](https://img.shields.io/badge/License-Proprietary-111827?style=for-the-badge)](./LICENSE)
[![Frontend](https://img.shields.io/badge/Frontend-Next.js-111827?style=for-the-badge&logo=nextdotjs&logoColor=white)](https://nextjs.org/)
[![Backend](https://img.shields.io/badge/Backend-Django-092E20?style=for-the-badge&logo=django&logoColor=white)](https://www.djangoproject.com/)

[![Live App](https://img.shields.io/badge/Live_App-flowbitdev.vercel.app-2563eb?style=for-the-badge&logo=vercel&logoColor=white)](https://flowbitdev.vercel.app)
[![API Docs](https://img.shields.io/badge/API_Docs-DRF_Schema-0ea5e9?style=for-the-badge&logo=swagger&logoColor=white)](https://flowbit-backend-bcgo.onrender.com/api/docs/)
[![Repository](https://img.shields.io/badge/GitHub-FlowBit-111827?style=for-the-badge&logo=github&logoColor=white)](https://github.com/dana-khaing/FlowBit_Capacity-Based-Numeric-Transaction-Management-System)

</div>

## About FlowBit

FlowBit is a realtime operations platform for managing capacity-based numeric transactions across identifiers `000`-`999`. It brings ticket entry, ledger control, spill-over workflows, lucky draw operations, notifications, reporting, and customer support into one connected product workflow.

The system is designed for teams that need live visibility over constrained identifier capacity, structured period control, and operational guardrails without splitting work across multiple tools.

## Product Snapshot

- Current release: `0.1.0-beta`
- Status: deployed beta
- Delivery model:
  - browser-based production application
  - desktop icon source prepared for later desktop packaging
- License: proprietary, all rights reserved

## Core Highlights

- Realtime dashboard updates across tabs, browsers, and devices
- Period lifecycle management with pre-close and lucky draw scheduling
- Ticket entry, receipt generation, PDF export, and print workflows
- Spill-over approval, reserve capacity, and overkill handling
- Admin panel for operational shortcuts, audit review, and announcements
- Per-user notifications with WebSocket delivery
- Customer service case management between users and admins

## Platform Capabilities

### Dashboard

- live current-period summary
- hot numbers, almost full numbers, and full numbers
- recent ticket visibility
- lucky number and winner presentation
- live capacity refresh after operational changes

### Ticket And Capacity Operations

- multi-entry ticket creation
- allocation preview before submission
- manual and default allocation flows
- reserve capacity support
- receipt preview, export, and print output

### Spill-over And Overkill

- pending `TCSO`, approved `CSO`, and detached `OVRK` workflows
- collaborator-based approval handling
- spill-over refund support
- direct overkill creation with operational controls

### Period And Ledger Control

- period create, update, close, reopen, and delete
- pre-close time and lucky draw reveal scheduling
- ledger priority management
- ledger archive review
- identifier freeze controls

### Lucky Draw Workflow

- one shared lucky number per period
- admin create, edit, remove, and announce flows
- winner lookup across tickets, approved spill-over, and overkill
- operational lock rules after pre-close and lucky draw announcement

### Notifications And Support

- per-user inbox with unread tracking
- admin broadcast announcements
- realtime notification refresh through WebSocket
- support case creation, reply, close, and reopen workflows

## Admin Experience

FlowBit includes a dedicated admin workspace for operational oversight and quick action routing.

Admin features include:
- active period summary with pre-close and lucky draw status
- quick links to users, override codes, audit logs, periods, spill-over, and customer service
- lucky number popup with OTP-style entry
- recent audit activity preview
- support case preview
- notification broadcast tools

## Pre-close And Lucky Draw Rules

When pre-close is reached:
- active ledgers in the period close
- ticket creation locks
- transaction creation locks
- allocation preview locks
- direct overkill creation locks
- ledger creation and ledger reopen lock
- ticket and spill-over refunds lock

If pre-close is moved later before lucky draw is announced:
- pre-close can be undone automatically
- affected ledgers reopen
- operations unlock again

If lucky draw is announced before pre-close happens:
- pre-close is applied immediately

When lucky draw is announced:
- pending `TCSO` converts to `CSO`
- remaining `OVRK` stays as overkill
- winner lookup checks tickets, approved spill-over, and overkill
- operations for the announced period remain locked

## Tech Stack

### Frontend
![Next.js](https://img.shields.io/badge/Next.js-111827?style=flat-square&logo=nextdotjs&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React-20232A?style=flat-square&logo=react&logoColor=61DAFB)
![shadcn/ui](https://img.shields.io/badge/shadcn%2Fui-18181B?style=flat-square&logo=radixui&logoColor=white)

### Backend
![Python](https://img.shields.io/badge/Python-3776AB?style=flat-square&logo=python&logoColor=white)
![Django](https://img.shields.io/badge/Django-092E20?style=flat-square&logo=django&logoColor=white)
![Django REST Framework](https://img.shields.io/badge/DRF-A30000?style=flat-square&logo=django&logoColor=white)
![Django Channels](https://img.shields.io/badge/Django_Channels-0F172A?style=flat-square&logo=django&logoColor=white)

### Data And Realtime
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-336791?style=flat-square&logo=postgresql&logoColor=white)
![Redis](https://img.shields.io/badge/Redis-DC382D?style=flat-square&logo=redis&logoColor=white)
![Supabase Storage](https://img.shields.io/badge/Supabase_Storage-0F172A?style=flat-square&logo=supabase&logoColor=3ECF8E)
![WebSocket](https://img.shields.io/badge/WebSocket-0ea5e9?style=flat-square&logo=socketdotio&logoColor=white)

### Hosting
![Vercel](https://img.shields.io/badge/Vercel-111827?style=flat-square&logo=vercel&logoColor=white)
![Render](https://img.shields.io/badge/Render-4F46E5?style=flat-square&logo=render&logoColor=white)

## Architecture

- Frontend: Next.js application with a workspace-style interface
- Backend: Django REST Framework API with ASGI delivery through Daphne
- Realtime: Django Channels with Redis-backed shared event delivery
- Database: PostgreSQL
- Media: Supabase Storage for production avatar uploads

## Project Structure

```text
FlowBit/
├── flowbit-backend/
│   ├── core/
│   └── flowbit_backend/
└── flowbit-frontend/
    └── src/
```

## Local Development

### Requirements

- Python 3.11+
- Node.js
- pnpm
- Redis
- PostgreSQL access

### Backend Environment

Backend `.env` should include at least:

```env
DATABASE_URL=postgresql://...
GOOGLE_OAUTH_CLIENT_ID=...
REDIS_URL=redis://127.0.0.1:6379/0
```

### Install And Run

```bash
cd flowbit-backend
venv/bin/python -m pip install -r requirements.txt
venv/bin/python manage.py migrate
venv/bin/python -m daphne -b 127.0.0.1 -p 8000 flowbit_backend.asgi:application
```

```bash
cd flowbit-frontend
pnpm install
pnpm dev
```

Default local URLs:

```text
Frontend: http://localhost:3000
Backend:  http://127.0.0.1:8000
```

### Google Sign-in For Local Development

Add these authorized JavaScript origins in Google Cloud Console:

```text
http://localhost:3000
http://127.0.0.1:3000
```

## Deployment

### Production Beta Setup

- Frontend: Vercel
- Backend: Render
- Database: PostgreSQL via `DATABASE_URL`
- Realtime: Redis via `REDIS_URL`
- Avatar storage: Supabase Storage

### Backend Deployment Notes

- repository root includes `render.yaml`
- service root directory is `flowbit-backend`
- ASGI start command:
  - `python -m daphne -b 0.0.0.0 -p $PORT flowbit_backend.asgi:application`
- health check path:
  - `/healthz/`
- on Render free tier, run migrations manually after first deploy:
  - `python manage.py migrate`

Required backend environment variables:
- `SECRET_KEY`
- `DEBUG=False`
- `ALLOWED_HOSTS`
- `CORS_ALLOWED_ORIGINS`
- `CSRF_TRUSTED_ORIGINS`
- `DATABASE_URL`
- `REDIS_URL`
- `GOOGLE_OAUTH_CLIENT_ID`
- `FRONTEND_PASSWORD_RESET_URL`
- `DEFAULT_FROM_EMAIL`

### Frontend Deployment Notes

Required frontend environment variables:
- `NEXT_PUBLIC_API_BASE_URL`
- `NEXT_PUBLIC_GOOGLE_CLIENT_ID`

Production notes:
- `NEXT_PUBLIC_API_BASE_URL` should point to the deployed backend `/api`
- Google OAuth authorized JavaScript origins must include the real frontend domain
- redeploy the frontend after changing environment variables

### Supabase Storage For Profile Avatars

FlowBit supports Supabase Storage for production profile avatar uploads while keeping local media storage available for development.

Required backend environment variables:
- `SUPABASE_STORAGE_BUCKET`
- `SUPABASE_STORAGE_S3_ENDPOINT`
- `SUPABASE_STORAGE_S3_REGION`
- `SUPABASE_STORAGE_ACCESS_KEY_ID`
- `SUPABASE_STORAGE_SECRET_ACCESS_KEY`
- `SUPABASE_STORAGE_PUBLIC_BASE_URL`

Expected value shape:

```env
SUPABASE_STORAGE_BUCKET=profile-avatars
SUPABASE_STORAGE_S3_ENDPOINT=https://<project-ref>.storage.supabase.co/storage/v1/s3
SUPABASE_STORAGE_S3_REGION=<project-region>
SUPABASE_STORAGE_ACCESS_KEY_ID=<supabase-s3-access-key-id>
SUPABASE_STORAGE_SECRET_ACCESS_KEY=<supabase-s3-secret-access-key>
SUPABASE_STORAGE_PUBLIC_BASE_URL=https://<project-ref>.supabase.co/storage/v1/object/public/profile-avatars
```

When all six variables are present:
- Django media uploads switch from local disk to Supabase Storage
- avatar URLs resolve from Supabase public storage
- local development still works when these variables are not set

## Testing

### Backend

```bash
cd flowbit-backend
venv/bin/python manage.py test --settings=flowbit_backend.test_settings
```

### Frontend

```bash
cd flowbit-frontend
pnpm build
```

## License

FlowBit is a private product.

- License: proprietary
- Rights: all rights reserved
- Details: see [LICENSE](./LICENSE)

<div align="center">

![Footer](https://capsule-render.vercel.app/api?type=waving&color=0:14b8a6,40:0ea5e9,75:1d4ed8,100:0f172a&height=120&section=footer)

</div>
