# Project Status and Verification Report

## Sanjivani: QR-Based Emergency Response System, v1.0

| | |
| --- | --- |
| **Report date** | 27 September 2026 |
| **Release** | 1.0 (production pilot) |
| **Production** | Vercel, region `sin1`; database Neon (`ap-southeast-1`); files Vercel Blob |
| **Source** | GitHub `SARDHAK-CYBER/Sanjivani`, branch `main` |
| **Companion documents** | `PRD.md` (requirements), `README.md` (setup and operations) |

---

## 1. Summary

Sanjivani v1.0 is live and working end to end on production infrastructure. A member can register (with real SMS
verification and photo uploads), add assets, download a QR poster, and a bystander can scan that QR on a phone and
receive the owner's name, blood group and, after the review window, emergency contacts. Administrators sign in with
password + authenticator app, receive live incident alerts, and review audit logs with before/after detail.

The main risks going into wider use are operational rather than functional: shared secrets that should be rotated,
free-tier cold starts, manual database migrations, and a few paths that have not yet been exercised on a live site
(listed in section 5).

## 2. What was delivered in v1.0

| Area | Delivered |
| --- | --- |
| Identity | Registration with encrypted PII, UII codes, profile editing, duplicate-number protection |
| Authentication | Password + TOTP with recovery codes; SMS only for setup, recovery, number change and the admin's first login after a password reset; admin cannot self-reset 2FA |
| Phone verification | App-generated, hashed, rate-limited codes delivered by Fast2SMS Quick SMS (no DLT); single-use proofs |
| Assets | Members add/edit/remove their own assets; 2 photos for a mobile, 3 for a laptop; admin registration still available |
| QR | Browser-rendered QR (error-correction H), print-ready **poster** PNG with the RRU template, bare SVG |
| Bystander flow | SMS verification, selfie + 2 to 4 scene photos, GPS, immediate name + blood group, delayed contacts, helpline buttons, campus map link, first-aid tips |
| C2 dashboard | Live feed and counters, incident triage and block, member directory and deep profiles, audit tabs (security vs incident) with before/after review |
| Alerts | Toast, sound, sidebar badge, tab-title count, opt-in desktop notification on any admin page; auto-refreshing lists |
| Responsive | 320 px to desktop; bottom nav and stacked-card tables on phones; iOS/Android-safe form sizing |
| Branding | Sanjivani logo in every header, favicon and apple-touch icon |
| Infrastructure | Vercel Blob storage, Singapore function region, Prisma migrations, retry-safe migration script |

## 3. Verification

### 3.1 Automated

- `npm test`: **102 unit tests pass** (TOTP against RFC 4226/6238 vectors, encryption, tokens, IP resolution, password rules, profile validation, storage, OTP code/hash/transport with mocked HTTP, CSV, Turnstile).
- `tsc --noEmit` and ESLint: **0 errors**.
- Layout checked in a real browser at 320, 375 and 820 px: no horizontal overflow on public pages; admin bottom navigation and stacked table cards render correctly (admin data rows were simulated because the preview database was empty).

### 3.2 Confirmed live on production during testing

| Check | Result |
| --- | --- |
| Registration: form, two photo uploads, SMS OTP send and verify, account creation | Passed |
| SMS delivery via Fast2SMS (real phone) | Passed |
| File upload to Vercel Blob | Passed after fixing OIDC detection |
| Admin login with authenticator code | Passed |
| Audit page with profile-change entries | Passed; field list then before/after review added |
| Real-phone QR scan showing the bystander page (blood group, contacts, tips) | Passed; name and campus card added afterwards |
| QR poster download with the template | Confirmed working by the project owner |

## 4. Problems found and how they were resolved

