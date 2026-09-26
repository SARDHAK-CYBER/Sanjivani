"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Pencil, Plus, QrCode, Trash2, UploadCloud, X } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { ASSET_PHOTO_KEYS, ASSET_TYPES, type AssetPhotoKey } from "@/lib/constants";
import { useQrBaseUrl } from "@/lib/use-qr-base-url";
import type { AssetSummary } from "@/lib/types";

const LABELS: Record<AssetPhotoKey, string> = {
  frontPhotoUrl: "Front",
  backPhotoUrl: "Back",
  leftPhotoUrl: "Left",
  rightPhotoUrl: "Right",
  rcPhotoUrl: "RC book / card",
  devicePhotoUrl: "Device photo",
};
const SLOTS: Record<string, AssetPhotoKey[]> = {
  VEHICLE: ["frontPhotoUrl", "backPhotoUrl", "leftPhotoUrl", "rightPhotoUrl", "rcPhotoUrl"],
  LAPTOP: ["devicePhotoUrl"],
  MOBILE: ["devicePhotoUrl"],
};
const IDENTIFIER_HINT: Record<string, string> = { VEHICLE: "Licence plate, e.g. GJ-01-AB-1234", LAPTOP: "Serial number", MOBILE: "IMEI or serial number" };

const field =
  "w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-red-600";
const REFRESH_MS = 15_000;

type Draft = { id: string | null; assetType: string; identifier: string; files: Partial<Record<AssetPhotoKey, File>>; removed: Partial<Record<AssetPhotoKey, boolean>>; existing: Partial<Record<AssetPhotoKey, string | null>> };

const blankDraft = (): Draft => ({ id: null, assetType: "VEHICLE", identifier: "", files: {}, removed: {}, existing: {} });

async function uploadFile(file: File): Promise<string> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch("/api/upload", { method: "POST", body: fd });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.url) throw new Error(data.error || "A photo failed to upload. Check your connection and try again.");
  return data.url;
}

