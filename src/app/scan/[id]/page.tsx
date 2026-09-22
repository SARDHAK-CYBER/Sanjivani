"use client";
import React, { useState, useEffect } from "react";
import { Camera, MapPin, AlertCircle, PhoneCall, HeartPulse, ShieldAlert, RefreshCw, Activity, Loader2 } from "lucide-react";
import { PhoneOtp } from "@/components/PhoneOtp";
import type { ReleasedEmergencyInfo } from "@/lib/types";

function NativeCamera({ onCapture, label, facingMode = "environment", capturedUrl, onRetake }: { onCapture: (file: File) => void, label: string, facingMode?: string, capturedUrl: string | null, onRetake: () => void }) {
  const handleNativeCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onCapture(file);
  };

  return (
    <div className="space-y-3 bg-gray-50 border border-gray-200 rounded-xl p-4">
      <div className="flex justify-between items-center mb-2">
        <label className="font-bold text-gray-800">{label}</label>
      </div>

      {!capturedUrl ? (
        <label className="w-full py-8 bg-blue-100 text-blue-700 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:bg-blue-200 border border-blue-200">
          <Camera className="w-8 h-8 mb-3" />
          <span className="font-bold">Tap to open Camera</span>
          <span className="text-xs opacity-80 mt-1">Uses native device camera</span>
          <input
            type="file"
            accept="image/*"
            capture={facingMode as "user" | "environment"}
            onChange={handleNativeCapture}
            className="hidden"
          />
        </label>
      ) : (
        <div className="relative rounded-lg overflow-hidden aspect-video border border-gray-300">
          <img src={capturedUrl} className="w-full h-full object-cover" alt="Captured" />
          <button onClick={onRetake} className="absolute bottom-2 right-2 bg-gray-900/80 text-white px-3 py-1.5 rounded-lg text-sm flex items-center backdrop-blur">
            <RefreshCw className="w-4 h-4 mr-1" /> Retake
          </button>
        </div>
      )}
    </div>
  );
}

type Photo = { file: File; url: string };
type Step = "verify" | "capture" | "result";

