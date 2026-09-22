"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, MessageCircle } from "lucide-react";
import { parseE164 } from "@/lib/phone";

/**
 * Phone verification via the MSG91 OTP Widget: MSG91 sends and checks the code itself (behind its own
 * captcha), and hands back a JWT "access-token" as proof. This component only drives that widget and
 * collects the result; the actual trust decision happens server-side in /api/phone/verify, which asks
 * MSG91 to confirm the token before issuing our own signed proof (see src/lib/msg91-widget.ts for the
 * caveats on what that confirmation does and doesn't currently guarantee).
 *
 * Replaces the old code-generation PhoneOtp component (retired; MSG91 generates/checks codes now, we
 * don't). Kept the same external shape (purpose / onVerified / tempToken / initialPhone / lockPhone) so
 * call sites needed only a rename.
 */

type Purpose = "login" | "register" | "bystander" | "change-phone";

type Props = {
  purpose: Purpose;
  /** Called once MSG91 confirms the code and our server confirms MSG91. `phone` is the number that was verified. */
  onVerified: (result: { proof: string; phone: string }) => void | Promise<void>;
  /** login only: the account's real phone (to hand to the widget), used only in JS, not displayed -- `hint` shows the masked form instead. */
  loginPhone?: string;
  /** login only: proves which account this is (server requires it to authorize a "login"-purpose verification). */
  tempToken?: string;
  /** login only: masked form of the number, shown on the code-entry step ("We sent a code to ___"). Real number is never displayed. */
  maskedPhone?: string;
  /** Pre-fill the number (register, change-phone). */
  initialPhone?: string;
  lockPhone?: boolean;
  hint?: string;
  sendLabel?: string;
  verifyLabel?: string;
  disabled?: boolean;
};

const WIDGET_ID = process.env.NEXT_PUBLIC_MSG91_WIDGET_ID;
const WIDGET_TOKEN = process.env.NEXT_PUBLIC_MSG91_WIDGET_TOKEN;

const field =
  "w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-red-600";
const primary =
  "w-full py-3 px-4 bg-gray-900 dark:bg-white text-white dark:text-gray-900 font-bold rounded-lg hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors flex justify-center items-center disabled:opacity-50";

type Msg91Data = Record<string, unknown>;
type Msg91Callback = (data: Msg91Data) => void;
declare global {
  interface Window {
    sendOtp?: (identifier: string, success?: Msg91Callback, failure?: Msg91Callback) => void;
    retryOtp?: (channel: string | null, success?: Msg91Callback, failure?: Msg91Callback, reqId?: string) => void;
    verifyOtp?: (otp: string | number, success?: Msg91Callback, failure?: Msg91Callback, reqId?: string) => void;
  }
}

let widgetScript: Promise<void> | null = null;
function loadWidgetScript(): Promise<void> {
  widgetScript ??= new Promise<void>((resolve, reject) => {
    if (window.sendOtp) return resolve(); // already loaded by an earlier instance
    (window as unknown as { initSendOTP?: () => void }).initSendOTP = () => resolve();
    const el = document.createElement("script");
    el.src = "https://verify.msg91.com/otp-provider.js";
    el.async = true;
    el.onerror = () => reject(new Error("Could not load the verification widget."));
    document.head.appendChild(el);
  });
  return widgetScript;
}

function widgetConfigured() {
  return Boolean(WIDGET_ID && WIDGET_TOKEN);
}

