# Product Requirements Document (PRD)

## Sanjivani: QR-Based Emergency Response System

| | |
| --- | --- |
| **Version** | 1.0 (production pilot) |
| **Date** | 27 September 2026 |
| **Owner** | Rashtriya Raksha University (RRU), Gandhinagar |
| **Status** | Live on Vercel; verified end to end on production (see `PRD_Report.md`) |
| **Supersedes** | 0.x prototype PRD (MSG91 / WhatsApp OTP, admin-only assets, disk storage) |

---

## 1. Overview

Sanjivani puts a QR code on a member's vehicle, laptop or phone. If someone finds that asset in an emergency
(an accident, an unconscious rider, a wrongly parked vehicle) they scan the code, prove they hold a real phone number,
report the incident with photos and GPS, and are shown the owner's critical medical information and emergency
contacts. Campus security (the C2 centre) sees every report live and can act on it.

The system protects the owner's data by default: everything sensitive is encrypted at rest, a bystander sees the minimum
needed to help, and every disclosure is audited.

### 1.1 Problem

- An injured owner cannot speak for themselves; bystanders do not know who to call or what the owner's blood group or
  allergies are.
- Paper cards and phone lock-screen medical IDs are inconsistent and easy to miss.
- Security has no fast, verified channel from "someone found this vehicle" to "we know who it is and where".

### 1.2 Goals

1. A bystander can go from scanning the QR to seeing the owner's blood group and helpline in well under a minute.
2. Personal data is safe at rest and minimally disclosed; nothing is released to an unverified person.
3. Abuse is expensive: verified phones, rate limits, single-use tokens, a review window before contacts are released.
4. Runs on cheap, standard infrastructure (managed Postgres, one SMS provider, any Node/serverless host).
5. Usable on any screen (Android, iOS, tablet, desktop) because the bystander flow happens on a phone, in the street.

### 1.3 Non-goals (v1.0)

- Native mobile apps (the web app is responsive and installable as a bookmark).
- Automatic dispatch of ambulances or police; the app provides call buttons and information only.
- Collection of MAC addresses or IMEI (not available to a browser).
- Non-Indian phone numbers (allow-listed to +91 by default).

---

## 2. Users and roles

| Role | Who | What they do |
| --- | --- | --- |
| **Member** (`STUDENT`, `STAFF`, `SECURITY`) | RRU students, staff, security personnel | Register, keep an emergency profile, add their assets, download QR posters |
| **Bystander** | Anyone who scans a QR code; no account | Verifies a phone number, reports the incident, receives emergency information |
| **Administrator** (`ADMIN`) | C2 operators | Monitors incidents live, manages members and assets, reviews audit logs |

Administrators are only ever created by an operator script (`npm run seed:admin`); there is no public endpoint.

---

## 3. Functional requirements

Priority: **M** = must, **S** = should. All items below are implemented in v1.0 unless marked *(planned)*.

### 3.1 Registration and identity

| ID | Requirement | P |
| --- | --- | --- |
| FR-1.1 | A member registers with name, date of birth, role, RRU ID, blood group, allergies, contact number, emergency contact, guardian (relation, name, contact), address, profile photo and ID-card photo. | M |
| FR-1.2 | The contact number is verified by a one-time SMS code before the account is created. | M |
| FR-1.3 | The emergency contact and guardian contact cannot be the member's own number. | M |
| FR-1.4 | Password policy is enforced (minimum length, a number and a symbol, not derived from name/email). | M |
| FR-1.5 | Each account receives an immutable UII code (`RRU-UII-XXXXXXXX`). | M |
| FR-1.6 | Members edit their profile from the portal; changing the contact number requires a code sent to the new number. | M |

### 3.2 Authentication

