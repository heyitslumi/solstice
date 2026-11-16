# Spec: Two-Step Email Change Confirmation & Demo Mode Protection

**Date:** 2026-11-16
**Status:** Approved

## Problem
Currently, when a user requests an email change:
1. A verification code is sent directly to the *new* address.
2. A cancellation link is sent to the *current* address, but no explicit approval is required from the current address to proceed.
3. In `DEMO_MODE=true` (or when `app_demo_mode` is enabled), visitors who log in via the demo one-click admin can initiate an email change or account deletion, dispatching confusing emails to `hi@lumis.moe` or attempting to hijack the demo account.

## Goal
1. **Double-confirmation flow**:
   - **Phase 1 (Authorize)**: User enters their requested new email. A 6-digit confirmation code and cancellation link are sent to the **current (old)** email address.
   - **Phase 2 (Verify)**: User enters the code from their current email to authorize the change. Only after authorization is valid, a 6-digit verification code is generated and sent to the **new** email address.
   - **Phase 3 (Commit)**: User enters the code from the new email. The email is updated in the database, other active sessions are revoked, and a final confirmation email is sent to the old address.
2. **Demo Mode Safeguards**:
   - In demo mode (`DEMO_MODE=true` or `app_demo_mode=true`), both `/api/auth/change-email` and `/api/auth/delete-account` requests are blocked with `403 Forbidden` (`"Email change is disabled in demo mode."` / `"Account deletion is disabled in demo mode."`).

## Architecture & Data Model
### `email_changes` table migration:
Columns:
- `user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE`
- `new_email text NOT NULL`
- `current_code_hash text NOT NULL` (hash of code sent to current address)
- `new_code_hash text` (hash of code sent to new address, null until Phase 1 complete)
- `cancel_hash text NOT NULL`
- `stage text NOT NULL DEFAULT 'awaiting_current'` (`'awaiting_current'` | `'awaiting_new'`)
- `attempts integer NOT NULL DEFAULT 0`
- `created_at timestamptz NOT NULL DEFAULT now()`
- `expires_at timestamptz NOT NULL`

Existing columns `code_hash` can be migrated or kept as `new_code_hash` / `current_code_hash`.

### Endpoints
1. `GET /api/auth/change-email`:
   - Returns `{ pending: { email: string, stage: 'awaiting_current' | 'awaiting_new', expiresAt: string } | null }`.
2. `POST /api/auth/change-email`:
   - Validates user, rate-limits, blocks in demo mode.
   - Generates `current_code` (6 digits) and `cancelToken`.
   - Inserts row with `stage = 'awaiting_current'`.
   - Sends authorization code & cancellation link to current email.
3. `POST /api/auth/change-email/authorize`:
   - Verifies 6-digit code against `current_code_hash`.
   - On success: generates `new_code` (6 digits), sets `new_code_hash`, updates `stage = 'awaiting_new'`, resets `attempts = 0`.
   - Sends verification code to new email.
4. `POST /api/auth/change-email/verify`:
   - Verifies that `stage === 'awaiting_new'`.
   - Verifies 6-digit code against `new_code_hash`.
   - Updates `users.email = new_email`, sets `email_verified_at = now()`.
   - Deletes pending change row.
   - Revokes other sessions & sends success notice to previous email.
5. `POST /api/auth/change-email/cancel` & `/cancel-link`:
   - Existing behavior preserved (clears pending change).