export function Msg91WidgetOtp({
  purpose,
  onVerified,
  loginPhone,
  tempToken,
  maskedPhone,
  initialPhone = "",
  lockPhone = false,
  hint,
  sendLabel = "Send code",
  verifyLabel = "Verify",
  disabled = false,
}: Props) {
  const usesTypedNumber = purpose !== "login";
  const [step, setStep] = useState<"send" | "code">("send");
  const [phone, setPhone] = useState(initialPhone);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const reqIdRef = useRef<string | undefined>(undefined);
  const identifierRef = useRef<string>(""); // the E.164 number actually sent to MSG91 (never re-derived from UI state)

  useEffect(() => {
    let cancelled = false;
    if (widgetConfigured()) {
      loadWidgetScript()
        .then(() => !cancelled && setReady(true))
        .catch((e) => !cancelled && setError((e as Error).message));
    }
    return () => {
      cancelled = true;
    };
  }, []);

  const send = useCallback(
    (isRetry: boolean) => {
      setError("");
      const identifier = usesTypedNumber ? parseE164(phone) : parseE164(loginPhone ?? "");
      if (!identifier) return setError("Enter a valid mobile number, e.g. +91 98765 43210.");
      if (!window.sendOtp || !window.retryOtp) return setError("Verification is still loading. Please wait a moment and try again.");

      identifierRef.current = identifier;
      setBusy(true);
      const onOk = (data: Msg91Data) => {
        setBusy(false);
        if (typeof data.message === "string") reqIdRef.current = data.message; // MSG91 doc name for the request id on send/retry
        if (usesTypedNumber) setPhone(identifier);
        setCode("");
        setStep("code");
      };
      const onFail = () => {
        setBusy(false);
        setError("Could not send the code. Please try again.");
      };

      if (isRetry) {
        window.retryOtp(null, onOk, onFail, reqIdRef.current);
      } else {
        window.sendOtp(identifier, onOk, onFail);
      }
    },
    [usesTypedNumber, phone, loginPhone]
  );

  const confirm = useCallback(() => {
    setError("");
    if (!/^\d{4,8}$/.test(code)) return setError("Enter the code you received.");
    if (!window.verifyOtp) return setError("Verification is still loading. Please wait a moment and try again.");

    setBusy(true);
    window.verifyOtp(
      code,
      async (data: Msg91Data) => {
        const accessToken = typeof data.message === "string" ? data.message : null;
        if (!accessToken) {
          setBusy(false);
          setError("Could not confirm the code. Please try again.");
          return;
        }
        try {
          const res = await fetch("/api/phone/verify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ purpose, accessToken, phone: identifierRef.current, tempToken }),
          });
          const body = await res.json().catch(() => ({}));
          if (!res.ok) {
            setError(body.error || "Could not verify the code.");
            return;
          }
          await onVerified({ proof: body.proof, phone: body.phone ?? identifierRef.current });
        } catch {
          setError("Network error. Check your connection and try again.");
        } finally {
          setBusy(false);
        }
      },
      () => {
        setBusy(false);
        setError("That code is incorrect. Please try again.");
      },
      reqIdRef.current
    );
  }, [code, purpose, tempToken, onVerified]);

  if (!widgetConfigured()) {
    return (
      <div role="alert" className="p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-900/50 text-yellow-800 dark:text-yellow-400 text-sm rounded-lg">
        Phone verification is not configured (NEXT_PUBLIC_MSG91_WIDGET_ID / NEXT_PUBLIC_MSG91_WIDGET_TOKEN).
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <div role="alert" className="p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-sm rounded-lg text-center">
          {error}
        </div>
      )}

      {step === "send" ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(false);
          }}
          className="space-y-4"
        >
          {hint && <p className="text-sm text-gray-600 dark:text-gray-400">{hint}</p>}

          {usesTypedNumber && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Mobile number</label>
              <input
                required
                type="tel"
                autoComplete="tel"
                inputMode="tel"
                value={phone}
                readOnly={lockPhone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+91 98765 43210"
                className={`${field} ${lockPhone ? "bg-gray-100 dark:bg-gray-800/50 cursor-not-allowed" : ""}`}
              />
            </div>
          )}

          <button type="submit" disabled={busy || disabled || !ready} className={primary}>
            {busy || !ready ? <Loader2 className="w-5 h-5 animate-spin" /> : <><MessageCircle className="w-4 h-4 mr-2" />{sendLabel}</>}
          </button>
        </form>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            confirm();
          }}
          className="space-y-4"
        >
          <p className="text-sm text-gray-600 dark:text-gray-400">
            We sent a code to <span className="font-semibold">{usesTypedNumber ? phone : (maskedPhone ?? "your registered number")}</span>.
          </p>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Verification code</label>
            <input
              required
              autoFocus
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={8}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              placeholder="000000"
              className={`${field} text-center text-2xl tracking-[0.5em]`}
            />
          </div>
          <button type="submit" disabled={busy || disabled} className={primary}>
            {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : verifyLabel}
          </button>
          <button type="button" onClick={() => send(true)} disabled={busy} className="w-full text-sm text-blue-600 hover:text-blue-700 dark:text-blue-500 font-medium disabled:opacity-50">
            Resend code
          </button>
          {usesTypedNumber && !lockPhone && (
            <button
              type="button"
              onClick={() => {
                setStep("send");
                setError("");
              }}
              className="w-full text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
            >
              Use a different number
            </button>
          )}
        </form>
      )}
    </div>
  );
}
