"use client";

import { useEffect, useState } from "react";
import { KeyRound, Loader2, ShieldCheck } from "lucide-react";
import { RecoveryCodes } from "@/components/RecoveryCodes";

type Status = { enabled: boolean; enabledAt: string | null; recoveryCodesRemaining: number };

/** Two-factor status and recovery-code management for the signed-in member (dashboard). */
export function TwoFactorCard() {
  const [status, setStatus] = useState<Status | null>(null);
  const [loadError, setLoadError] = useState("");
  const [asking, setAsking] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [newCodes, setNewCodes] = useState<string[] | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/user/2fa");
        if (!res.ok) throw new Error();
        const data: Status = await res.json();
        if (!cancelled) setStatus(data);
      } catch {
        if (!cancelled) setLoadError("Could not load your two-factor status.");
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const regenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const res = await fetch("/api/user/2fa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "regenerate-recovery-codes", code }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setNewCodes(data.recoveryCodes);
        setAsking(false);
        setCode("");
      } else {
        setError(data.error || "Could not create new codes.");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  if (newCodes) {
    return (
      <RecoveryCodes
        codes={newCodes}
        continueLabel="Done"
        onContinue={() => {
          setNewCodes(null);
          setReloadKey((k) => k + 1);
        }}
      />
    );
  }

  return (
    <div className="bg-gray-50 dark:bg-gray-800/50 p-4 rounded-xl border border-gray-200 dark:border-gray-700 space-y-3">
      <h3 className="font-bold text-gray-900 dark:text-white flex items-center">
        <ShieldCheck className="w-4 h-4 mr-2 text-green-600" /> Two-factor authentication
      </h3>

      {loadError && <p className="text-sm text-red-600">{loadError}</p>}
      {!status && !loadError && <Loader2 className="w-5 h-5 animate-spin text-red-600" />}

      {status && (
        <>
          <p className="text-sm text-gray-700 dark:text-gray-300">
            {status.enabled
              ? `Authenticator app is on${status.enabledAt ? ` (since ${new Date(status.enabledAt).toLocaleDateString()})` : ""}.`
              : "Authenticator app is not set up. You will be asked to set it up the next time you sign in."}
          </p>
          {status.enabled && (
            <>
              <p className={`text-sm ${status.recoveryCodesRemaining <= 2 ? "text-orange-600 font-medium" : "text-gray-600 dark:text-gray-400"}`}>
                <KeyRound className="w-3.5 h-3.5 inline mr-1" />
                {status.recoveryCodesRemaining} recovery code{status.recoveryCodesRemaining === 1 ? "" : "s"} left
                {status.recoveryCodesRemaining <= 2 ? ". Consider creating new ones." : "."}
              </p>
              {asking ? (
                <form onSubmit={regenerate} className="space-y-2">
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">Enter the current code from your app to confirm</label>
                  <input
                    required
                    autoFocus
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                    placeholder="000000"
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-center tracking-[0.3em] outline-none focus:ring-2 focus:ring-red-600"
                  />
                  {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
                  <div className="flex gap-2">
                    <button type="submit" disabled={busy || code.length !== 6} className="flex-1 py-2 text-sm font-bold rounded-lg bg-gray-900 dark:bg-white text-white dark:text-gray-900 disabled:opacity-50">
                      {busy ? "Working..." : "Create new codes"}
                    </button>
                    <button type="button" onClick={() => { setAsking(false); setError(""); setCode(""); }} className="px-3 py-2 text-sm text-gray-600 dark:text-gray-400">Cancel</button>
                  </div>
                  <p className="text-[11px] text-gray-500">Your old recovery codes stop working.</p>
                </form>
              ) : (
                <button type="button" onClick={() => setAsking(true)} className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-500 font-medium">
                  Create new recovery codes
                </button>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
