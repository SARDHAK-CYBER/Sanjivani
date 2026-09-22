# Product Requirements Document (PRD)
## Sanjivani QR-Based Emergency Response System

### 1. Executive Summary
Sanjivani is a QR-based emergency response web application for university campuses. Members register their identity and
emergency details and attach QR codes to their assets. A bystander who finds an asset in an emergency scans the code,
verifies a real mobile number, reports the incident with photos and GPS, and is shown the owner's critical medical
information and emergency contacts. Campus security monitors incidents from a C2 dashboard.

### 2. Objectives
- Give bystanders an instantaneous, low-friction way to report emergencies and reach the owner's contacts.
- Protect personal data: field-level encryption, least-disclosure to bystanders, full audit trail.
- Make abuse expensive: verified phones, rate limits, single-use tokens, review window for disclosures.
- Run on standard, affordable infrastructure (managed Postgres, MSG91 for OTP delivery, any Node host).

### 3. Target Audience
- **Members (students, staff, security personnel):** register, manage their emergency profile, view their QR codes.
- **Bystanders:** anyone who scans an asset QR code; no account, only a verified phone number.
- **Administrators (C2 operators):** register assets, monitor and triage incidents, review audit logs.

### 4. Technical Architecture

#### 4.1 Technology Stack
- **Frontend / backend:** Next.js 16 (App Router), React 19, Tailwind CSS v4, TypeScript.
- **Database:** PostgreSQL (Neon or any Postgres) through Prisma 7 with the `pg` driver adapter.
- **Phone verification:** one-time codes generated and verified by the app, delivered by MSG91 over WhatsApp (SMS fallback); optional Cloudflare Turnstile on the public send step.
- **Sessions:** signed JWTs (`jose`) in an HttpOnly, SameSite=Lax cookie; separate token audiences for session, pending-2FA and bystander.
- **Cryptography:** Node `crypto`: AES-256-GCM (PII at rest), scrypt (passwords), HMAC-SHA256 (blind indexes), SHA-256 (reset-token hashes), keyed HMAC (OTP-code hashes).
- **Rate limiting:** Upstash Redis when configured, otherwise atomic Postgres counters.

#### 4.2 Security Specifications
- **Two-factor authentication:** password, then an authenticator-app code (TOTP). Enrolment and recovery require the password AND a one-time code sent to the
  account's phone, so a stolen password cannot be used to enrol an attacker's app. Codes are single-use per time step; attempts are capped at 5 per 15 minutes and 20 per day.
- **Phone codes (MSG91):** 6 random digits stored only as a keyed hash, 5-minute expiry, 5 guesses per challenge, yielding a single-use proof bound to purpose, number and account.
- **Least disclosure:** blood group immediately; allergies and contacts after a 10 s review window (admin can block); home address never released.
- **PII encryption at rest:** contact numbers, blood group, allergies, guardian details, address and date of birth are AES-256-GCM encrypted;
  the bystander's phone is encrypted with an HMAC blind index for lookups.
- **Authorization:** admin routes verify the role against the database on every request; sessions can be revoked (`tokenVersion`).
- **Uploads:** images only, verified by content; private storage; access decided per file.
- **Audit:** logins (success and failure), profile changes, PII disclosures, admin views and incident actions are logged with the resolved client IP.

### 5. Core Features

#### 5.1 Registration and login
Members register with details, photos and a phone number that is verified with a one-time code (WhatsApp, SMS fallback). Sign-in is email + password followed by a
code from an authenticator app (set up at first sign-in after a phone check; recovery codes cover a lost phone). Passwords are reset by an emailed, single-use, one-hour link; a reset signs out all sessions.

#### 5.2 Incident reporting
After phone verification the bystander captures a selfie and 2–4 scene photos and (optionally) GPS. Each report needs a
single-use, 5-minute capture token bound to that bystander. Assets scanned more than three times an hour are flagged for
security and release nothing.

#### 5.3 Administration
Admins register assets and generate QR codes, browse members (search, pagination), view decrypted profiles (each view is audited),
watch incidents live, mark them In Progress / Resolved, block release of details, and export audit logs to CSV.

### 6. Deployment & Operations
See `README.md`: environment variables (`.env.example`), MSG91 setup (DLT, WhatsApp template, `npm run otp:smoke`), `npm run db:migrate`, `npm run seed:admin`.
File storage is local disk by default; serverless hosts require an object-storage implementation of `src/lib/storage.ts`.
