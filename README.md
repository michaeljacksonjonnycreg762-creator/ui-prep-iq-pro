# UI Prep IQ Pro

A full-stack CBT practice platform for UI/UTME preparation with:
- React frontend
- Express backend
- SQLite by default for local dev
- PostgreSQL-ready configuration structure
- Student and admin authentication
- Practice and CBT exam modes
- Result saving and review
- Admin dashboards

## Quick start

1. Install dependencies:
   npm install

2. Copy environment file:
   cp .env.example .env

3. Start app:
   npm run dev

4. Open app:
   http://localhost:5173

## Admin login

- Username: admin
- Password: admin123

## Production note

This repo is set up to allow a PostgreSQL connection through `DATABASE_URL` for production deployment, while defaulting to SQLite for simple local development.