export default function ScanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: qrReferenceId } = React.use(params);
  const [assetInfo, setAssetInfo] = useState<{ assetType: string, memberInitials: string } | null>(null);
  const [invalidQr, setInvalidQr] = useState(false);

  const [step, setStep] = useState<Step>("verify");
  const [token, setToken] = useState("");
  const [captureToken, setCaptureToken] = useState("");

  const [selfie, setSelfie] = useState<Photo | null>(null);
  const [scenes, setScenes] = useState<Photo[]>([]);
  const [location, setLocation] = useState<{ lat: number, lng: number, accuracy: number } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const [bloodGroup, setBloodGroup] = useState<string | null>(null);
  const [fullPii, setFullPii] = useState<ReleasedEmergencyInfo | null>(null);
  const [incidentId, setIncidentId] = useState("");
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    fetch(`/api/scan/${encodeURIComponent(qrReferenceId)}`)
      .then(async (res) => {
        if (!res.ok) return setInvalidQr(true);
        setAssetInfo(await res.json());
      })
      .catch(() => setInvalidQr(true));
  }, [qrReferenceId]);

  const authHeaders = (t: string) => ({ Authorization: `Bearer ${t}` });

  const requestCaptureToken = async (bystanderToken: string) => {
    const res = await fetch("/api/scan/token", { method: "POST", headers: authHeaders(bystanderToken) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.captureToken) throw new Error(data.error || "Could not start the report. Please try again.");
    setCaptureToken(data.captureToken);
  };

  // Phone verified -> exchange the single-use proof for a bystander session token.
  const handlePhoneVerified = async ({ proof }: { proof: string }) => {
    setError("");
    try {
      const res = await fetch("/api/auth/bystander", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneProof: proof }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.token) return setError(data.error || "Verification failed. Please try again.");

      setToken(data.token);
      await requestCaptureToken(data.token);
      setStep("capture");

      navigator.geolocation?.getCurrentPosition(
        (pos) => setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }),
        () => { /* permission denied or unavailable: the report is still accepted without a location */ }
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
    }
  };

  const addPhoto = (file: File): Photo => ({ file, url: URL.createObjectURL(file) });
  const dropPhoto = (photo: Photo | null) => photo && URL.revokeObjectURL(photo.url);

  const uploadFile = async (file: File): Promise<string> => {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/upload", { method: "POST", body: fd });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.url) throw new Error(data.error || "A photo failed to upload. Check your connection and try again.");
    return data.url;
  };

  const submitReport = async () => {
    setError("");
    if (!selfie) return setError("Please capture your selfie (identity verification).");
    if (scenes.length < 2) return setError("Please capture at least 2 incident scene photos.");

    setSubmitting(true);
    try {
      const selfieUrl = await uploadFile(selfie.file);
      const sceneUrls: string[] = [];
      for (const scene of scenes) sceneUrls.push(await uploadFile(scene.file));

      const res = await fetch("/api/incidents", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders(token) },
        body: JSON.stringify({
          qrReferenceId,
          selfieUrl,
          scenePhotoUrl: sceneUrls[0],
          scenePhotoUrl2: sceneUrls[1],
          scenePhotoUrl3: sceneUrls[2] ?? null,
          scenePhotoUrl4: sceneUrls[3] ?? null,
          latitude: location?.lat,
          longitude: location?.lng,
          accuracy: location?.accuracy,
          captureToken,
        }),
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok && data.success) {
        setBloodGroup(data.memberInfo?.bloodGroup ?? null);
        setIncidentId(data.incidentId);
        setSecondsLeft(data.releaseInSeconds ?? 10);
        setStep("result");
        return;
      }

      setError(data.error || "Could not submit the report. Please try again.");
      // The capture token is single-use and is spent even when the report is rejected: get a fresh one.
      if (res.status !== 429) await requestCaptureToken(token).catch(() => {});
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  // Countdown until the server will release the owner's emergency contacts.
  useEffect(() => {
    if (step !== "result" || secondsLeft <= 0 || blocked || fullPii) return;
    const timer = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [step, secondsLeft, blocked, fullPii]);

  useEffect(() => {
    if (step !== "result" || secondsLeft > 0 || blocked || fullPii || !incidentId) return;
    let cancelled = false;
    let retry: ReturnType<typeof setTimeout> | undefined;

    const attempt = async () => {
      try {
        const res = await fetch(`/api/incidents/${incidentId}/full`, { headers: authHeaders(token) });
        if (cancelled) return;
        if (res.status === 425) {
          const data = await res.json().catch(() => ({}));
          setSecondsLeft(Math.max(Number(data.retryAfter) || 1, 1)); // server clock is the authority
          return;
        }
        if (res.status === 403) return setBlocked(true);
        if (res.ok) return setFullPii(await res.json());
      } catch { /* network blip: retry below */ }
      if (!cancelled) retry = setTimeout(attempt, 3000);
    };
    void attempt();

    return () => { cancelled = true; if (retry) clearTimeout(retry); };
  }, [step, secondsLeft, blocked, fullPii, incidentId, token]);

  if (invalidQr) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
        <div className="max-w-sm text-center">
          <AlertCircle className="w-12 h-12 mx-auto text-red-600 mb-3" />
          <h1 className="text-xl font-bold text-gray-900">This QR code is not valid</h1>
          <p className="text-gray-600 mt-2 text-sm">It may be damaged or no longer registered. If this is an emergency, call 112 now.</p>
          <a href="tel:112" className="mt-4 inline-flex items-center justify-center bg-red-600 text-white font-bold px-6 py-3 rounded-xl"><PhoneCall className="w-4 h-4 mr-2" /> Call 112</a>
        </div>
      </div>
    );
  }
  if (!assetInfo) return <div className="p-8 text-center text-gray-600">Loading...</div>;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center py-12 px-4 sm:px-6">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
        <div className="bg-red-600 p-6 text-center text-white">
          <AlertCircle className="w-12 h-12 mx-auto mb-2 opacity-90" />
          <h2 className="text-xl font-bold">Emergency Response</h2>
          <p className="text-red-100 text-sm opacity-90 mt-1">Sanjivani Asset: {assetInfo.assetType}</p>
          <a href="tel:112" className="mt-3 inline-flex items-center bg-white text-red-700 font-bold text-sm px-4 py-2 rounded-full">
            <PhoneCall className="w-4 h-4 mr-2" /> Call emergency services (112)
          </a>
        </div>

        <div className="p-6 space-y-6">
          {error && (
            <div role="alert" className="p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg text-center">{error}</div>
          )}

          {step === "verify" && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">Verify your mobile number so the owner&apos;s emergency details can be shared with you, and so security can reach you.</p>
              <PhoneOtp purpose="bystander" sendLabel="Send code" verifyLabel="Verify identity" onVerified={handlePhoneVerified} />
            </div>
          )}

          {step === "capture" && (
            <div className="space-y-6">
              <NativeCamera
                label="1. Selfie (Identity Verification)"
                facingMode="user"
                capturedUrl={selfie?.url || null}
                onCapture={(file) => setSelfie(addPhoto(file))}
                onRetake={() => { dropPhoto(selfie); setSelfie(null); }}
              />

              <div className="space-y-3 bg-gray-50 border border-gray-200 rounded-xl p-4">
                <div className="flex justify-between items-center mb-2">
                  <label className="font-bold text-gray-800">2. Incident Scene Photos (Min 2, Max 4)</label>
                  <span className="text-sm font-medium bg-red-100 text-red-700 px-2 py-1 rounded-full">{scenes.length}/4</span>
                </div>

                {scenes.map((scene, index) => (
                  <div key={scene.url} className="relative rounded-lg overflow-hidden aspect-video border border-gray-300 mb-2">
                    <img src={scene.url} className="w-full h-full object-cover" alt={`Scene ${index + 1}`} />
                    <button
                      onClick={() => { dropPhoto(scene); setScenes(scenes.filter((_, i) => i !== index)); }}
                      aria-label={`Remove scene photo ${index + 1}`}
                      className="absolute top-2 right-2 bg-red-600/80 text-white w-8 h-8 rounded-full flex items-center justify-center backdrop-blur"
                    >
                      &times;
                    </button>
                  </div>
                ))}

                {scenes.length < 4 && (
                  <label className="w-full py-6 bg-blue-100 text-blue-700 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:bg-blue-200 border border-blue-200 border-dashed">
                    <Camera className="w-6 h-6 mb-2" />
                    <span className="font-bold">Add Scene Photo</span>
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) setScenes([...scenes, addPhoto(file)]);
                        e.target.value = "";
                      }}
                      className="hidden"
                    />
                  </label>
                )}
                {scenes.length < 2 && (
                  <p className="text-xs text-red-600 text-center mt-2 font-medium flex items-center justify-center">
                    <AlertCircle className="w-3 h-3 mr-1" />
                    Please capture at least {2 - scenes.length} more photo(s)
                  </p>
                )}
              </div>

              {location ? (
                <p className="text-xs text-green-600 flex items-center"><MapPin className="w-3 h-3 mr-1" /> Location captured automatically</p>
              ) : (
                <p className="text-xs text-orange-500 flex items-center"><MapPin className="w-3 h-3 mr-1" /> Waiting for location... (you can still submit without it)</p>
              )}

              <button onClick={submitReport} disabled={submitting} className="w-full bg-red-600 text-white font-bold py-3 rounded-xl hover:bg-red-700 disabled:opacity-50 flex items-center justify-center">
                {submitting ? <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> Sending report...</> : "Submit Emergency Report"}
              </button>
            </div>
          )}

          {step === "result" && (
            <div className="space-y-6">
              <div className="bg-red-50 p-4 rounded-xl border border-red-100">
                <h3 className="font-bold text-red-900 mb-2 flex items-center"><HeartPulse className="w-5 h-5 mr-2 text-red-600" /> Critical Medical Info</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="block text-xs font-bold text-red-700 uppercase">Blood Group</span>
                    <span className="text-red-900 font-bold text-lg">{bloodGroup || "Unknown"}</span>
                  </div>
                  <div>
                    <span className="block text-xs font-bold text-red-700 uppercase">Allergies</span>
                    <span className="text-red-900 font-bold">{fullPii ? (fullPii.allergies || "None") : blocked ? "Withheld" : "Retrieving..."}</span>
                  </div>
                </div>
              </div>

              {blocked ? (
                <div className="bg-gray-100 p-4 rounded-xl border border-gray-300 text-center">
                  <ShieldAlert className="w-8 h-8 mx-auto text-gray-500 mb-2" />
                  <h3 className="font-bold text-gray-800">Information Blocked</h3>
                  <p className="text-sm text-gray-600">Release of full personal information has been blocked by Sanjivani Security. Call 112 for help.</p>
                </div>
              ) : !fullPii ? (
                <div className="bg-yellow-50 p-4 rounded-xl border border-yellow-200 text-center">
                  <h3 className="font-bold text-yellow-800 mb-2">Preparing Full Emergency Info...</h3>
                  <p className="text-sm text-yellow-700">
                    {secondsLeft > 0 ? `Releasing in ${secondsLeft} seconds to allow a security review.` : "Almost ready..."}
                  </p>
                </div>
              ) : (
                <div>
                  <h3 className="font-bold text-gray-900 mb-3 flex items-center"><PhoneCall className="w-5 h-5 mr-2 text-green-600" /> Emergency Contacts</h3>
                  <div className="space-y-3">
                    {fullPii.emergencyContact ? (
                      <a href={`tel:${fullPii.emergencyContact}`} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200 hover:bg-gray-100 transition shadow-sm">
                        <span className="font-medium text-gray-800">Primary Emergency Contact</span>
                        <span className="text-green-600 font-bold bg-green-100 px-3 py-1 rounded-full text-sm flex items-center"><PhoneCall className="w-3 h-3 mr-1" /> Call</span>
                      </a>
                    ) : (
                      <p className="text-sm text-gray-500">No emergency contact listed.</p>
                    )}
                    {fullPii.guardianContact && (
                      <a href={`tel:${fullPii.guardianContact}`} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200 hover:bg-gray-100 transition shadow-sm">
                        <span className="font-medium text-gray-800">{fullPii.guardianRelation}: {fullPii.guardianName}</span>
                        <span className="text-green-600 font-bold bg-green-100 px-3 py-1 rounded-full text-sm flex items-center"><PhoneCall className="w-3 h-3 mr-1" /> Call</span>
                      </a>
                    )}
                  </div>
                </div>
              )}

              <div>
                <h3 className="font-bold text-gray-900 mb-3 flex items-center"><Activity className="w-5 h-5 mr-2 text-orange-500" /> Emergency Tips</h3>
                <div className="bg-orange-50 p-4 rounded-xl border border-orange-100 space-y-4 text-sm text-orange-900">
                  <div>
                    <h4 className="font-bold border-b border-orange-200 pb-1 mb-1">CPR (Cardiopulmonary Resuscitation)</h4>
                    <ul className="list-disc pl-4 space-y-1">
                      <li>Check for breathing and pulse.</li>
                      <li>If none, push hard and fast in the center of the chest (100-120 pushes a minute).</li>
                      <li>Let the chest come back up to its normal position after each push.</li>
                    </ul>
                  </div>
                  <div>
                    <h4 className="font-bold border-b border-orange-200 pb-1 mb-1">Severe Bleeding</h4>
                    <ul className="list-disc pl-4 space-y-1">
                      <li>Apply firm, direct pressure over the wound using a clean cloth.</li>
                      <li>Keep pressing hard until help arrives. Do not remove the cloth.</li>
                    </ul>
                  </div>
                </div>
              </div>

              {location && (
                <div>
                  <h3 className="font-bold text-gray-900 mb-3 flex items-center"><MapPin className="w-5 h-5 mr-2 text-purple-600" /> Nearest Services</h3>
                  <div className="flex gap-2">
                    <a href={`https://www.openstreetmap.org/search?query=hospital+near+${location.lat},${location.lng}`} target="_blank" rel="noopener noreferrer" className="flex-1 bg-purple-600 text-white text-center py-3 rounded-lg font-bold hover:bg-purple-700 shadow-md">Find Hospital</a>
                    <a href={`https://www.openstreetmap.org/search?query=police+near+${location.lat},${location.lng}`} target="_blank" rel="noopener noreferrer" className="flex-1 bg-gray-900 text-white text-center py-3 rounded-lg font-bold hover:bg-gray-800 shadow-md">Find Police</a>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
