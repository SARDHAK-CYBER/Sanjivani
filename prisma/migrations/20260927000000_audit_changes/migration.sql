-- Before/after values for audited changes, AES-256-GCM encrypted like the profile columns they mirror.
ALTER TABLE "AuditLog" ADD COLUMN "changesEnc" TEXT;
