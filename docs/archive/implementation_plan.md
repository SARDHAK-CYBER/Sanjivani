# Goal Description

Migrate the current RRU QR-Based Emergency Response System prototype to a scalable, production-ready cloud architecture. This involves transitioning from a local SQLite database to Neon Serverless Postgres, replacing `bcrypt` with native Node.js crypto, integrating Google OAuth 2.0 via Auth.js (NextAuth v5), and implementing a hybrid Twilio SMS gateway.

*Note: This plan has been updated to reflect correct Prisma 7 standards and Neon Serverless optimizations as per user feedback.*

## Proposed Changes

---

### Database Migration (Neon Postgres) - *Updated*

- **`prisma/schema.prisma`**: Change `provider = "postgresql"` and keep `url = env("DATABASE_URL")` to ensure `npx prisma db push` works seamlessly via CLI.
- **`prisma.config.ts`**: Strip down to the bare-bones Prisma 7 configuration standard mapping to the schema file.
- **`src/lib/prisma.ts`**: Utilize the `globalThis` singleton pattern with a standard `PrismaClient` instantiation. Avoid creating new `pg.Pool` connections inside route handlers to prevent exhausting Neon's connection pool limits during serverless scaling.
- Clean up package dependencies: Remove `better-sqlite3` and `@prisma/adapter-better-sqlite3`.

---

### Native Crypto Integration (Replacing bcrypt)

- Create a new utility file `src/lib/crypto.ts` utilizing native Node.js `crypto` for securely hashing passwords using `scrypt` or HMAC-SHA256, eliminating the heavy `bcrypt` C++ compilation requirement.
- Implemented `hashOTP` using HMAC-SHA256 for secure 2FA token hashing.
- Refactor all auth API routes to use the new native crypto utility.

---

### Verification Route Implementation - *New*

- Create `src/app/api/auth/verify-otp/route.ts`.
- Fetch the hashed OTP from the database, use `crypto.timingSafeEqual` to prevent timing attacks, and authenticate/register the user into Neon.

---

### Authentication (Google OAuth + Auth.js)

- Install and configure Auth.js (NextAuth v5) in `auth.ts` and `src/app/api/auth/[...nextauth]/route.ts`.
- Update `schema.prisma` to include NextAuth required models (Account, Session, User updates).
- Update the Frontend Login Page to include a "Sign in with Google" button.

---

### Hybrid Twilio SMS Workflow

- Update the OTP logic to check `process.env.TWILIO_VERIFIED_NUMBERS`.
- If the target phone number is unverified, bypass the Twilio API, write a mock OTP to the database, and return a 200 OK to allow seamless reviewer testing.

## Verification Plan

### Manual Verification
- Add Neon `DATABASE_URL` to `.env` (using pooled port ending with -pooler or 5432).
- Run `npx prisma db push` to push the schema to the cloud.
- Test locally using Turbopack (`npm run dev --turbo`).
- Deploy to Vercel for live testing.
