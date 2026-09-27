"use client";
import { useCallback, useState } from "react";
import { Check, Copy, KeyRound, Loader2, Pencil, ShieldCheck, ShieldOff, UserMinus, UserPlus, X } from "lucide-react";
import { usePolling } from "@/lib/use-polling";

type Admin = {
  id: string;
  uii: string | null;
  fullName: string | null;
  email: string;
  phoneHint: string | null;
  twoFactor: boolean;
  isPrimary: boolean;
  createdAt: string;
  lastSignIn: string | null;
};

type Notice = { kind: "ok" | "error"; text: string; secret?: { label: string; value: string } };

const input = "w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-red-500";
const label = "block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1";
const th = "px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider";

async function call(url: string, method: string, body: unknown) {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
  const data = res ? await res.json().catch(() => ({})) : {};
  return { ok: Boolean(res?.ok), data: data as Record<string, unknown> };
}

export default function AdminsPage() {
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [isPrimary, setIsPrimary] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const [mode, setMode] = useState<"closed" | "new" | "promote">("closed");
  const [form, setForm] = useState({ fullName: "", email: "", phone: "", password: "" });
  const [promoteEmail, setPromoteEmail] = useState("");

  const [editing, setEditing] = useState<Admin | null>(null);
  const [edit, setEdit] = useState({ fullName: "", email: "", phone: "" });

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/admins").catch(() => null);
    if (!res?.ok) return;
    const data = await res.json();
    setAdmins(data.admins ?? []);
    setViewerId(data.viewerId ?? null);
    setIsPrimary(Boolean(data.viewerIsPrimary));
    setLoaded(true);
  }, []);
  usePolling(load, 15000);

  const fail = (data: Record<string, unknown>) => setNotice({ kind: "error", text: typeof data.error === "string" ? data.error : "Something went wrong. Please try again." });

  const submitNew = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy("create");
    const { ok, data } = await call("/api/admin/admins", "POST", form);
    setBusy(null);
    if (!ok) return fail(data);
    setNotice({
      kind: "ok",
      text: `${form.email} is now an administrator. On first sign-in they confirm a code texted to their phone and set up their authenticator app.`,
      secret: typeof data.temporaryPassword === "string" ? { label: "Temporary password (shown once)", value: data.temporaryPassword } : undefined,
    });
    setForm({ fullName: "", email: "", phone: "", password: "" });
    setMode("closed");
    void load();
  };

  const submitPromote = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy("promote");
    const { ok, data } = await call("/api/admin/admins", "POST", { promoteEmail });
    setBusy(null);
    if (!ok) return fail(data);
    setNotice({ kind: "ok", text: `${promoteEmail} is now an administrator. They sign in with their existing password and set up an authenticator app if they have none.` });
    setPromoteEmail("");
    setMode("closed");
    void load();
  };

  const startEdit = (admin: Admin) => {
    setEditing(admin);
    setEdit({ fullName: admin.fullName ?? "", email: admin.email, phone: "" });
  };

  const submitEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    setBusy("edit");
    const { ok, data } = await call(`/api/admin/admins/${editing.id}`, "PATCH", edit);
    setBusy(null);
    if (!ok) return fail(data);
    setNotice({ kind: "ok", text: `Saved changes to ${edit.fullName || editing.email}.` });
    setEditing(null);
    void load();
  };

  const act = async (admin: Admin, action: "reset_password" | "reset_2fa" | "demote") => {
    const name = admin.fullName || admin.email;
    const prompts = {
      reset_password: `Reset the password for ${name}? They are signed out everywhere and get a new temporary password, and their next sign-in also needs a texted code.`,
      reset_2fa: `Remove the authenticator app for ${name}? They are signed out and must set up a new one at their next sign-in (confirmed by a texted code).`,
      demote: `Remove administrator access from ${name}? They are signed out and become a staff member. Their history is kept.`,
    } as const;
    if (!window.confirm(prompts[action])) return;
    setBusy(`${action}:${admin.id}`);
    const { ok, data } = await call(`/api/admin/admins/${admin.id}`, "POST", { action });
    setBusy(null);
    if (!ok) return fail(data);
    setNotice({
      kind: "ok",
      text: action === "reset_password" ? `Password reset for ${name}. Share the temporary password with them privately.` : action === "reset_2fa" ? `Authenticator removed for ${name}.` : `${name} is no longer an administrator.`,
      secret: typeof data.temporaryPassword === "string" ? { label: "Temporary password (shown once)", value: data.temporaryPassword } : undefined,
    });
    void load();
  };

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked: the value is on screen to copy by hand */
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-3 justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center">
            <ShieldCheck className="w-6 h-6 mr-2 text-red-600" /> Administrators
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {isPrimary ? "You are the primary administrator: you can add, edit and remove administrators." : "Only the primary administrator can add, edit or remove administrators."}
          </p>
        </div>
        {isPrimary && (
          <div className="flex gap-2">
            <button onClick={() => setMode(mode === "new" ? "closed" : "new")} className="bg-red-600 text-white px-4 py-2 rounded-lg flex items-center hover:bg-red-700 transition text-sm">
              <UserPlus className="w-4 h-4 mr-2" /> Add administrator
            </button>
            <button onClick={() => setMode(mode === "promote" ? "closed" : "promote")} className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition text-sm">
              Promote a member
            </button>
          </div>
        )}
      </div>

      {notice && (
        <div role="status" className={`rounded-lg border px-4 py-3 text-sm flex items-start gap-3 ${notice.kind === "ok" ? "bg-green-50 border-green-200 text-green-900 dark:bg-green-900/20 dark:border-green-900 dark:text-green-200" : "bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-900 dark:text-red-200"}`}>
          <div className="flex-1 min-w-0">
            <p>{notice.text}</p>
            {notice.secret && (
              <div className="mt-2">
                <p className="text-xs opacity-80">{notice.secret.label}</p>
                <div className="mt-1 flex items-center gap-2">
                  <code className="px-2 py-1 rounded bg-white/70 dark:bg-black/30 font-mono text-sm break-all select-all">{notice.secret.value}</code>
                  <button onClick={() => copy(notice.secret!.value)} className="inline-flex items-center text-xs font-medium underline">
                    {copied ? <Check className="w-3.5 h-3.5 mr-1" /> : <Copy className="w-3.5 h-3.5 mr-1" />}
                    {copied ? "Copied" : "Copy"}
                  </button>
                </div>
              </div>
            )}
          </div>
          <button onClick={() => setNotice(null)} aria-label="Dismiss" className="shrink-0"><X className="w-4 h-4" /></button>
        </div>
      )}

      {isPrimary && mode === "new" && (
        <form onSubmit={submitNew} className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 p-4 sm:p-6 space-y-4">
          <h2 className="font-semibold text-gray-900 dark:text-white">New administrator</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div><label className={label}>Full name</label><input className={input} required value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} /></div>
            <div><label className={label}>Email</label><input className={input} type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            <div><label className={label}>Phone (receives the sign-in setup code)</label><input className={input} type="tel" required placeholder="+91XXXXXXXXXX" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
            <div><label className={label}>Password (leave blank to generate one)</label><input className={input} type="text" autoComplete="off" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></div>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400">At first sign-in the new administrator confirms a code sent to this phone and sets up their own authenticator app, so you never see their authenticator key or recovery codes.</p>
          <button disabled={busy === "create"} className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 disabled:opacity-60 flex items-center text-sm">
            {busy === "create" && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Create administrator
          </button>
        </form>
      )}

      {isPrimary && mode === "promote" && (
        <form onSubmit={submitPromote} className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 p-4 sm:p-6 space-y-4">
          <h2 className="font-semibold text-gray-900 dark:text-white">Promote an existing member</h2>
          <div><label className={label}>Member&apos;s email</label><input className={input} type="email" required value={promoteEmail} onChange={(e) => setPromoteEmail(e.target.value)} /></div>
          <button disabled={busy === "promote"} className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 disabled:opacity-60 flex items-center text-sm">
            {busy === "promote" && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Make administrator
          </button>
        </form>
      )}

      {isPrimary && editing && (
        <form onSubmit={submitEdit} className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-blue-200 dark:border-blue-900 p-4 sm:p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-gray-900 dark:text-white">Edit {editing.fullName || editing.email}</h2>
            <button type="button" onClick={() => setEditing(null)} aria-label="Cancel"><X className="w-4 h-4 text-gray-500" /></button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div><label className={label}>Full name</label><input className={input} required value={edit.fullName} onChange={(e) => setEdit({ ...edit, fullName: e.target.value })} /></div>
            <div><label className={label}>Email</label><input className={input} type="email" required value={edit.email} onChange={(e) => setEdit({ ...edit, email: e.target.value })} /></div>
            <div><label className={label}>New phone (current: {editing.phoneHint ?? "none"}; leave blank to keep)</label><input className={input} type="tel" placeholder="+91XXXXXXXXXX" value={edit.phone} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} /></div>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400">Every change is written to the audit log with its before and after values.</p>
          <button disabled={busy === "edit"} className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-60 flex items-center text-sm">
            {busy === "edit" && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Save changes
          </button>
        </form>
      )}

      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-x-auto transition-colors">
        <table className="stack-table min-w-full divide-y divide-gray-200 dark:divide-gray-800">
          <thead className="bg-gray-50 dark:bg-gray-800/50">
            <tr>
              {["Administrator", "Email", "Phone", "Authenticator", "Last sign-in"].map((h) => <th key={h} className={th}>{h}</th>)}
              {isPrimary && <th className={`${th} text-right`}>Actions</th>}
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-800">
            {admins.map((a) => {
              const own = a.id === viewerId;
              const locked = a.isPrimary;
              return (
                <tr key={a.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition">
                  <td data-label="Admin" className="px-6 py-4 text-sm">
                    <p className="font-bold text-gray-900 dark:text-white">
                      {a.fullName || "(no name)"}
                      {a.isPrimary && <span className="ml-2 px-2 py-0.5 rounded-full text-[10px] bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 align-middle">PRIMARY</span>}
                      {own && !a.isPrimary && <span className="ml-2 text-xs font-normal text-gray-500">(you)</span>}
                    </p>
                    <p className="text-xs font-mono text-gray-500 dark:text-gray-400">{a.uii}</p>
                  </td>
                  <td data-label="Email" className="px-6 py-4 text-sm text-gray-600 dark:text-gray-300 break-all">{a.email}</td>
                  <td data-label="Phone" className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-600 dark:text-gray-300">{a.phoneHint ?? "none"}</td>
                  <td data-label="Authenticator" className="px-6 py-4 whitespace-nowrap text-sm">
                    {a.twoFactor
                      ? <span className="inline-flex items-center text-green-700 dark:text-green-400"><ShieldCheck className="w-4 h-4 mr-1" /> Set up</span>
                      : <span className="inline-flex items-center text-amber-700 dark:text-amber-400"><ShieldOff className="w-4 h-4 mr-1" /> Pending first sign-in</span>}
                  </td>
                  <td data-label="Last sign-in" className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{a.lastSignIn ? new Date(a.lastSignIn).toLocaleString() : "Never"}</td>
                  {isPrimary && (
                    <td data-label="Actions" className="px-6 py-4 text-sm">
                      <div className="flex flex-wrap justify-end gap-x-4 gap-y-2">
                        <button onClick={() => startEdit(a)} className="inline-flex items-center text-blue-600 dark:text-blue-400 hover:underline"><Pencil className="w-4 h-4 mr-1" /> Edit</button>
                        {!locked && !own && (
                          <>
                            <button disabled={busy !== null} onClick={() => act(a, "reset_password")} className="inline-flex items-center text-gray-700 dark:text-gray-200 hover:underline disabled:opacity-50"><KeyRound className="w-4 h-4 mr-1" /> Reset password</button>
                            <button disabled={busy !== null} onClick={() => act(a, "reset_2fa")} className="inline-flex items-center text-gray-700 dark:text-gray-200 hover:underline disabled:opacity-50"><ShieldOff className="w-4 h-4 mr-1" /> Reset authenticator</button>
                            <button disabled={busy !== null} onClick={() => act(a, "demote")} className="inline-flex items-center text-red-600 dark:text-red-400 hover:underline disabled:opacity-50"><UserMinus className="w-4 h-4 mr-1" /> Remove access</button>
                          </>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
            {admins.length === 0 && (
              <tr><td colSpan={6} className="px-6 py-8 text-center text-gray-500 dark:text-gray-400">{loaded ? "No administrators." : <Loader2 className="w-6 h-6 animate-spin mx-auto text-red-500" />}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
