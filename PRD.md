# Product Requirements Document (PRD)
**Project**: Rashtriya Raksha University (RRU) - Smart QR Emergency & Identity System

## 1. Product Overview
The RRU Smart QR System is a robust web application built to secure the identity, assets, and emergency response capabilities of Rashtriya Raksha University. It centralizes PII (Personally Identifiable Information) using advanced cryptography and creates a seamless emergency response mechanism using immutable QR codes placed on user assets (e.g., vehicles, laptops, devices).

## 2. Target Audience
- **Students, Staff, & Security Personnel (Members)**: Individuals who register their identities, manage their PII, and generate QR codes for their assets.
- **Bystanders (The Public)**: Anyone who witnesses an incident involving an RRU asset. They scan the QR code to report the incident.
- **C2 Admins (Command & Control Center)**: Security operators who monitor the dashboard, manage members, perform security audits, and track emergency incidents.

## 3. Core Features & Requirements

### 3.1. Authentication & Security
- **Registration**: Members must register with full PII, ID Card photo uploads, and Guardian/Emergency Contact information.
- **Two-Factor Authentication (2FA)**: Login requires Email/Password, followed by a code from an authenticator app (TOTP, RFC 6238; Google/Microsoft Authenticator, Authy, 1Password...). A first-time sign-in sets the app up after confirming the account's phone with a one-time code (WhatsApp, SMS fallback, via MSG91); a lost app is replaced the same way (members only; administrators are reset by another operator), and one-time recovery codes are issued at setup. Authenticator codes are single-use per 30 s step and attempts are capped hard per account. The phone is also verified at registration and whenever it is changed.
- **AES-256-GCM Encryption**: All sensitive data (Mobile Numbers, Guardian Data, Addresses, Allergies, Blood Groups) MUST be encrypted backend-side before being written to the database. It is only decrypted momentarily when authorized endpoints request it.
- **Security Auditing**: Every critical action (Login, Failed Login, OTP Request, Incident Report) is logged in a `Deep Security Audit Log` capturing the user's IP (GeoID), User-Agent (Device Fingerprint), and the action taken.

### 3.2. Asset Management & QR Codes
- Members can register multiple assets (Vehicles, Devices).
- Each asset requires uploading specific photos (e.g., Front, Back, RC Copy for vehicles).
- The system generates a unique `qrReferenceId` mapped to an immutable QR code.
- Assets are strictly read-only for the user once registered to prevent tampering. Only C2 Admins can modify or delete assets.

### 3.3. Emergency Response Flow
- **QR Scan**: When a bystander scans the asset's QR code, they are directed to the public `/scan/[id]` page.
- **Identity Verification**: The bystander must verify their phone number with a one-time code (WhatsApp or SMS via MSG91, Indian numbers only, CAPTCHA-protected) before they can submit a report (preventing spam). Verification yields a short-lived bystander token and a single-use capture token.
- **Incident Reporting**: The bystander uses their device's native WebRTC camera to capture:
  1. A Selfie (Identity Verification)
  2. A Scene Photo (Evidence)
- **Geolocation tracking**: The application uses HTML5 Geolocation to tag the incident with exact GPS coordinates.
- **Bystander Assistance**: Upon a successful report the bystander sees the owner's blood group immediately; allergies and emergency/guardian contacts follow after a 10-second review window during which an admin may block the release. The owner's home address is never released. Reports on assets scanned more than 3 times an hour are flagged and release nothing. First-aid tips (CPR, Bleeding Control) and a one-tap call to 112 are always shown.

### 3.4. C2 Admin Dashboard (Command & Control)
- **Member Directory**: Advanced server-side search, pagination, and sorting of all registered users.
- **Deep Profile Viewing**: Admins can view decrypted PII and registered assets for any specific user.
- **Audit Log Filtering & Export**: Admins can filter the Security Audit Log by Date and Action Type, and export the results to a CSV file.
- **Incident Management**: A dedicated dashboard for tracking incoming emergency reports, calling asset owners, viewing maps, and managing incident statuses (`NEW`, `IN_PROGRESS`, `RESOLVED`).

## 4. Technology Stack & File Structure
This project is built using a modern, scalable, and highly secure technology stack. 

### Current Stack
- **Frontend / Backend**: Next.js 16 (React 19) via App Router.
- **Styling**: Tailwind CSS & Lucide React Icons.
- **Language**: TypeScript.
- **Database / ORM**: PostgreSQL (e.g. Neon) with Prisma 7 and the pg driver adapter.
- **Security Tools**: Node.js `crypto` (AES-256-GCM, scrypt, HMAC), `jose` (JWT).
- **Third Party**: MSG91 (WhatsApp and SMS delivery of OTP codes), Cloudflare Turnstile (optional bot check); SMTP for password-reset email. QR codes are rendered locally with `qrcode.react` (scan links are never sent to a third-party service).

### File Structure Overview
The file structure adheres strictly to Next.js App Router methodologies, separating public UI, admin UI, and API logic.

- `prisma/schema.prisma`: The single source of truth for the database layout.
- `storage/uploads/`: Private file storage (outside `public/`), served only through `/api/files` with per-file authorization. Uploads land in `temp/` and are moved to `{userId}/` or `incidents/{id}/` by a validated step; filenames are random and extensions come from the detected image type.
- `src/lib/`: Core singletons and utilities, particularly `encryption.ts` which handles the AES-256-GCM logic.
- `src/app/api/`: The backend endpoints: two-step login (`auth/login`), bystander verification (`auth/bystander`), registration, password reset, incident reporting, admin APIs, and content-sniffing image upload (`upload/route.ts`).
- `src/app/admin/`: Protected UI routes specifically reserved for users with the `ADMIN` role to manage the C2 Center.
- `src/app/scan/[id]/`: The dynamic public-facing incident reporting interface utilized by bystanders.

## 5. Non-Functional Requirements
- **Responsive Design**: The application must be 100% usable on mobile devices, especially the `/scan` emergency flow, as it relies on mobile WebRTC cameras.
- **Rate Limiting**: Login (per IP and per account), 2FA, registration, uploads, capture tokens, incident reports and password reset are rate-limited (Upstash Redis, or Postgres counters). Code sending is additionally limited per IP, per number and per account, capped per day (cost circuit breaker), restricted to +91 by default and protected by optional Turnstile.
- **Secure File Storage**: File uploads must strictly reject non-image MIME types to prevent malicious executable execution. Filenames must be randomized to prevent directory traversal or predictable enumeration.