| # | Problem | Cause | Resolution |
| --- | --- | --- | --- |
| 1 | OTP verification could not be completed with MSG91's widget | MSG91's `verifyAccessToken` rejected valid tokens even on a real HTTPS domain (widget send/verify itself worked) | Widget retired |
| 2 | MSG91 Flow and SendOTP APIs accepted requests but delivered nothing | Both require a DLT-registered Sender ID/template for India, which the account lacks | Switched delivery to Fast2SMS Quick SMS (no DLT); confirmed real delivery before wiring in |
| 3 | Send button spun forever | Widget init function was assigned instead of called | Fixed (then moot after the provider change) |
| 4 | Login phone step always failed | Client dropped the `tempToken` the server needs | Fixed |
| 5 | Uploads returned 500 on Vercel | Local-disk storage is read-only/non-persistent on serverless | Added Vercel Blob backend with local-disk fallback |
| 6 | Blob still not used after connecting the store | Connected stores authenticate with OIDC (`BLOB_STORE_ID`), not `BLOB_READ_WRITE_TOKEN`, which was the only variable checked | Detection now accepts either |
| 7 | Admin login: "no verified phone number" | Admin was seeded locally with a different `ENCRYPTION_KEY` than Vercel's; both share one database | Re-encrypted the admin's phone and TOTP secret with the correct key; local `.env` aligned; recovery codes regenerated |
| 8 | Slow pages and alerts | Functions in Washington, database in Singapore | Pinned functions to `sin1` |
| 9 | Slow incident submission | Photos uploaded one after another | Uploaded in parallel |
| 10 | Vercel builds failed | `prisma migrate deploy` timed out (P1002) inside the build | Migrations removed from the build; run by hand with `npm run db:migrate` (direct host, retries) |
| 11 | Audit log did not say what changed | Only the action name was stored | Encrypted field-level before/after, reviewable per row |
| 12 | No mobile navigation for admins; wide tables unusable | Sidebar hidden below `md`, no alternative | Bottom tab bar, stacked tables, viewport/safe-area fixes |
| 13 | A scratch file with admin recovery codes was committed | Human/tooling error | Removed in the next commit; **history still contains it** (see 5) |

## 5. Open items and risks

| Priority | Item | Recommendation |
| --- | --- | --- |
| High | Several secrets were shared in the working conversation (Fast2SMS API key, Neon database password, admin password, admin recovery codes) | Rotate all of them; regenerate admin recovery codes from the two-factor card. If the GitHub repo is public, also scrub git history for the committed recovery codes. |
| High | Not yet exercised on a live site: the admin's texted code after a password reset; adding a mobile (2 photos) / laptop (3 photos) asset end to end; the alert toast/sound with a real incident; the layout on physical Android and iOS devices | Run these once before wider rollout |
| Medium | Migrations are manual | After adding a migration, run `npm run db:migrate` before or right after pushing |
| Medium | Free-tier cold starts on Vercel Hobby and Neon | Accept for the pilot; upgrade a tier or add a keep-warm ping if it hurts |
| Medium | Admin SMS rule is derived from audit rows; if the reset audit write failed, the SMS step would be skipped | Consider a dedicated column in a later migration |
| Medium | Single administrator account | Create a second admin (`seed:admin`) so one lost authenticator cannot lock everyone out |
| Low | Helpline numbers and campus map link are constants in the scan page | Move to an admin-editable setting |
| Low | No monitoring/alerting (errors, uptime, SMS wallet balance) | Add error tracking and a wallet-balance check |
| Low | `next dev` regenerates `AGENTS.md` locally (ignored by git) | None |

## 6. Operations runbook

| Task | How |
| --- | --- |
| Deploy | Push to `main`; Vercel builds `prisma generate` + `next build` |
| Apply a new migration | `set DATABASE_URL=...` then `npm run db:migrate` (uses the direct Neon host, retries) |
| Create the first admin | `npm run seed:admin` with `ADMIN_EMAIL`, `ADMIN_PHONE`, `ADMIN_PASSWORD` |
| Reset an admin's authenticator | `npm run reset-2fa -- admin@example.edu` (another operator) |
| Test SMS delivery | `npm run otp:smoke -- +91XXXXXXXXXX` |
| Generate secrets | `npm run gen:secrets`; the **same** `ENCRYPTION_KEY`, `JWT_SECRET`, `BYSTANDER_JWT_SECRET` everywhere a database is shared |
| SMS wallet | Top up Fast2SMS (about INR 5 per message); the API refuses sends when the wallet is empty |
| Read runtime errors | Vercel dashboard, Logs (filter to the latest deployment) |

## 7. Cost profile

| Item | Current | Notes |
| --- | --- | --- |
| Hosting | Vercel Hobby | Free tier |
| Database | Neon free tier | Compute sleeps when idle |
| Files | Vercel Blob | Free allowance; private store |
| SMS | Fast2SMS, about INR 5 per message | Bounded by per-number, per-IP and daily caps (`OTP_DAILY_LIMIT`, default 2000, so worst case about INR 10,000 per day if abused at the cap) |

## 8. Recommendations

1. Rotate the shared secrets and regenerate recovery codes now.
2. Run the not-yet-exercised checks in section 5 on real devices.
3. Create a second administrator and store recovery codes offline.
4. Print QR posters for a small group first, scan each one on a different phone and network, then roll out.
5. Decide the roadmap items in `PRD.md` section 8, starting with owner notification on scan.