export function MemberAssets({ initial }: { initial: AssetSummary[] }) {
  const baseUrl = useQrBaseUrl();
  const [assets, setAssets] = useState<AssetSummary[]>(initial);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    const res = await fetch("/api/user/assets").catch(() => null);
    if (res?.ok) setAssets(await res.json());
  }, []);

  // New scans/edits from other devices show up without a manual reload, but never mid-edit.
  useEffect(() => {
    if (draft) return;
    const tick = () => document.visibilityState === "visible" && void refresh();
    const timer = setInterval(tick, REFRESH_MS);
    window.addEventListener("focus", tick);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", tick);
    };
  }, [draft, refresh]);

  const startEdit = (asset: AssetSummary) =>
    setDraft({
      id: asset.id,
      assetType: asset.assetType,
      identifier: asset.identifier,
      files: {},
      removed: {},
      existing: Object.fromEntries(ASSET_PHOTO_KEYS.map((k) => [k, asset[k]])),
    });

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft) return;
    setBusy(true);
    setError("");
    try {
      const keys = ASSET_PHOTO_KEYS.filter((k) => draft.files[k]);
      const urls = await Promise.all(keys.map((k) => uploadFile(draft.files[k]!)));
      const photos: Record<string, string | null> = {};
      keys.forEach((k, i) => (photos[k] = urls[i]));
      for (const k of ASSET_PHOTO_KEYS) if (draft.removed[k] && !draft.files[k]) photos[k] = null;

      const res = await fetch(draft.id ? `/api/user/assets/${draft.id}` : "/api/user/assets", {
        method: draft.id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assetType: draft.assetType, identifier: draft.identifier, ...photos }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return setError(data.error || "Could not save the asset.");
      setDraft(null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the asset.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (asset: AssetSummary) => {
    if (!window.confirm(`Remove ${asset.assetType} ${asset.identifier}? Its QR code will stop working.`)) return;
    setError("");
    const res = await fetch(`/api/user/assets/${asset.id}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return setError(data.error || "Could not remove the asset.");
    await refresh();
  };

  return (
    <div className="pt-6 mt-6 border-t border-gray-200 dark:border-gray-800">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold text-gray-900 dark:text-white flex items-center"><QrCode className="w-5 h-5 mr-2 text-blue-500" /> My Assets &amp; QR Codes</h3>
        {!draft && (
          <button type="button" onClick={() => { setError(""); setDraft(blankDraft()); }} className="inline-flex items-center px-3 py-2 text-sm font-bold rounded-lg bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:opacity-90">
            <Plus className="w-4 h-4 mr-1" /> Add asset
          </button>
        )}
      </div>

      {error && !draft && <div role="alert" className="mb-4 p-3 text-sm rounded-lg bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800">{error}</div>}

      {draft && (
        <form onSubmit={save} className="mb-6 p-5 rounded-xl border border-blue-200 dark:border-blue-900/50 bg-blue-50/50 dark:bg-blue-900/10 space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="font-bold text-gray-900 dark:text-white">{draft.id ? "Edit asset" : "Add a new asset"}</h4>
            <button type="button" onClick={() => setDraft(null)} aria-label="Cancel" className="text-gray-500 hover:text-gray-700"><X className="w-5 h-5" /></button>
          </div>
          {error && <div role="alert" className="p-3 text-sm rounded-lg bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800">{error}</div>}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Type</label>
              <select value={draft.assetType} onChange={(e) => setDraft({ ...draft, assetType: e.target.value, files: {}, removed: {} })} className={field}>
                {ASSET_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Identifier</label>
              <input required maxLength={100} value={draft.identifier} onChange={(e) => setDraft({ ...draft, identifier: e.target.value })} placeholder={IDENTIFIER_HINT[draft.assetType]} className={field} />
            </div>
          </div>

          <div>
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Photos (optional, JPEG/PNG/WebP up to 5 MB)</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {(SLOTS[draft.assetType] ?? []).map((key) => {
                const file = draft.files[key];
                const existingUrl = !draft.removed[key] ? draft.existing[key] : null;
                return (
                  <div key={key} className="rounded-lg border border-dashed border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 p-3 text-center">
                    {existingUrl && !file && <img src={existingUrl} alt={LABELS[key]} className="mx-auto mb-2 h-16 w-16 rounded object-cover border border-gray-200" />}
                    <label className="cursor-pointer block">
                      <UploadCloud className="w-5 h-5 mx-auto text-blue-500 mb-1" />
                      <span className="block text-xs font-medium text-gray-600 dark:text-gray-300 break-all">{file ? file.name : existingUrl ? `Replace ${LABELS[key]}` : LABELS[key]}</span>
                      <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) setDraft({ ...draft, files: { ...draft.files, [key]: f }, removed: { ...draft.removed, [key]: false } }); }} />
                    </label>
                    {(existingUrl || file) && (
                      <button type="button" onClick={() => { const files = { ...draft.files }; delete files[key]; setDraft({ ...draft, files, removed: { ...draft.removed, [key]: true } }); }} className="mt-1 text-xs text-red-600 hover:underline">Remove</button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setDraft(null)} className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300">Cancel</button>
            <button type="submit" disabled={busy} className="px-4 py-2 text-sm font-bold rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 inline-flex items-center">
              {busy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} {draft.id ? "Save asset" : "Register asset"}
            </button>
          </div>
        </form>
      )}

      {assets.length === 0 && !draft ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">You have no registered assets yet. Add a vehicle, laptop or phone to get a QR code a bystander can scan in an emergency.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {assets.map((asset) => (
            <div key={asset.id} className="bg-gray-50 dark:bg-gray-800/50 p-4 rounded-xl border border-gray-200 dark:border-gray-700 flex flex-col items-center text-center">
              <div className="bg-white p-2 rounded-lg shadow-sm border border-gray-200 mb-3">
                {/* Rendered in the browser: the scan link contains the secret asset ID and must not be sent to a third-party QR service. */}
                <QRCodeSVG value={`${baseUrl}/scan/${asset.qrReferenceId}`} size={112} level="M" />
              </div>
              <h4 className="font-bold text-gray-900 dark:text-white">{asset.assetType}</h4>
              <p className="text-sm text-gray-700 dark:text-gray-300">{asset.identifier}</p>
              <div className="flex gap-2 mt-2 w-full justify-center flex-wrap">
                {ASSET_PHOTO_KEYS.map((k) => asset[k]).filter((u): u is string => Boolean(u)).map((url) => (
                  <a href={url} target="_blank" rel="noopener noreferrer" key={url} className="block w-12 h-12 rounded overflow-hidden border border-gray-300 flex-shrink-0">
                    <img src={url} className="w-full h-full object-cover" alt="" />
                  </a>
                ))}
              </div>
              <div className="flex gap-2 mt-3">
                <button type="button" onClick={() => startEdit(asset)} className="inline-flex items-center text-xs font-medium px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"><Pencil className="w-3 h-3 mr-1" /> Edit</button>
                <button type="button" onClick={() => void remove(asset)} className="inline-flex items-center text-xs font-medium px-3 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"><Trash2 className="w-3 h-3 mr-1" /> Remove</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
