# Environment & secrets (Lush Laundry)

Keep all passwords, API keys, and JWT secrets in `.env` files — never in source code or git.

## Required files

| File | Purpose |
|------|---------|
| `backend/.env` | Local/production backend secrets (copy from `.env.example`) |
| `frontend/.env` | `VITE_API_URL`, Google client ID (copy from `frontend/.env.example`) |

## Critical variables

| Variable | Where used |
|----------|------------|
| `DB_PASSWORD` / `DATABASE_URL` | Postgres connection (utility scripts read `DB_PASSWORD` only) |
| `JWT_SECRET` | Auth tokens — must be strong; production refuses the default |
| `SESSION_SECRET` | Sessions |
| `SEED_ADMIN_PASSWORD` | `npm run seed` admin account |
| `SEED_USER_PASSWORD` | Seeded sample users |
| `SEED_MANAGER_PASSWORD` | Manager create/seed scripts |
| `SEED_AGENT_PASSWORD` | Agent/staff seed scripts |
| `AFRICASTALKING_*` | SMS (optional) |
| `TWILIO_*` | WhatsApp Business API (optional; UI uses Messenger `wa.me`) |

## WhatsApp Messenger (staff phone)

Order confirmation does **not** need Twilio for daily use:

1. Create order on New Order
2. System opens WhatsApp (`wa.me`) with a filled confirmation message
3. Staff phone (WhatsApp Messenger) sends it to the customer number

Set business phone under **Settings** so messages can include your contact line.

## Checklist

1. Copy `backend/.env.example` → `backend/.env` and fill real values  
2. Copy `frontend/.env.example` → `frontend/.env`  
3. Restart backend after changing `.env`  
4. Confirm `.env` is in `.gitignore`  
5. Rotate any password that was previously hardcoded in the repo  
