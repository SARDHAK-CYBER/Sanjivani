export const SESSION_COOKIE = "auth_token";

export const ROLES = ["ADMIN", "STAFF", "STUDENT", "SECURITY"] as const;
/** Roles a person may pick for themselves at registration. ADMIN is only ever created by scripts/seed-admin.ts. */
export const SELF_SERVICE_ROLES = ["STUDENT", "STAFF", "SECURITY"] as const;

export const ASSET_TYPES = ["VEHICLE", "LAPTOP", "MOBILE"] as const;

export const INCIDENT_STATUSES = ["NEW", "IN_PROGRESS", "RESOLVED", "BLOCKED", "FLAGGED"] as const;
/** Statuses for which the bystander may still be shown the owner's emergency details. */
export const PII_RELEASABLE_STATUSES = ["NEW", "IN_PROGRESS", "RESOLVED"] as const;

/** Seconds between filing a report and the owner's emergency details being released (window for an admin to block). */
export const PII_RELEASE_DELAY_SECONDS = 10;

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

export const ADMIN_SESSION_SECONDS = 30 * 60;
export const MEMBER_SESSION_SECONDS = 12 * 60 * 60;