| ID | Requirement | P |
| --- | --- | --- |
| FR-2.1 | Sign-in is email + password, then a 6-digit authenticator-app code (TOTP, RFC 6238). | M |
| FR-2.2 | First sign-in for an account without an authenticator confirms the phone by SMS, then walks through app setup and issues 8 one-time recovery codes. | M |
| FR-2.3 | Authenticator codes are single-use per 30 s step; attempts are capped at 5 per 15 min and 20 per day per account. | M |
| FR-2.4 | A lost authenticator can be replaced by members via an SMS code (signs out other sessions, cancels old recovery codes). Administrators cannot; another operator runs `npm run reset-2fa`. | M |
| FR-2.5 | **SMS is not sent on ordinary logins for anyone.** An administrator confirms a texted code once, on the first sign-in after their password was reset. | M |
| FR-2.6 | Password reset is by an emailed, single-use, one-hour link; it signs out all sessions and does **not** bypass two-factor. | M |
| FR-2.7 | Admin sessions last 30 minutes, member sessions 12 hours; sessions can be revoked instantly (`tokenVersion`). | M |

### 3.3 Phone verification (OTP)

| ID | Requirement | P |
| --- | --- | --- |
| FR-3.1 | Codes are 6 random digits generated by the app, stored only as a keyed hash, valid 5 minutes, 5 guesses per challenge, 3 sends and a 30 s cooldown per challenge. | M |
| FR-3.2 | A correct code yields a single-use proof bound to purpose, number and account. | M |
| FR-3.3 | Used for: registration, bystander scan, changing the contact number, authenticator setup/recovery, and the admin post-password-change check. | M |
| FR-3.4 | Send limits: per IP, per number (5/h), per account, and a daily circuit breaker (default 2000) to cap cost; +91 only; optional Cloudflare Turnstile on anonymous sends. | M |
| FR-3.5 | Delivery is by SMS through Fast2SMS's Quick SMS route (no DLT registration required); the provider never decides whether a code is correct. | M |

### 3.4 Assets and QR codes

| ID | Requirement | P |
| --- | --- | --- |
| FR-4.1 | Members add, edit and remove their own assets (vehicle, laptop, mobile), up to 10 each. Admins can also register assets for anyone. | M |
| FR-4.2 | Photos per type: vehicle front/back/left/right/RC (optional); **mobile: 2** (front, back, required); **laptop: 3** (lid, open, serial-number label, required). Required photos are enforced server-side on creation. | M |
| FR-4.3 | Each asset gets a random `qrReferenceId` that never changes. An asset with incident reports cannot be removed (evidence is preserved). | M |
| FR-4.4 | QR codes are rendered in the browser (the scan link holds the secret asset ID; no third-party QR service). | M |
| FR-4.5 | Members and admins download the **poster**: the Sanjivani/RRU template with that asset's QR centred and its type/identifier printed under it (PNG, 2160 x 2700), plus a bare SVG of the code. | M |
| FR-4.6 | Asset lists refresh themselves so changes made elsewhere appear without a reload. | S |

### 3.5 Bystander emergency flow (`/scan/[id]`)

| ID | Requirement | P |
| --- | --- | --- |
| FR-5.1 | The page shows the asset type, a **Call 112** button and the two **RRU helpline** numbers (`+91 80531 92892`, `+91 90146 96834`) at every step. | M |
| FR-5.2 | The bystander verifies a phone number by SMS (rate-limited, Turnstile-protected) and receives a short-lived bystander token and a single-use capture token. | M |
| FR-5.3 | The bystander captures a selfie and 2 to 4 scene photos with the device camera, plus optional GPS; photos upload in parallel. | M |
| FR-5.4 | On submit the bystander immediately sees the **owner's name and blood group**. Allergies and emergency/guardian contacts appear after a 10 s review window during which an admin may block the release. The home address is **never** released. | M |
| FR-5.5 | Assets scanned more than 3 times an hour are flagged for security and release nothing. | M |
| FR-5.6 | First-aid tips (CPR, severe bleeding), a fixed campus-location card with a Google Maps link, and, if GPS was granted, "Find hospital / police" links are shown. | M |

### 3.6 C2 (administrator) dashboard

