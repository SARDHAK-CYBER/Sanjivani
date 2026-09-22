"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Shield, AlertCircle, Loader2, Save, QrCode } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { Msg91WidgetOtp } from "@/components/Msg91WidgetOtp";
import { TwoFactorCard } from "@/components/TwoFactorCard";
import { parseE164 } from "@/lib/phone";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LogoutButton } from "@/components/LogoutButton";
import { useQrBaseUrl } from "@/lib/use-qr-base-url";
import type { MemberProfile } from "@/lib/types";

export default function UserDashboard() {
  const router = useRouter();
  const [user, setUser] = useState<MemberProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const baseUrl = useQrBaseUrl();
  const [savedNumber, setSavedNumber] = useState(""); // the verified number currently on the account
  const [phoneProof, setPhoneProof] = useState(""); // proof that a *changed* number belongs to the user
  const [showVerify, setShowVerify] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch("/api/user/profile");
        if (cancelled) return;
        if (res.status === 401) {
          router.replace("/login");
          return;
        }
        if (!res.ok) throw new Error("Could not load your profile.");
        const data: MemberProfile = await res.json();
        if (cancelled) return;
        setUser(data);
        setSavedNumber(data.contactNumber || "");
      } catch (e) {
        if (!cancelled) setMessage(e instanceof Error ? e.message : "Could not load your profile.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const handleChange = (field: string, value: string) => {
    setUser((prev) => (prev ? { ...prev, [field]: value } : prev));
    if (field === "contactNumber") {
      setPhoneProof(""); // any edit invalidates a previous verification
      setShowVerify(false);
    }
  };

  const numberChanged = !!user && parseE164(user.contactNumber) !== parseE164(savedNumber);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setMessage("");

    if (numberChanged && !phoneProof) {
      setShowVerify(true);
      setMessage("Verify your new contact number with a code before saving.");
      return;
    }

    setSaving(true);
    try {
      const { fullName, dob, bloodGroup, allergies, contactNumber, emergencyContact, guardianRelation, guardianName, guardianContact, currentAddress } = user;
      const res = await fetch("/api/user/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName, dob, bloodGroup, allergies, emergencyContact, guardianRelation, guardianName, guardianContact, currentAddress,
          ...(numberChanged ? { contactNumber, phoneProof } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setUser((prev) => (prev ? { ...prev, ...data } : prev));
        setSavedNumber(data.contactNumber || "");
        setPhoneProof("");
        setShowVerify(false);
        setMessage("Profile updated successfully!");
      } else {
        if (res.status === 401) router.replace("/login");
        setMessage(data.error || "Failed to update profile.");
      }
    } catch {
      setMessage("An error occurred.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center dark:bg-gray-950"><Loader2 className="w-8 h-8 animate-spin text-red-600" /></div>;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 transition-colors">
      <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 p-4 flex justify-between items-center transition-colors">
        <div className="flex items-center space-x-2">
          <Shield className="w-6 h-6 text-red-600" />
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Sanjivani Member Portal</h1>
        </div>
        <div className="flex items-center space-x-4">
          <ThemeToggle />
          <LogoutButton />
        </div>
      </header>

      <main className="max-w-4xl mx-auto py-8 px-4">
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 p-8 transition-colors">
          
          <div className="flex items-center justify-between mb-8 pb-6 border-b border-gray-100 dark:border-gray-800">
             <div>
               <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Identity Profile</h2>
               <p className="text-gray-500 dark:text-gray-400 mt-1">Manage your PII and emergency details</p>
             </div>
             <div className="text-right">
                <span className="block text-sm text-gray-500 dark:text-gray-400">UII Code (Immutable)</span>
                <span className="inline-block bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white px-3 py-1 rounded font-mono font-bold mt-1">
                  {user?.uii}
                </span>
             </div>
          </div>

          {message && (
             <div className={`mb-6 p-4 rounded-lg text-sm font-medium ${message.includes("success") ? "bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800" : "bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800"}`}>
               {message}
             </div>
          )}

          <div className="mb-8">
            <TwoFactorCard />
          </div>

          <form onSubmit={handleSave} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <h3 className="font-bold text-gray-900 dark:text-white">Personal Info</h3>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Full Name</label>
                  <input required type="text" value={user?.fullName || ""} onChange={e => handleChange("fullName", e.target.value)} className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-red-600" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email</label>
                  <input disabled type="email" value={user?.email || ""} className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-gray-100 dark:bg-gray-800/50 text-gray-500 dark:text-gray-400 outline-none cursor-not-allowed" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">RRU ID Number</label>
                  <input disabled type="text" value={user?.rruIdNumber || ""} className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-gray-100 dark:bg-gray-800/50 text-gray-500 dark:text-gray-400 outline-none cursor-not-allowed" />
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="font-bold text-gray-900 dark:text-white flex items-center"><AlertCircle className="w-4 h-4 mr-2 text-red-500"/> Emergency PII</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Blood Group</label>
                    <input required type="text" value={user?.bloodGroup || ""} onChange={e => handleChange("bloodGroup", e.target.value)} className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-red-600" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Allergies</label>
                    <input type="text" value={user?.allergies || ""} onChange={e => handleChange("allergies", e.target.value)} className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-red-600" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Contact Number</label>
                  <input required type="tel" value={user?.contactNumber || ""} onChange={e => handleChange("contactNumber", e.target.value)} className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-red-600" />
                  <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">This is your sign-in phone (2FA). Changing it requires a code sent to the new number.</p>
                  {numberChanged && phoneProof && <p className="text-xs text-green-600 mt-1">New number verified. Press Save to apply it.</p>}
                  {numberChanged && !phoneProof && !parseE164(user?.contactNumber) && <p className="text-xs text-red-600 mt-1">Enter a valid number such as +91 98765 43210.</p>}
                </div>
                {numberChanged && !phoneProof && showVerify && !!parseE164(user?.contactNumber) && (
                  <div className="p-4 rounded-xl border border-yellow-200 dark:border-yellow-900/50 bg-yellow-50 dark:bg-yellow-900/10">
                    <Msg91WidgetOtp
                      purpose="change-phone"
                      initialPhone={parseE164(user?.contactNumber) ?? ""}
                      lockPhone
                      sendLabel="Send code to new number"
                      verifyLabel="Verify new number"
                      onVerified={({ proof }) => { setPhoneProof(proof); setShowVerify(false); setMessage(""); }}
                    />
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Emergency Contact</label>
                  <input required type="tel" value={user?.emergencyContact || ""} onChange={e => handleChange("emergencyContact", e.target.value)} className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-red-600" />
                </div>
                <div className="bg-gray-50 dark:bg-gray-800/50 p-4 rounded-xl border border-gray-200 dark:border-gray-700 space-y-3 mt-4">
                  <label className="block text-sm font-bold text-gray-700 dark:text-gray-300">Guardian Details</label>
                  <div className="grid grid-cols-3 gap-2">
                    <select value={user?.guardianRelation || ""} onChange={e => handleChange("guardianRelation", e.target.value)} className="col-span-1 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-red-600">
                      <option value="Father">Father</option>
                      <option value="Mother">Mother</option>
                      <option value="Husband">Husband</option>
                      <option value="Wife">Wife</option>
                      <option value="Guardian">Guardian</option>
                    </select>
                    <input required type="text" placeholder="Full Name" value={user?.guardianName || ""} onChange={e => handleChange("guardianName", e.target.value)} className="col-span-2 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-red-600" />
                  </div>
                  <input required type="tel" placeholder="Guardian Contact Number" value={user?.guardianContact || ""} onChange={e => handleChange("guardianContact", e.target.value)} className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-red-600" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Current Address</label>
                  <input required type="text" value={user?.currentAddress || ""} onChange={e => handleChange("currentAddress", e.target.value)} className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-red-600" />
                </div>
              </div>
            </div>
            
            {user?.assets && user.assets.length > 0 && (
              <div className="pt-6 border-t border-gray-200 dark:border-gray-800">
                <h3 className="font-bold text-gray-900 dark:text-white mb-4 flex items-center"><QrCode className="w-5 h-5 mr-2 text-blue-500" /> Registered Assets & QR Codes</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {user.assets.map((asset) => (
                    <div key={asset.id} className="bg-gray-50 dark:bg-gray-800/50 p-4 rounded-xl border border-gray-200 dark:border-gray-700 flex flex-col items-center text-center">
                      <div className="bg-white p-2 rounded-lg shadow-sm border border-gray-200 mb-3">
                        {/* Rendered in the browser: the scan link contains the secret asset ID and must not be sent to a third-party QR service. */}
                        <QRCodeSVG value={`${baseUrl}/scan/${asset.qrReferenceId}`} size={112} level="M" />
                      </div>
                      <h4 className="font-bold text-gray-900 dark:text-white">{asset.assetType}</h4>
                      <p className="text-sm text-gray-700 dark:text-gray-300">{asset.identifier}</p>
                      <p className="text-xs text-gray-500 font-mono mt-1 mb-2 bg-gray-100 dark:bg-gray-900 px-2 py-1 rounded break-all">{asset.qrReferenceId}</p>

                      <div className="flex gap-2 mt-2 w-full justify-center flex-wrap">
                        {[asset.frontPhotoUrl, asset.backPhotoUrl, asset.leftPhotoUrl, asset.rightPhotoUrl, asset.rcPhotoUrl, asset.devicePhotoUrl]
                          .filter((url): url is string => Boolean(url))
                          .map((photoUrl) => (
                            <a href={photoUrl} target="_blank" rel="noopener noreferrer" key={photoUrl} className="block w-12 h-12 rounded overflow-hidden border border-gray-300 flex-shrink-0">
                              <img src={photoUrl} className="w-full h-full object-cover" alt="" />
                            </a>
                          ))}
                      </div>
                      <p className="text-[10px] text-gray-400 mt-3">* Assets are non-editable. Contact C2 Admin to modify.</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            <div className="pt-6 border-t border-gray-200 dark:border-gray-800 flex justify-end">
               <button type="submit" disabled={saving} className="py-2 px-6 bg-red-600 text-white font-bold rounded-lg hover:bg-red-700 transition-colors flex items-center">
                 {saving ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <Save className="w-5 h-5 mr-2" />}
                 Save Changes
               </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}
