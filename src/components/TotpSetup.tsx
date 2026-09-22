"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { formatSecret } from "@/lib/totp";

type Props = {
  /** Issued after password + a phone code; authorises this setup. */
  enrollToken: string;
  onDone: (result: { recoveryCodes: string[]; role: string }) => void;
  /** The token expired or the account changed: the person has to start again. */
  onExpired: () => void;
};

const input =
  "w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white outline-none text-center text-2xl tracking-[0.4em] focus:ring-2 focus:ring-red-600";

/** Scan-a-QR authenticator setup. The QR code is drawn in the browser; the secret goes nowhere else. */
export function TotpSetup({ enrollToken, onDone, onExpired }: Props) {
  const [setup, setSetup] = useState<{ secret: string; uri: string } | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function start() {
      try {
        const res = await fetch("/api/auth/totp/setup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ enrollToken }),
        });
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (res.status === 401) return onExpired();
        if (!res.ok) return setError(data.error || "Could not start setup. Please try again.");
        setSetup({ secret: data.secret, uri: data.uri });
      } catch {
        if (!cancelled) setError("Network error. Check your connection and try again.");
      }
    }
    void start();
    return () => {
      cancelled = true;
    };
  }, [enrollToken, onExpired]);

  const confirm = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!/^\d{6}$/.test(code)) return setError("Enter the 6-digit code shown in your app.");

    setBusy(true);
    try {
      const res = await fetch("/api/auth/totp/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enrollToken, code }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) return onDone({ recoveryCodes: data.recoveryCodes, role: data.role });
      if (res.status === 401) return onExpired();
      setError(data.error || "That code did not work. Please try again.");
      setCode("");
    } catch {
      setError("Network error. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={confirm} className="space-y-4">
      {error && (
        <div role="alert" className="p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-sm rounded-lg text-center">
          {error}
        </div>
      )}

      <ol className="text-sm text-gray-700 dark:text-gray-300 list-decimal pl-5 space-y-1">
        <li>Install an authenticator app (Google Authenticator, Microsoft Authenticator, Authy, 1Password...).</li>
        <li>Scan this QR code, or choose &quot;enter a setup key&quot; and type the key below.</li>
        <li>Enter the 6-digit code the app shows.</li>
      </ol>

      {setup ? (
        <div className="flex flex-col items-center gap-3">
          <div className="bg-white p-3 rounded-lg border border-gray-200">
            <QRCodeSVG value={setup.uri} size={168} level="M" bgColor="#ffffff" fgColor="#000000" />
          </div>
          <div className="text-center">
            <p className="text-xs text-gray-500 dark:text-gray-400">Setup key</p>
            <code className="font-mono text-sm text-gray-900 dark:text-gray-100 break-all select-all">{formatSecret(setup.secret)}</code>
          </div>
        </div>
      ) : (
        !error && (
          <div className="flex justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-red-600" />
          </div>
        )
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Code from your app</label>
        <input
          required
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          placeholder="000000"
          disabled={!setup}
          className={input}
        />
      </div>

      <button
        type="submit"
        disabled={busy || !setup}
        className="w-full py-3 px-4 bg-gray-900 dark:bg-white text-white dark:text-gray-900 font-bold rounded-lg hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors flex justify-center items-center disabled:opacity-50"
      >
        {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : "Turn on two-factor"}
      </button>
    </form>
  );
}