| ID | Requirement | P |
| --- | --- | --- |
| FR-6.1 | Live incident feed and dashboard counters (members, assets, incidents). | M |
| FR-6.2 | **Alerts wherever the admin is:** on-screen alert, sound, sidebar badge, tab-title count and an opt-in desktop notification when a new incident arrives. | M |
| FR-6.3 | Incident management: statuses `NEW`, `IN_PROGRESS`, `RESOLVED`, `BLOCKED`, `FLAGGED`; block release of details; owner and reporter phone numbers; evidence photos; map link. | M |
| FR-6.4 | Member directory with server-side search and pagination; deep profile view (decrypted PII, assets, activity). Each admin view is audited. | M |
| FR-6.5 | **Audit logs** in two tabs, *Security & account events* and *Incident events*. Profile and asset edits can be expanded to review each field's **before / after** value. A member's activity log can be filtered and exported to CSV from their profile page. | M |
| FR-6.7 | **Administrator management** (page *Administrators*, primary administrator only): add a new administrator (generated or chosen password) or promote an existing member; edit name, email and phone; reset an admin's password or authenticator; remove administrator access. The primary administrator is the earliest-created admin and cannot be demoted. New admins enrol their own authenticator at first sign-in after a texted code, so no one else sees their secrets. Every change is audited with before/after values. | M |
| FR-6.8 | **Forgot password for everyone (members and admins):** a 6-digit code is texted to the phone registered on the account (no email server needed), and the new password is set in the same step; an email reset link remains as an alternative. Answers never reveal whether an account exists. Sessions are revoked; two-factor is not bypassed. | M |
| FR-6.6 | Members, assets, audit and dashboard lists refresh automatically (every 5 to 10 s and on tab focus). | S |

### 3.7 Responsive layout

| ID | Requirement | P |
| --- | --- | --- |
| FR-7.1 | Every page is usable from 320 px phones to desktop. Dynamic viewport height, safe-area insets, 16 px form controls (no iOS zoom-on-focus). | M |
| FR-7.2 | Admin below the `md` breakpoint uses a bottom tab bar (with the live incident badge) and a header with Logout; wide tables stack into labelled cards. | M |

---

## 4. Non-functional requirements

### 4.1 Security and privacy

- **PII at rest:** date of birth, blood group, allergies, contact numbers, guardian details and address are
  AES-256-GCM encrypted (`v1:iv:tag:ciphertext`); the bystander's phone uses encryption plus an HMAC blind index.
- **Authorization:** every admin route re-checks the role in the database (`requireAdmin`); `src/proxy.ts` is only a coarse first gate.
- **Tokens:** separate JWT audiences (session, 2FA-pending, bystander, phone-proof, authenticator-enrolment) so one can never be replayed as another.
- **Least disclosure:** see FR-5.4; API responses are whitelisted, never raw rows.
- **Uploads:** JPEG/PNG/WebP only, verified by content, at most 5 MB, stored privately, served through `/api/files` with a per-file authorization check, attached to records only through a validated "adopt temp file" step.
- **Audit trail:** logins, failures, profile/asset edits (with encrypted before/after), PII disclosures, admin views and incident actions, with the resolved client IP. Field values in audit rows are encrypted like the columns they mirror.
- **Rate limiting** on login (IP and account), 2FA, registration, uploads, reports, password reset and code sends; the client IP is read from `X-Forwarded-For` counting `TRUSTED_PROXY_HOPS` from the right. The limiter fails **closed**.
- **Secrets:** `ENCRYPTION_KEY`, `JWT_SECRET`, `BYSTANDER_JWT_SECRET` must be identical everywhere that shares a database (local scripts and the deployment); losing `ENCRYPTION_KEY` makes encrypted fields unrecoverable.

### 4.2 Performance

- Functions run in `sin1` (Singapore) beside the Neon database in `ap-southeast-1`, avoiding a transatlantic round trip on every query.
- Incident photo uploads run in parallel; admin polling is paused while a tab is hidden.
- Known: Vercel Hobby and Neon free tier cold-start after idle periods (first request can take seconds).

### 4.3 Cost

- SMS: Fast2SMS Quick SMS, about INR 5 per message, wallet top-up of at least INR 100 required once. Sends are capped per number, per IP and per day.
- Hosting: Vercel Hobby, Neon free tier, Vercel Blob free allowance.

