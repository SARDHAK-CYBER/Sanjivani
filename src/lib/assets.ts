import { ASSET_PHOTO_KEYS, type AssetPhotoKey } from "@/lib/constants";
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
