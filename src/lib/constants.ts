export const SESSION_COOKIE = "auth_token";

export const ROLES = ["ADMIN", "STAFF", "STUDENT", "SECURITY"] as const;
/** Roles a person may pick for themselves at registration. ADMIN is only ever created by scripts/seed-admin.ts. */
export const SELF_SERVICE_ROLES = ["STUDENT", "STAFF", "SECURITY"] as const;

export const ASSET_TYPES = ["VEHICLE", "LAPTOP", "MOBILE"] as const;

export const ASSET_PHOTO_KEYS = ["frontPhotoUrl", "backPhotoUrl", "leftPhotoUrl", "rightPhotoUrl", "rcPhotoUrl", "devicePhotoUrl"] as const;
export type AssetPhotoKey = (typeof ASSET_PHOTO_KEYS)[number];
export type AssetType = (typeof ASSET_TYPES)[number];

/**
 * The photos each kind of asset takes. A phone needs two (front, back) and a laptop three; a vehicle's are optional.
 * They reuse the existing photo columns, so no schema change: phones use front/back, laptops use device/front/back.
 */
export const ASSET_PHOTO_SLOTS: Record<AssetType, { key: AssetPhotoKey; label: string; required: boolean }[]> = {
  VEHICLE: [
    { key: "frontPhotoUrl", label: "Front", required: false },
    { key: "backPhotoUrl", label: "Back", required: false },
    { key: "leftPhotoUrl", label: "Left side", required: false },
    { key: "rightPhotoUrl", label: "Right side", required: false },
    { key: "rcPhotoUrl", label: "RC book / card", required: false },
  ],
  MOBILE: [
    { key: "frontPhotoUrl", label: "Front of phone", required: true },
    { key: "backPhotoUrl", label: "Back of phone", required: true },
  ],
  LAPTOP: [
    { key: "devicePhotoUrl", label: "Laptop closed (lid)", required: true },
    { key: "frontPhotoUrl", label: "Laptop open (screen & keyboard)", required: true },
    { key: "backPhotoUrl", label: "Serial number label", required: true },
  ],
};

export const INCIDENT_STATUSES = ["NEW", "IN_PROGRESS", "RESOLVED", "BLOCKED", "FLAGGED"] as const;
/** Statuses for which the bystander may still be shown the owner's emergency details. */
export const PII_RELEASABLE_STATUSES = ["NEW", "IN_PROGRESS", "RESOLVED"] as const;

/** Seconds between filing a report and the owner's emergency details being released (window for an admin to block). */
export const PII_RELEASE_DELAY_SECONDS = 10;

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

export const ADMIN_SESSION_SECONDS = 30 * 60;
export const MEMBER_SESSION_SECONDS = 12 * 60 * 60;
