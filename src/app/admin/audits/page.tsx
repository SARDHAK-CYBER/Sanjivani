"use client";
import { Fragment, useCallback, useState } from "react";
import { ChevronDown, ChevronRight, ShieldAlert, Siren } from "lucide-react";
import { usePolling } from "@/lib/use-polling";
import type { AuditLogEntry } from "@/lib/types";

type Category = "security" | "incident";

const TABS: { id: Category; label: string; blurb: string; Icon: typeof ShieldAlert }[] = [
  { id: "security", label: "Security & account events", blurb: "Sign-ins, profile and asset changes, password resets and admin access to member records", Icon: ShieldAlert },
  { id: "incident", label: "Incident events", blurb: "Bystander reports, emergency-detail releases and incident status changes", Icon: Siren },
];

const FIELD_LABELS: Record<string, string> = {
  fullName: "Full name",
  dob: "Date of birth",
  bloodGroup: "Blood group",
  allergies: "Allergies",
  contactNumber: "Contact number",
  emergencyContact: "Emergency contact",
  guardianRelation: "Guardian relation",
  guardianName: "Guardian name",
  guardianContact: "Guardian contact",
  currentAddress: "Current address",
  assetType: "Asset type",
  identifier: "Identifier",
  frontPhotoUrl: "Front photo",
  backPhotoUrl: "Back photo",
  leftPhotoUrl: "Left photo",
  rightPhotoUrl: "Right photo",
  rcPhotoUrl: "RC book / card photo",
  devicePhotoUrl: "Device photo",
};

const show = (value: unknown) => (value === null || value === undefined || value === "" ? "(empty)" : String(value));

export default function AuditLogsPage() {
  const [category, setCategory] = useState<Category>("security");
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/admin/audits?category=${category}`).catch(() => null);
    if (res?.ok) {
      const data = await res.json();
      setLogs(Array.isArray(data) ? data : []);
    }
  }, [category]);

  usePolling(load, 6000);

  const tab = TABS.find((t) => t.id === category)!;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center">
          <ShieldAlert className="w-6 h-6 mr-2 text-red-600" /> Audit Logs
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{tab.blurb}. Updates automatically.</p>
      </div>

      <div className="flex gap-2 border-b border-gray-200 dark:border-gray-800">
        {TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => { setCategory(id); setLogs([]); setOpen(null); }}
            className={`inline-flex items-center px-4 py-2 text-sm font-medium -mb-px border-b-2 transition-colors ${category === id ? "border-red-600 text-red-600" : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"}`}
          >
            <Icon className="w-4 h-4 mr-2" /> {label}
          </button>
        ))}
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-x-auto transition-colors">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
          <thead className="bg-gray-50 dark:bg-gray-800/50">
            <tr>
              {["Timestamp", "User (UII)", "Action event", "GeoID (IP)", "Details / device"].map((h) => (
                <th key={h} className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-800">
            {logs.map((log) => {
              const changes = log.changes ? Object.entries(log.changes) : [];
              const expanded = open === log.id;
              return (
                <Fragment key={log.id}>
                  <tr className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{new Date(log.createdAt).toLocaleString()}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <p className="text-sm font-bold text-gray-900 dark:text-white">{log.user?.fullName}</p>
                      <p className="text-xs font-mono text-gray-500 dark:text-gray-400">{log.user?.uii}</p>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <span className="bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400 px-2 py-1 rounded text-xs">{log.action}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-500 dark:text-gray-400">{log.geoId}</td>
                    <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400 max-w-sm break-words" title={log.deviceFingerprint ?? undefined}>
                      {log.deviceFingerprint}
                      {changes.length > 0 && (
                        <button onClick={() => setOpen(expanded ? null : log.id)} className="mt-1 flex items-center text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline">
                          {expanded ? <ChevronDown className="w-3 h-3 mr-1" /> : <ChevronRight className="w-3 h-3 mr-1" />}
                          {expanded ? "Hide" : "Review"} {changes.length} change{changes.length > 1 ? "s" : ""}
                        </button>
                      )}
                    </td>
                  </tr>
                  {expanded && (
                    <tr className="bg-blue-50/40 dark:bg-blue-900/10">
                      <td colSpan={5} className="px-6 py-4">
                        <table className="min-w-full text-sm">
                          <thead>
                            <tr className="text-left text-xs uppercase text-gray-500 dark:text-gray-400">
                              <th className="pr-6 py-1 font-medium">Field</th>
                              <th className="pr-6 py-1 font-medium">Before</th>
                              <th className="py-1 font-medium">After</th>
                            </tr>
                          </thead>
                          <tbody>
                            {changes.map(([field, { from, to }]) => (
                              <tr key={field} className="border-t border-blue-100 dark:border-blue-900/30">
                                <td className="pr-6 py-2 font-medium text-gray-900 dark:text-white whitespace-nowrap">{FIELD_LABELS[field] ?? field}</td>
                                <td className="pr-6 py-2 text-red-700 dark:text-red-400 break-all">{show(from)}</td>
                                <td className="py-2 text-green-700 dark:text-green-400 break-all">{show(to)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {logs.length === 0 && (
              <tr><td colSpan={5} className="px-6 py-8 text-center text-gray-500 dark:text-gray-400">No events logged yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
