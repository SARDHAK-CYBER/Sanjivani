"use client";
import { useState, useEffect } from "react";
import { Plus, QrCode, UploadCloud, Loader2 } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useQrBaseUrl } from "@/lib/use-qr-base-url";
import { ASSET_PHOTO_SLOTS, type AssetPhotoKey, type AssetType } from "@/lib/constants";
import { usePolling } from "@/lib/use-polling";

type User = {
  id: string;
  fullName: string;
  uii: string;
  rruIdNumber: string;
};

type Asset = {
  id: string;
  assetType: string;
  identifier: string;
  qrReferenceId: string;
  user: User;
};

export default function AssetsPage() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [members, setMembers] = useState<User[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const baseUrl = useQrBaseUrl();
  const [reloadKey, setReloadKey] = useState(0); // bump to refetch the asset list
  
  // Form State
  const [userId, setUserId] = useState("");
  const [assetType, setAssetType] = useState("VEHICLE");
  const [identifier, setIdentifier] = useState("");
  const [ownerSearch, setOwnerSearch] = useState("");
  const [formError, setFormError] = useState("");

  // Photos State: which file is chosen for each slot of the selected asset type
  const [photos, setPhotos] = useState<Partial<Record<AssetPhotoKey, File>>>({});

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const res = await fetch("/api/assets").catch(() => null);
      if (!cancelled && res?.ok) setAssets(await res.json());
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  // Members can now register assets themselves, so pick those up without a manual reload.
  usePolling(async () => {
    const res = await fetch("/api/assets").catch(() => null);
    if (res?.ok) setAssets(await res.json());
  }, 10000);

  // The owner picker searches the directory server-side instead of loading only the first page of members.
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      const res = await fetch(`/api/members?search=${encodeURIComponent(ownerSearch)}&limit=50`).catch(() => null);
      if (!cancelled && res?.ok) setMembers((await res.json()).data || []);
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [ownerSearch]);

  const handleUpload = async (file: File | null) => {
    if (!file) return null;
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/upload", { method: "POST", body: fd });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.url) throw new Error(data.error || "Photo upload failed");
    return data.url;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setFormError("");

    try {
      const slots = ASSET_PHOTO_SLOTS[assetType as AssetType];
      const missing = slots.find(({ key, required }) => required && !photos[key]);
      if (missing) {
        setFormError(`${missing.label} photo is required.`);
        return;
      }
      const uploaded: Record<string, string | null> = {};
      await Promise.all(
        slots.map(async ({ key }) => {
          uploaded[key] = await handleUpload(photos[key] ?? null);
        })
      );

      const res = await fetch("/api/assets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          userId, assetType, identifier,
          ...uploaded
        }),
      });
      
      if (res.ok) {
        setShowForm(false);
        setReloadKey((k) => k + 1);
        setIdentifier("");
        setUserId("");
        setPhotos({});
      } else {
        const data = await res.json().catch(() => ({}));
        setFormError(data.error || "Failed to create asset");
      }
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Error uploading media");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Assets & QR Codes</h1>
        <button 
          onClick={() => setShowForm(!showForm)}
          className="bg-red-600 text-white px-4 py-2 rounded-lg flex items-center hover:bg-red-700 transition"
        >
          <Plus className="w-4 h-4 mr-2" /> Register Asset
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white dark:bg-gray-900 p-8 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 space-y-6">
          {formError && <div role="alert" className="p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-sm rounded-lg">{formError}</div>}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Owner</label>
              <input type="search" value={ownerSearch} onChange={e=>setOwnerSearch(e.target.value)} placeholder="Search name, UII or RRU ID..." className="w-full px-3 py-2 mb-2 border dark:border-gray-700 dark:bg-gray-800 rounded-lg outline-none text-sm text-gray-900 dark:text-white" />
              <select required value={userId} onChange={e=>setUserId(e.target.value)} className="w-full px-3 py-2 border dark:border-gray-700 dark:bg-gray-800 rounded-lg outline-none text-gray-900 dark:text-white">
                <option value="">Select a user...</option>
                {members.map(m => <option key={m.id} value={m.id}>{m.fullName} ({m.rruIdNumber})</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Asset Type</label>
              <select value={assetType} onChange={e=>{ setAssetType(e.target.value); setPhotos({}); }} className="w-full px-3 py-2 border dark:border-gray-700 dark:bg-gray-800 rounded-lg outline-none text-gray-900 dark:text-white">
                <option value="VEHICLE">Vehicle</option>
                <option value="LAPTOP">Laptop</option>
                <option value="MOBILE">Mobile Device</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Identifier (e.g. License Plate)</label>
              <input required value={identifier} onChange={e=>setIdentifier(e.target.value)} type="text" className="w-full px-3 py-2 border dark:border-gray-700 dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg outline-none" placeholder="GJ-01-XX-1234" />
            </div>
          </div>

          <div className="border-t border-gray-100 dark:border-gray-800 pt-6">
            <h3 className="font-bold text-gray-900 dark:text-white mb-4">Upload Asset Photos</h3>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              {ASSET_PHOTO_SLOTS[assetType as AssetType].map(({ key, label, required }) => (
                <div key={key} className="p-4 border border-dashed border-gray-300 dark:border-gray-700 rounded-lg text-center bg-gray-50 dark:bg-gray-800/50">
                  <label className="cursor-pointer">
                    <UploadCloud className="mx-auto w-6 h-6 text-gray-400 mb-2"/>
                    <span className="block text-xs font-medium text-gray-600 dark:text-gray-300 break-all">{photos[key] ? photos[key]!.name : label}{required && !photos[key] ? " *" : ""}</span>
                    <input type="file" accept="image/*" onChange={e => { const file = e.target.files?.[0]; setPhotos(p => { const next = { ...p }; if (file) next[key] = file; else delete next[key]; return next; }); }} className="hidden" />
                  </label>
                </div>
              ))}
            </div>
          </div>

          <button disabled={loading} type="submit" className="w-full bg-gray-900 dark:bg-white text-white dark:text-gray-900 font-bold px-4 py-3 rounded-lg hover:bg-gray-800 transition flex justify-center items-center">
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Generate Secure QR Code"}
          </button>
        </form>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {assets.map(asset => (
          <div key={asset.id} className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden flex flex-col items-center p-6">
            <QRCodeSVG 
              value={`${baseUrl}/scan/${asset.qrReferenceId}`}
              size={150}
              level={"H"}
              className="mb-4 bg-white p-2 rounded border border-gray-200"
            />
            <h3 className="font-bold text-lg text-gray-900 dark:text-white">{asset.identifier}</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">{asset.assetType}</p>
            <div className="w-full border-t border-gray-100 dark:border-gray-800 pt-3 mt-auto">
              <p className="text-xs text-gray-400">Owner</p>
              <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{asset.user?.fullName}</p>
              <p className="text-xs font-mono text-gray-500">{asset.user?.uii}</p>
            </div>
            <a 
              href={`${baseUrl}/scan/${asset.qrReferenceId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 text-sm text-red-600 dark:text-red-400 hover:underline flex items-center bg-red-50 dark:bg-red-900/20 px-3 py-1.5 rounded-full"
            >
              <QrCode className="w-4 h-4 mr-1" /> View Public Facing Page
            </a>
          </div>
        ))}
      </div>
    </div>
  );
}
