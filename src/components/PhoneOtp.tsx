"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Smartphone } from "lucide-react";
import { parseE164 } from "@/lib/phone";

type Purpose = "login" | "register" | "bystander" | "change-phone";

type Props = {
  purpose: Purpose;
  /** Called once the code is correct. `proof` is a single-use token to present to the next API call. */
  onVerified: (result: { proof: string; phone: string }) => void | Promise<void>;
  /** login only: the password-step token. The server sends to the account's own number, so none is typed. */
  tempToken?: string;
  /** Pre-fill the number (register, change-phone). */
  initialPhone?: string;
  lockPhone?: boolean;
  /** Shown above the send button, e.g. the masked number a login code will go to. */
  hint?: string;
  sendLabel?: string;
  verifyLabel?: string;
  disabled?: boolean;
};

const RESEND_FALLBACK_SECONDS = 30;
const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

const input =
  "w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-red-600";
const primary =
  "w-full py-3 px-4 bg-gray-900 dark:bg-white text-white dark:text-gray-900 font-bold rounded-lg hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors flex justify-center items-center disabled:opacity-50";

type TurnstileApi = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  reset: (id?: string) => void;
  remove: (id: string) => void;
};
declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let turnstileScript: Promise<void> | null = null;
function loadTurnstile(): Promise<void> {
  turnstileScript ??= new Promise<void>((resolve, reject) => {
    const el = document.createElement("script");
    el.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    el.async = true;
    el.onload = () => resolve();
    el.onerror = () => reject(new Error("Could not load the security check."));
    document.head.appendChild(el);
  });
  return turnstileScript;
}

/**
 * Cloudflare Turnstile widget (only rendered when a site key is configured and `enabled`).
 * `attach` is a callback ref: put it on the container element.
 */
function useTurnstile(enabled: boolean) {
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const [widgetId, setWidgetId] = useState<string | null>(null);
  const [token, setToken] = useState("");
  const active = Boolean(TURNSTILE_SITE_KEY && enabled);

  useEffect(() => {
    if (!active || !container) return;
    let cancelled = false;
    let id: string | null = null;
    loadTurnstile()
      .then(() => {
        if (cancelled || !window.turnstile) return;
        id = window.turnstile.render(container, {
          sitekey: TURNSTILE_SITE_KEY,
          callback: (t: string) => setToken(t),
          "expired-callback": () => setToken(""),
          "error-callback": () => setToken(""),
        });
        setWidgetId(id);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      if (id && window.turnstile) window.turnstile.remove(id);
    };
  }, [active, container]);

  const reset = useCallback(() => {
    setToken("");
    if (widgetId) window.turnstile?.reset(widgetId);
  }, [widgetId]);

  return { attach: setContainer, token, reset, active };
}

export function PhoneOtp({
  purpose,
  onVerified,
  tempToken,
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
  const [challengeId, setChallengeId] = useState("");
  const [sentTo, setSentTo] = useState(""); // masked number the code went to
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [cooldown, setCooldown] = useState(0);

  // Only anonymous purposes get the bot check; login/change-phone are already behind authentication.
  const { attach: attachCaptcha, token: captchaToken, reset: resetCaptcha, active: captchaActive } = useTurnstile(
    purpose === "register" || purpose === "bystander"
  );

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const send = useCallback(
    async (resend: boolean) => {
      setError("");
      const e164 = usesTypedNumber ? parseE164(phone) : undefined;
      if (usesTypedNumber && !e164) return setError("Enter a valid mobile number, e.g. +91 98765 43210.");
      if (captchaActive && !resend && !captchaToken) return setError("Please complete the security check first.");

      setBusy(true);
      try {
        const res = await fetch("/api/phone/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            purpose,
            phone: e164,
            tempToken,
            captchaToken: captchaToken || undefined,
            challengeId: resend ? challengeId : undefined,
          }),
        });
        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          setError(data.error || "Could not send the code. Please try again.");
          if (data.retryAfter) setCooldown(Number(data.retryAfter));
          // A resend that the server no longer recognises must restart from the beginning.
          if (resend && res.status === 400) setStep("send");
          if (!resend) resetCaptcha();
          return;
        }

        if (e164) setPhone(e164);
        setChallengeId(data.challengeId);
        setSentTo(data.phoneHint ?? "");
        setCooldown(Number(data.resendAfterSeconds) || RESEND_FALLBACK_SECONDS);
        setCode("");
        setStep("code");
        if (!resend) resetCaptcha();
      } catch {
        setError("Network error. Check your connection and try again.");
      } finally {
        setBusy(false);
      }
    },
    [usesTypedNumber, phone, captchaActive, captchaToken, resetCaptcha, purpose, tempToken, challengeId]
  );

  const confirm = useCallback(async () => {
    setError("");
    if (!/^\d{6}$/.test(code)) return setError("Enter the 6-digit code.");

    setBusy(true);
    try {
      const res = await fetch("/api/phone/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ purpose, challengeId, code, tempToken }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data.error || "Could not verify the code.");
        if (["locked", "expired", "not_found"].includes(data.reason)) setStep("send"); // this challenge is finished
        return;
      }
      await onVerified({ proof: data.proof, phone: usesTypedNumber ? (parseE164(phone) ?? phone) : "" });
    } catch {
      setError("Network error. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }, [code, purpose, challengeId, tempToken, onVerified, usesTypedNumber, phone]);

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
            void send(false);
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
                className={`${input} ${lockPhone ? "bg-gray-100 dark:bg-gray-800/50 cursor-not-allowed" : ""}`}
              />
            </div>
          )}

          {captchaActive && <div ref={attachCaptcha} className="flex justify-center" />}

          <button type="submit" disabled={busy || disabled || (captchaActive && !captchaToken)} className={primary}>
            {busy ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                <Smartphone className="w-4 h-4 mr-2" />
                {sendLabel}
              </>
            )}
          </button>
        </form>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void confirm();
          }}
          className="space-y-4"
        >
          <p className="text-sm text-gray-600 dark:text-gray-400 flex items-center">
            <Smartphone className="w-4 h-4 mr-2 flex-shrink-0" />
            <span>
              We sent a 6-digit code by SMS to <span className="font-semibold">{sentTo || phone}</span>.
            </span>
          </p>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Verification code</label>
            <input
              required
              autoFocus
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              placeholder="000000"
              className={`${input} text-center text-2xl tracking-[0.5em]`}
            />
          </div>
          <button type="submit" disabled={busy || disabled} className={primary}>
            {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : verifyLabel}
          </button>

          <button
            type="button"
            onClick={() => void send(true)}
            disabled={busy || cooldown > 0}
            className="w-full text-sm text-blue-600 hover:text-blue-700 dark:text-blue-500 font-medium disabled:opacity-50"
          >
            {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
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
