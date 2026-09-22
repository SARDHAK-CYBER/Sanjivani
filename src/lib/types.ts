// Shapes returned by the API routes and consumed by the client pages.

export type AssetSummary = {
  id: string;
  assetType: string;
  identifier: string;
  qrReferenceId: string;
  frontPhotoUrl: string | null;
  backPhotoUrl: string | null;
  leftPhotoUrl: string | null;
  rightPhotoUrl: string | null;
  rcPhotoUrl: string | null;
  devicePhotoUrl: string | null;
};

export type AuditLogEntry = {
  id: string;
  action: string;
  geoId: string | null;
  deviceFingerprint: string | null;
  createdAt: string;
  user?: { fullName: string | null; uii: string | null; role: string } | null;
};

/** A member with PII decrypted (GET /api/user/profile and GET /api/admin/members/[id]). */
export type MemberProfile = {
  id: string;
  email: string;
  role: string;
  uii: string | null;
  fullName: string | null;
  rruIdNumber: string | null;
  profilePhotoUrl: string | null;
  idCardPhotoUrl: string | null;
  createdAt: string;
  dob: string | null;
  bloodGroup: string | null;
  allergies: string | null;
  contactNumber: string | null;
  emergencyContact: string | null;
  guardianRelation: string | null;
  guardianName: string | null;
  guardianContact: string | null;
  currentAddress: string | null;
  assets: AssetSummary[];
  auditLogs?: AuditLogEntry[];
};

export type AdminIncident = {
  id: string;
  assetId: string;
  bystanderId: string;
  selfieUrl: string | null;
  scenePhotoUrl: string | null;
  scenePhotoUrl2: string | null;
  scenePhotoUrl3: string | null;
  scenePhotoUrl4: string | null;
  latitude: number | null;
  longitude: number | null;
  ipAddress: string | null;
  deviceFingerprint: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  ownerContact: string;
  asset: {
    identifier: string;
    assetType: string;
    user: { fullName: string | null; uii: string | null; email: string };
  };
  bystander: { mobileNumber: string; verified: boolean };
};

/** GET /api/incidents/[id]/full */
export type ReleasedEmergencyInfo = {
  allergies: string | null;
  emergencyContact: string | null;
  guardianRelation: string | null;
  guardianName: string | null;
  guardianContact: string | null;
};
