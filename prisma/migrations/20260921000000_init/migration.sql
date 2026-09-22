-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "role" TEXT NOT NULL DEFAULT 'STUDENT',
    "uii" TEXT,
    "fullName" TEXT,
    "rruIdNumber" TEXT,
    "dob" TEXT,
    "bloodGroup" TEXT,
    "allergies" TEXT,
    "contactNumber" TEXT,
    "emergencyContact" TEXT,
    "guardianRelation" TEXT,
    "guardianName" TEXT,
    "guardianContact" TEXT,
    "currentAddress" TEXT,
    "profilePhotoUrl" TEXT,
    "idCardPhotoUrl" TEXT,
    "resetToken" TEXT,
    "resetTokenExpiry" TIMESTAMP(3),
    "tokenVersion" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "deviceFingerprint" TEXT,
    "geoId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Asset" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "assetType" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "qrReferenceId" TEXT NOT NULL,
    "frontPhotoUrl" TEXT,
    "backPhotoUrl" TEXT,
    "leftPhotoUrl" TEXT,
    "rightPhotoUrl" TEXT,
    "rcPhotoUrl" TEXT,
    "devicePhotoUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bystander" (
    "id" TEXT NOT NULL,
    "mobileNumber" TEXT NOT NULL,
    "mobileNumberHash" TEXT NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Bystander_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Incident" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "bystanderId" TEXT NOT NULL,
    "assignedUserId" TEXT,
    "selfieUrl" TEXT,
    "scenePhotoUrl" TEXT,
    "scenePhotoUrl2" TEXT,
    "scenePhotoUrl3" TEXT,
    "scenePhotoUrl4" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "deviceFingerprint" TEXT,
    "ipAddress" TEXT,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Incident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaptureToken" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "bystanderId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CaptureToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsumedIdToken" (
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConsumedIdToken_pkey" PRIMARY KEY ("tokenHash")
);

-- CreateTable
CREATE TABLE "RateLimit" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "resetTime" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RateLimit_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "AssetScanRateLimit" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "ipAddress" TEXT NOT NULL,
    "scannedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssetScanRateLimit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_uii_key" ON "User"("uii");

-- CreateIndex
CREATE UNIQUE INDEX "User_rruIdNumber_key" ON "User"("rruIdNumber");

-- CreateIndex
CREATE UNIQUE INDEX "User_resetToken_key" ON "User"("resetToken");

-- CreateIndex
CREATE INDEX "User_role_createdAt_idx" ON "User"("role", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_userId_createdAt_idx" ON "AuditLog"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_action_createdAt_idx" ON "AuditLog"("action", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Asset_qrReferenceId_key" ON "Asset"("qrReferenceId");

-- CreateIndex
CREATE INDEX "Asset_userId_idx" ON "Asset"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Bystander_mobileNumberHash_key" ON "Bystander"("mobileNumberHash");

-- CreateIndex
CREATE INDEX "Incident_assetId_idx" ON "Incident"("assetId");

-- CreateIndex
CREATE INDEX "Incident_bystanderId_idx" ON "Incident"("bystanderId");

-- CreateIndex
CREATE INDEX "Incident_status_createdAt_idx" ON "Incident"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CaptureToken_token_key" ON "CaptureToken"("token");

-- CreateIndex
CREATE INDEX "CaptureToken_expiresAt_idx" ON "CaptureToken"("expiresAt");

-- CreateIndex
CREATE INDEX "ConsumedIdToken_expiresAt_idx" ON "ConsumedIdToken"("expiresAt");

-- CreateIndex
CREATE INDEX "RateLimit_resetTime_idx" ON "RateLimit"("resetTime");

-- CreateIndex
CREATE INDEX "AssetScanRateLimit_assetId_scannedAt_idx" ON "AssetScanRateLimit"("assetId", "scannedAt");

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Incident" ADD CONSTRAINT "Incident_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Incident" ADD CONSTRAINT "Incident_bystanderId_fkey" FOREIGN KEY ("bystanderId") REFERENCES "Bystander"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Incident" ADD CONSTRAINT "Incident_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaptureToken" ADD CONSTRAINT "CaptureToken_bystanderId_fkey" FOREIGN KEY ("bystanderId") REFERENCES "Bystander"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetScanRateLimit" ADD CONSTRAINT "AssetScanRateLimit_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

