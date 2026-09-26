import { ASSET_PHOTO_KEYS, ASSET_PHOTO_SLOTS, type AssetPhotoKey, type AssetType } from "@/lib/constants";
import { StorageError, adoptTempFile } from "@/lib/storage";

export const MAX_ASSETS_PER_MEMBER = 10;

export const assetSummarySelect = {
  id: true,
  assetType: true,
  identifier: true,
  qrReferenceId: true,
  createdAt: true,
  frontPhotoUrl: true,
  backPhotoUrl: true,
  leftPhotoUrl: true,
  rightPhotoUrl: true,
  rcPhotoUrl: true,
  devicePhotoUrl: true,
} as const;

/**
 * Turns the photo fields of a request into column values. A key that is absent is left alone (undefined),
 * null/"" clears the photo, and a string must be a temp upload URL this server minted (adopted into the
 * owner's folder). Throws StorageError for anything else.
 */
export async function adoptAssetPhotos(body: Record<string, unknown>, ownerId: string): Promise<Partial<Record<AssetPhotoKey, string | null>>> {
  const out: Partial<Record<AssetPhotoKey, string | null>> = {};
  for (const key of ASSET_PHOTO_KEYS) {
    const value = body[key];
    if (value === undefined) continue;
    if (value === null || value === "") out[key] = null;
    else if (typeof value === "string") out[key] = await adoptTempFile(value, [ownerId]);
    else throw new StorageError("Invalid file reference.");
  }
  return out;
}

/** For a new asset: the label of the first required photo the request lacks, or null if it has them all. */
export function missingRequiredPhoto(assetType: AssetType, body: Record<string, unknown>): string | null {
  const slot = ASSET_PHOTO_SLOTS[assetType].find(({ key, required }) => required && !(typeof body[key] === "string" && body[key]));
  return slot ? `${slot.label} photo is required for a ${assetType.toLowerCase()}.` : null;
}
