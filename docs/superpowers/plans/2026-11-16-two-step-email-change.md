# Implementation Plan: Two-Step Email Change & Demo Protection

**Spec:** `docs/superpowers/specs/2026-11-16-two-step-email-change.md`

## Proposed Changes

### 1. Database & Models (`apps/api/src/db.ts`, `apps/api/src/email-change.ts`)
- Modify `email_changes` table in `db.ts`:
  - Add `current_code_hash text DEFAULT ''`
  - Add `new_code_hash text`
  - Add `stage text NOT NULL DEFAULT 'awaiting_current'`
  - Migrate legacy rows where `code_hash` exists.
- In `apps/api/src/email-change.ts`:
  - `createEmailChange(userId, newEmail)`: generates current code, stores with `stage = 'awaiting_current'`.
  - `authorizeEmailChange(userId, code)`: verifies against `current_code_hash`, transitions to `stage = 'awaiting_new'`, generates and returns new code.
  - `verifyEmailChange(userId, code)`: verifies against `new_code_hash` when `stage = 'awaiting_new'`.
  - Update `loadEmailChange` to return `stage`.

### 2. API Endpoints & Demo Guards (`apps/api/src/app.ts`)
- Add demo mode check to `/api/auth/change-email`:
  - `if (process.env.DEMO_MODE === 'true' || config['app_demo_mode'] === 'true') return c.json({ message: 'Email change is disabled in demo mode.' }, 403)`
- Add demo mode check to `/api/auth/delete-account/request` and `/api/auth/account` (DELETE):
  - `if (process.env.DEMO_MODE === 'true' || config['app_demo_mode'] === 'true') return c.json({ message: 'Account deletion is disabled in demo mode.' }, 403)`
- Update `POST /api/auth/change-email`:
  - Sends authorization email to current email with code & cancellation link.
- Add `POST /api/auth/change-email/authorize`:
  - Accepts `{ code }`.
  - Calls `authorizeEmailChange`.
  - Sends verification email to new email.
- Update `POST /api/auth/change-email/verify`:
  - Verifies code against `new_code_hash`.
  - Commits email change.

### 3. Tests (`apps/api/src/email-change.test.ts`)
- Test demo mode rejection for email change and account deletion.
- Test two-step flow:
  - Request -> code sent to current address.
  - Submitting code from current address authorizes and sends code to new address.
  - Submitting code from new address completes the email change.
  - Rejection if trying to verify new code before authorizing current code.

### 4. Frontend UI (`apps/web/src/pages/account.tsx`, `apps/web/src/lib/api.ts`)
- Update `apps/web/src/lib/api.ts`:
  - `PendingEmailChange` adds `stage: 'awaiting_current' | 'awaiting_new'`.
  - Add `authorizeEmailChange(input: { code: string })`.
- In `apps/web/src/pages/account.tsx`:
  - Update modal to handle 3 phases:
    1. Enter new email.
    2. Enter code sent to current email (`awaiting_current`).
    3. Enter code sent to new email (`awaiting_new`).

---

## Tasks

- [ ] Task 1: Demo mode guards for email change and account deletion in `apps/api/src/app.ts`.
- [ ] Task 2: Data model & helper functions in `db.ts` and `email-change.ts`.
- [ ] Task 3: API endpoints for authorization and verification in `apps/api/src/app.ts`.
- [ ] Task 4: Unit tests in `apps/api/src/email-change.test.ts`.
- [ ] Task 5: Web API and modal UI in `apps/web/src/pages/account.tsx`.
- [ ] Task 6: Build, verification, and deploy to demo (`elysia`) and dev (`aria`).
