"use client";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Users, Car, AlertTriangle, ExternalLink, MapPin, Smartphone, Network } from "lucide-react";
import type { AdminIncident } from "@/lib/types";

// A short synthesised tone; no audio file needed (browsers may block it until the page has been clicked).
function beep() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 880;
    gain.gain.value = 0.15;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.4);
  } catch {
    /* audio unavailable */
  }
}

export default function AdminDashboard() {
  const router = useRouter();
  const [incidents, setIncidents] = useState<AdminIncident[]>([]);
  const [stats, setStats] = useState({ members: 0, assets: 0, incidents: 0 });
  const [newIncidents, setNewIncidents] = useState(0);
  const seenIncidentIds = useRef<Set<string> | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [incidentsRes, statsRes] = await Promise.all([fetch("/api/admin/incidents"), fetch("/api/admin/stats")]);
        if (cancelled) return;
        if (incidentsRes.status === 401 || incidentsRes.status === 403) {
          router.replace("/login");
          return;
        }

        if (incidentsRes.ok) {
          const data: AdminIncident[] = await incidentsRes.json();
          setIncidents(data);

          // Compare by id (not by count) so the very first incident, and bursts, are noticed too.
          if (seenIncidentIds.current) {
            const fresh = data.filter((inc) => !seenIncidentIds.current!.has(inc.id));
            if (fresh.length > 0) {
              setNewIncidents((n) => n + fresh.length);
              beep();
            }
          }
          seenIncidentIds.current = new Set(data.map((inc) => inc.id));
        }
        if (statsRes.ok) setStats(await statsRes.json());
      } catch {
        console.error("Failed to fetch dashboard data");
      }
    }

    void load();
    const interval = setInterval(load, 5000); // Poll every 5s
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [router]);

  return (
    <div className="space-y-6 animate-in fade-in transition-colors">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Dashboard Overview</h1>

      {newIncidents > 0 && (
        <div role="alert" className="flex items-center justify-between bg-red-600 text-white px-4 py-3 rounded-lg shadow">
          <span className="font-bold">EMERGENCY ALERT: {newIncidents} new incident{newIncidents > 1 ? "s" : ""} reported</span>
          <button onClick={() => setNewIncidents(0)} className="text-sm underline">Dismiss</button>
        </div>
      )}
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white dark:bg-gray-900 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 flex items-center transition-colors">
          <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-full mr-4"><Users className="w-6 h-6 text-blue-600 dark:text-blue-400" /></div>
          <div><p className="text-sm font-medium text-gray-500 dark:text-gray-400">Total Members</p><p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.members}</p></div>
        </div>
        <div className="bg-white dark:bg-gray-900 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 flex items-center transition-colors">
          <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-full mr-4"><Car className="w-6 h-6 text-green-600 dark:text-green-400" /></div>
          <div><p className="text-sm font-medium text-gray-500 dark:text-gray-400">Registered Assets</p><p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.assets}</p></div>
        </div>
        <div className="bg-white dark:bg-gray-900 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 flex items-center transition-colors">
          <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-full mr-4"><AlertTriangle className="w-6 h-6 text-red-600 dark:text-red-400" /></div>
          <div><p className="text-sm font-medium text-gray-500 dark:text-gray-400">Total Incidents</p><p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.incidents}</p></div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden transition-colors">
        <div className="p-6 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">Live Incident Feed</h2>
          <div className="flex items-center text-xs text-green-600 dark:text-green-400 font-medium bg-green-50 dark:bg-green-900/20 px-3 py-1 rounded-full">
            <span className="w-2 h-2 bg-green-500 dark:bg-green-400 rounded-full mr-2 animate-pulse"></span> Live
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
            <thead className="bg-gray-50 dark:bg-gray-800/50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Asset (Owner)</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Reporter (Mobile)</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Evidence & Location</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Device Data</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Time</th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-800">
              {incidents.map((inc) => {
                let parsedDevice: { userAgent?: string } | null = null;
                try {
                  parsedDevice = inc.deviceFingerprint ? JSON.parse(inc.deviceFingerprint) : null;
                } catch {}
                
                return (
                  <tr key={inc.id} className={inc.status === 'NEW' ? 'bg-red-50/50 dark:bg-red-900/10' : ''}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${inc.status === 'NEW' ? 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300' : 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300'}`}>
                        {inc.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <p className="text-sm font-bold text-gray-900 dark:text-white">{inc.asset?.identifier}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{inc.asset?.user?.fullName}</p>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                       <p className="text-sm text-gray-900 dark:text-white font-medium">{inc.bystander?.mobileNumber}</p>
                       {inc.bystander?.verified && <span className="text-xs text-green-600 bg-green-100 dark:bg-green-900/30 px-2 py-0.5 rounded">Verified SMS</span>}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <div className="flex flex-col space-y-1">
                        {inc.selfieUrl && <a href={inc.selfieUrl} target="_blank" className="text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center">Selfie Photo <ExternalLink className="w-3 h-3 ml-1"/></a>}
                        {inc.scenePhotoUrl && <a href={inc.scenePhotoUrl} target="_blank" className="text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center">Scene 1 <ExternalLink className="w-3 h-3 ml-1"/></a>}
                        {inc.scenePhotoUrl2 && <a href={inc.scenePhotoUrl2} target="_blank" className="text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center">Scene 2 <ExternalLink className="w-3 h-3 ml-1"/></a>}
                        {inc.scenePhotoUrl3 && <a href={inc.scenePhotoUrl3} target="_blank" className="text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center">Scene 3 <ExternalLink className="w-3 h-3 ml-1"/></a>}
                        {inc.scenePhotoUrl4 && <a href={inc.scenePhotoUrl4} target="_blank" className="text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center">Scene 4 <ExternalLink className="w-3 h-3 ml-1"/></a>}
                        {inc.latitude && inc.longitude && (
                          <a href={`https://www.openstreetmap.org/?mlat=${inc.latitude}&mlon=${inc.longitude}#map=16/${inc.latitude}/${inc.longitude}`} target="_blank" className="text-purple-600 dark:text-purple-400 hover:underline inline-flex items-center mt-1">
                            <MapPin className="w-3 h-3 mr-1" /> GeoID: {inc.latitude.toFixed(4)}, {inc.longitude.toFixed(4)}
                          </a>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-xs text-gray-500 dark:text-gray-400 space-y-1">
                      <div className="flex items-start">
                        <Network className="w-3 h-3 mr-1 mt-0.5 flex-shrink-0" /> 
                        <span className="font-mono">IP: {inc.ipAddress || "Unknown"}</span>
                      </div>
                      <div className="flex items-start max-w-[200px]" title={parsedDevice?.userAgent || inc.deviceFingerprint || undefined}>
                        <Smartphone className="w-3 h-3 mr-1 mt-0.5 flex-shrink-0" /> 
                        <span className="truncate">{parsedDevice?.userAgent || inc.deviceFingerprint || "Unknown Device"}</span>
                      </div>
                      <div className="text-[10px] text-gray-400 bg-gray-50 dark:bg-gray-800 p-1 rounded border border-gray-100 dark:border-gray-700">
                        <p>MAC: <span className="text-red-400" title="Web browsers cannot access MAC Address">Requires Native App</span></p>
                        <p>IMEI: <span className="text-red-400" title="Web browsers cannot access IMEI">Requires Native App</span></p>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{new Date(inc.createdAt).toLocaleString()}</td>
                  </tr>
                );
              })}
              {incidents.length === 0 && (
                <tr><td colSpan={6} className="px-6 py-8 text-center text-gray-500 dark:text-gray-400">No incidents reported yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