### 4.4 Compatibility

Current Chrome, Safari (iOS/macOS), Firefox and Edge; Android and iOS phones; tablets; desktop. Camera and geolocation require HTTPS.

---

## 5. System summary

| Layer | Choice |
| --- | --- |
| App | Next.js 16 (App Router, Turbopack), React 19, TypeScript (strict), Tailwind CSS 4 |
| Hosting | Vercel (functions pinned to `sin1`) |
| Database | PostgreSQL on Neon via Prisma 7 and `@prisma/adapter-pg` |
| File storage | Vercel Blob (private) in production, local disk for development; one module (`src/lib/storage.ts`) |
| SMS | Fast2SMS Quick SMS (delivery only) |
| Email | Nodemailer over SMTP (password-reset links) |
| Auth | scrypt passwords, TOTP (implemented from RFC 6238, verified against RFC 4226/6238 test vectors), JWT (`jose`) in an HttpOnly cookie |
| Rate limit | Upstash Redis if configured, otherwise atomic Postgres counters |

### 5.1 Data model (Prisma)

`User` (with encrypted profile columns, TOTP fields, `tokenVersion`), `Asset`, `Incident`, `Bystander`, `CaptureToken`,
`PhoneOtp` (verification challenges), `RecoveryCode`, `AuditLog` (with encrypted `changesEnc`), `RateLimit`,
`AssetScanRateLimit`. Four migrations under `prisma/migrations/`.

### 5.2 HTTP surface

`/api/auth/*` (login, logout, register, bystander, reset, TOTP setup/confirm), `/api/phone/{send,verify}`,
`/api/user/{profile,2fa,assets}`, `/api/assets`, `/api/members`, `/api/scan/*`, `/api/incidents/*`,
`/api/upload`, `/api/files/[...path]`, `/api/admin/{stats,incidents,audits,members}`.

---

## 6. Assumptions and constraints

- One SMS provider by design (v1 simplicity); MSG91 was evaluated and retired (see `PRD_Report.md`).
- The bystander must be able to receive SMS on an Indian number.
- The helpline numbers and campus location are fixed constants in `src/app/scan/[id]/page.tsx`.
- Database migrations are applied by hand (`npm run db:migrate`); the Vercel build does not touch the database.
- Administrators never self-serve a lost authenticator.

## 7. Success metrics (proposed)

| Metric | Target |
| --- | --- |
| Scan to first information shown | under 60 s on a mid-range phone |
| OTP delivery success (send accepted to code received) | at least 98 % |
| Reports flagged as abuse / total | under 2 % |
| Time from report to admin acknowledgement | under 2 min during staffed hours |
| Registered assets with a printed QR poster | 100 % of registered assets |

## 8. Roadmap (not in v1.0)

- Notify an owner (email/SMS) when their asset's QR is scanned.
- Admin "mark as reviewed" workflow on audit entries.
- Editable helpline / campus settings in the admin UI instead of constants.
- Server-sent events or push for incident alerts (removes polling).
- Multiple administrators with per-role permissions; automatic admin lockout review.
- Monitoring and alerting (error tracking, uptime, SMS-wallet balance).
- Automated end-to-end and mobile-device test runs in CI.

## 9. Release history

| Version | Date | Highlights |
| --- | --- | --- |
| 0.1 | Sep 2026 | Prototype: password + SMS login, admin-registered assets, local disk storage |
| 0.5 | Sep 2026 | Security overhaul: AES-256-GCM PII, hardened uploads, rate limits, audit log |
| 0.8 | Sep 2026 | TOTP two-factor with recovery codes; self-generated OTP codes |
| 1.1 | 27 Sep 2026 | Forgot password by SMS code (works without SMTP); Administrators page: primary admin adds, edits, promotes, resets and removes administrators |
| 1.0 | 27 Sep 2026 | Fast2SMS delivery (no DLT), Vercel Blob storage, Singapore region, member asset management, mobile/laptop photo sets, QR poster download, audit before/after review, live admin alerts, admin SMS only after a password change, responsive layout, Sanjivani branding |
