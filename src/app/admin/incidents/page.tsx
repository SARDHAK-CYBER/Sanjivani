"use client";
import { useState, useEffect } from "react";
import { Loader2, ShieldAlert, MapPin, CheckCircle, Clock } from "lucide-react";
import { PII_RELEASE_DELAY_SECONDS } from "@/lib/constants";

type Incident = {
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
    user: {
      fullName: string;
      uii: string;
      email: string;
    }
  };
  bystander: {
    mobileNumber: string;
  }
};

// After this long the bystander may already have been shown the owner's emergency details (see PII_RELEASE_DELAY_SECONDS).
const REVIEW_WINDOW_MS = PII_RELEASE_DELAY_SECONDS * 1000;

export default function IncidentsPage() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);

  const [now, setNow] = useState(() => Date.now());
  const [actionError, setActionError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const res = await fetch("/api/admin/incidents").catch(() => null);
      if (cancelled) return;
      if (res?.ok) setIncidents(await res.json());
      setLoading(false);
    }
    void load();
    const poll = setInterval(load, 5000); // refresh the list every 5 seconds
    const clock = setInterval(() => setNow(Date.now()), 1000); // drives the review-window countdown
    return () => {
      cancelled = true;
      clearInterval(poll);
      clearInterval(clock);
    };
  }, []);

  const updateStatus = async (id: string, newStatus: string) => {
    const res = await fetch("/api/admin/incidents", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status: newStatus })
    });
    if (res.ok) {
      setIncidents(prev => prev.map(inc => inc.id === id ? { ...inc, status: newStatus } : inc));
    } else {
      setActionError("Could not update the incident. Please try again.");
    }
  };

  const blockIncident = async (id: string) => {
    const res = await fetch(`/api/admin/incidents/${id}/block`, {
      method: "POST"
    });
    if (res.ok) {
      setIncidents(prev => prev.map(inc => inc.id === id ? { ...inc, status: "BLOCKED" } : inc));
    } else {
      setActionError("Could not block the release. Please try again.");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center">
          <ShieldAlert className="w-6 h-6 mr-2 text-red-600" /> Emergency Incidents Dashboard
        </h1>
      </div>

      {actionError && (
        <div role="alert" className="p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-sm rounded-lg">{actionError}</div>
      )}

      <div className="grid grid-cols-1 gap-6">
        {loading ? (
          <div className="flex justify-center p-12">
            <Loader2 className="w-8 h-8 animate-spin text-red-600" />
          </div>
        ) : incidents.length === 0 ? (
          <div className="bg-white dark:bg-gray-900 p-8 rounded-xl shadow-sm text-center text-gray-500 border border-gray-100 dark:border-gray-800">
            No emergency incidents reported.
          </div>
        ) : (
          incidents.map((incident) => (
            <div key={incident.id} className={`bg-white dark:bg-gray-900 p-6 rounded-xl shadow-sm border-2 ${incident.status === 'NEW' ? 'border-red-500' : incident.status === 'IN_PROGRESS' ? 'border-orange-500' : 'border-green-500 dark:border-green-800 border-gray-100 dark:border-gray-800'}`}>
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
                <div>
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                    Incident for: {incident.asset?.assetType} ({incident.asset?.identifier})
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    Reported on: {new Date(incident.createdAt).toLocaleString()}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                    incident.status === 'NEW' ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' : 
                    incident.status === 'IN_PROGRESS' ? 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400' : 
                    incident.status === 'BLOCKED' ? 'bg-gray-800 text-white dark:bg-gray-700' :
                    'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                  }`}>
                    {incident.status}
                  </span>
                  
                  {incident.status === 'NEW' && now - new Date(incident.createdAt).getTime() < REVIEW_WINDOW_MS && (
                    <span className="animate-pulse px-3 py-1 bg-yellow-400 text-yellow-900 text-xs font-bold rounded-full">
                      Review Needed (Under {PII_RELEASE_DELAY_SECONDS}s)
                    </span>
                  )}
                  {incident.status === 'NEW' && (
                    <>
                      {now - new Date(incident.createdAt).getTime() < REVIEW_WINDOW_MS && (
                        <button onClick={() => blockIncident(incident.id)} className="px-3 py-1 bg-black text-white text-xs font-bold rounded-lg hover:bg-gray-800 transition flex items-center">
                          <ShieldAlert className="w-3 h-3 mr-1" /> Block Release
                        </button>
                      )}
                      <button onClick={() => updateStatus(incident.id, 'IN_PROGRESS')} className="px-3 py-1 bg-orange-500 text-white text-xs font-bold rounded-lg hover:bg-orange-600 transition flex items-center">
                        <Clock className="w-3 h-3 mr-1" /> Mark In-Progress
                      </button>
                    </>
                  )}
                  {incident.status !== 'RESOLVED' && (
                    <button onClick={() => updateStatus(incident.id, 'RESOLVED')} className="px-3 py-1 bg-green-600 text-white text-xs font-bold rounded-lg hover:bg-green-700 transition flex items-center">
                      <CheckCircle className="w-3 h-3 mr-1" /> Resolve
                    </button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                
                {/* Reporter / Bystander Details */}
                <div className="bg-gray-50 dark:bg-gray-800/50 p-4 rounded-xl border border-gray-200 dark:border-gray-700">
                  <h4 className="font-bold text-gray-900 dark:text-white mb-2 text-sm">Bystander / Reporter</h4>
                  <p className="text-sm"><span className="text-gray-500 w-20 inline-block">Mobile:</span> <span className="font-medium text-gray-900 dark:text-white">{incident.bystander?.mobileNumber}</span></p>
                  <p className="text-sm"><span className="text-gray-500 w-20 inline-block">IP:</span> <span className="font-mono text-xs bg-gray-200 dark:bg-gray-700 px-1 rounded">{incident.ipAddress}</span></p>
                  {incident.latitude && incident.longitude && (
                    <a href={`https://www.google.com/maps/search/?api=1&query=${incident.latitude},${incident.longitude}`} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center text-xs font-bold text-blue-600 bg-blue-50 dark:bg-blue-900/20 px-3 py-1 rounded-full border border-blue-200 dark:border-blue-800 hover:underline">
                      <MapPin className="w-3 h-3 mr-1" /> View on Map
                    </a>
                  )}
                </div>

                {/* Victim / Owner Details */}
                <div className="bg-gray-50 dark:bg-gray-800/50 p-4 rounded-xl border border-gray-200 dark:border-gray-700">
                  <h4 className="font-bold text-gray-900 dark:text-white mb-2 text-sm">Asset Owner</h4>
                  <p className="text-sm"><span className="text-gray-500 w-20 inline-block">Name:</span> <span className="font-medium text-gray-900 dark:text-white">{incident.asset?.user?.fullName}</span></p>
                  <p className="text-sm"><span className="text-gray-500 w-20 inline-block">UII:</span> <span className="font-medium text-gray-900 dark:text-white font-mono">{incident.asset?.user?.uii}</span></p>
                  <p className="text-sm mt-2 flex items-center justify-between">
                    <span><span className="text-gray-500 w-20 inline-block">Contact:</span> <span className="font-medium text-gray-900 dark:text-white">{incident.ownerContact}</span></span>
                    <a href={`tel:${incident.ownerContact}`} className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded hover:bg-green-200 font-bold dark:bg-green-900 dark:text-green-300">Call</a>
                  </p>
                </div>

                {/* Evidence Photos */}
                <div className="col-span-1 md:col-span-2 lg:col-span-1 bg-gray-50 dark:bg-gray-800/50 p-4 rounded-xl border border-gray-200 dark:border-gray-700">
                  <h4 className="font-bold text-gray-900 dark:text-white mb-2 text-sm">Evidence Photos</h4>
                  <div className="flex gap-2">
                    {incident.selfieUrl ? (
                      <a href={incident.selfieUrl} target="_blank" className="relative w-16 h-16 bg-gray-200 rounded-lg overflow-hidden border border-gray-300 block hover:opacity-80 flex-shrink-0">
                         <img src={incident.selfieUrl} className="w-full h-full object-cover" alt="Selfie of the reporter" />
                         <span className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[10px] text-center">Selfie</span>
                      </a>
                    ) : (
                      <div className="w-16 h-16 bg-gray-200 rounded-lg flex items-center justify-center text-[10px] text-gray-500 flex-shrink-0">No Selfie</div>
                    )}
                    
                    {[incident.scenePhotoUrl, incident.scenePhotoUrl2, incident.scenePhotoUrl3, incident.scenePhotoUrl4].filter(Boolean).map((url, i) => (
                      <a key={i} href={url!} target="_blank" className="relative w-16 h-16 bg-gray-200 rounded-lg overflow-hidden border border-gray-300 block hover:opacity-80 flex-shrink-0">
                         <img src={url!} className="w-full h-full object-cover" alt={`Scene photo ${i + 1}`} />
                         <span className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[10px] text-center">Scene {i+1}</span>
                      </a>
                    ))}
                    
                    {!incident.scenePhotoUrl && (
                      <div className="w-16 h-16 bg-gray-200 rounded-lg flex items-center justify-center text-[10px] text-gray-500 flex-shrink-0">No Scene</div>
                    )}
                  </div>
                </div>

              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
