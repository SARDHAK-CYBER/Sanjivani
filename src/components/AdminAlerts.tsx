"use client";

import Link from "next/link";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Bell, ShieldAlert, X } from "lucide-react";
import { usePolling } from "@/lib/use-polling";

type Stats = { incidents: number; newIncidents: number };
const AlertsContext = createContext<{ newIncidents: number }>({ newIncidents: 0 });
export const useAdminAlerts = () => useContext(AlertsContext);

const POLL_MS = 4000;
const BASE_TITLE = "Sanjivani Emergency Response";

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

/**
 * Watches the incident counters from every admin page, so a new report is noticed wherever the admin
 * happens to be: an on-screen alert, a sound, a desktop notification (if allowed), the sidebar badge and
 * the browser-tab title.
 */
export function AdminAlertsProvider({ children }: { children: React.ReactNode }) {
  const [stats, setStats] = useState<Stats>({ incidents: 0, newIncidents: 0 });
  const [fresh, setFresh] = useState(0); // arrivals since the admin last dismissed the alert
  const [canAskPermission, setCanAskPermission] = useState(false);
  const lastTotal = useRef<number | null>(null);

  const poll = useCallback(async () => {
    const res = await fetch("/api/admin/stats").catch(() => null);
    if (!res?.ok) return;
    const data: Stats & { members: number; assets: number } = await res.json();
    setStats({ incidents: data.incidents, newIncidents: data.newIncidents });
    setCanAskPermission(typeof Notification !== "undefined" && Notification.permission === "default");

    if (lastTotal.current !== null && data.incidents > lastTotal.current) {
      const arrived = data.incidents - lastTotal.current;
      // Already looking at the incident list: the arrival is visible, no alert needed.
      if (!window.location.pathname.startsWith("/admin/incidents")) setFresh((n) => n + arrived);
      beep();
      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        new Notification("Emergency incident reported", { body: `${arrived} new incident${arrived > 1 ? "s" : ""} on the C2 dashboard.` });
      }
    }
    lastTotal.current = data.incidents;
  }, []);

  usePolling(poll, POLL_MS);

  useEffect(() => {
    document.title = stats.newIncidents > 0 ? `(${stats.newIncidents}) ${BASE_TITLE}` : BASE_TITLE;
  }, [stats.newIncidents]);

  return (
    <AlertsContext.Provider value={{ newIncidents: stats.newIncidents }}>
      {fresh > 0 && (
        <div role="alert" className="fixed top-4 right-4 z-50 flex items-center gap-3 bg-red-600 text-white px-4 py-3 rounded-lg shadow-lg max-w-sm">
          <ShieldAlert className="w-5 h-5 shrink-0 animate-pulse" />
          <Link href="/admin/incidents" className="font-bold underline-offset-2 hover:underline">
            EMERGENCY: {fresh} new incident{fresh > 1 ? "s" : ""} reported
          </Link>
          <button onClick={() => setFresh(0)} aria-label="Dismiss" className="ml-1"><X className="w-4 h-4" /></button>
        </div>
      )}
      {canAskPermission && (
        <button
          onClick={() => Notification.requestPermission().then((p) => setCanAskPermission(p === "default"))}
          className="fixed bottom-4 right-4 z-40 inline-flex items-center gap-2 bg-gray-900 text-white text-xs font-medium px-3 py-2 rounded-full shadow-lg hover:bg-gray-800"
        >
          <Bell className="w-3 h-3" /> Enable desktop alerts
        </button>
      )}
      {children}
    </AlertsContext.Provider>
  );
}

export function IncidentsNavLink() {
  const { newIncidents } = useAdminAlerts();
  return (
    <Link
      href="/admin/incidents"
      className="flex items-center px-4 py-3 text-sm font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/10 hover:bg-red-100 dark:hover:bg-red-900/20 rounded-lg transition-colors border border-red-100 dark:border-red-900/30"
    >
      <ShieldAlert className={`w-5 h-5 mr-3 ${newIncidents > 0 ? "animate-pulse" : ""}`} />
      Incidents
      {newIncidents > 0 && <span className="ml-auto bg-red-600 text-white text-xs font-bold rounded-full px-2 py-0.5">{newIncidents}</span>}
    </Link>
  );
}
