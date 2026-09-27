"use client";

import { useEffect, useState } from "react";
import { Loader2, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";

type Step = "email" | "code" | "emailSent" | "done";

const field =
  "w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-red-600 focus:border-transparent transition-all outline-none";
const primary =
  "w-full py-3 px-4 bg-gray-900 dark:bg-white text-white dark:text-gray-900 font-bold rounded-lg hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors flex justify-center items-center disabled:opacity-50";

async function post(url: string, body: unknown) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data: data as Record<string, unknown> };
}

export default function ForgotPasswordPage() {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [challengeId, setChallengeId] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const message = (data: Record<string, unknown>, fallback: string) => (typeof data.error === "string" ? data.error : fallback);

  const sendCode = async (resend = false) => {
    setLoading(true);
    setError("");
    try {
      const { ok, data } = await post("/api/auth/reset-password/phone/send", { email, ...(resend && challengeId ? { challengeId } : {}) });
      if (!ok) return setError(message(data, "Could not send the code"));
      setChallengeId(String(data.challengeId));
      setCooldown(Number(data.resendAfterSeconds) || 30);
      setStep("code");
    } catch {
      setError("An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  };

  const sendLink = async () => {
    setLoading(true);
    setError("");
    try {
      const { ok, data } = await post("/api/auth/reset-password", { email });
      if (ok) setStep("emailSent");
      else setError(message(data, "Failed to initiate reset"));
    } catch {
      setError("An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  };

  const confirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) return setError("Passwords do not match");
    setLoading(true);
    setError("");
    try {
      const { ok, data } = await post("/api/auth/reset-password/phone/confirm", { email, challengeId, code, password });
      if (ok) setStep("done");
      else setError(message(data, "Failed to reset password"));
    } catch {
      setError("An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  };

  const heading = step === "code" ? "Enter the code" : "Reset Password";
  const blurb =
    step === "email"
      ? "Enter the email on your account. We text a code to the phone number registered to it."
      : step === "code"
        ? "If that email has an account, a 6-digit code was sent to its registered phone. It is valid for 5 minutes."
        : "";

  return (
    <div className="min-h-dvh flex items-center justify-center bg-gray-50 dark:bg-gray-950 p-3 sm:p-6 transition-colors">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-xl overflow-hidden border border-gray-100 dark:border-gray-800 transition-colors">
        <div className="p-5 sm:p-8">
          <div className="flex justify-center mb-6">
            <Logo size={80} />
          </div>
          <h2 className="text-2xl font-bold text-center text-gray-900 dark:text-white mb-2">{heading}</h2>
          {blurb && <p className="text-center text-gray-500 dark:text-gray-400 mb-8 text-sm">{blurb}</p>}

          {error && (
            <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-sm rounded-lg text-center">
              {error}
            </div>
          )}

          {step === "email" && (
            <form onSubmit={(e) => { e.preventDefault(); void sendCode(); }} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email Address</label>
                <input type="email" required autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} className={field} placeholder="user@rru.edu" />
              </div>
              <button type="submit" disabled={loading || !email} className={primary}>
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Text me a code"}
              </button>
              <button type="button" disabled={loading || !email} onClick={() => void sendLink()} className="w-full text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300 underline disabled:opacity-50">
                Email me a reset link instead
              </button>
              <div className="text-center mt-4">
                <Link href="/login" className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300">
                  Remembered your password? Sign in
                </Link>
              </div>
            </form>
          )}

          {step === "code" && (
            <form onSubmit={confirm} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">6-digit code</label>
                <input required inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} className={`${field} tracking-widest text-center text-lg`} placeholder="••••••" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">New password</label>
                <input required type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className={field} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Confirm new password</label>
                <input required type="password" autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className={field} />
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">At least 8 characters with a number and a symbol.</p>
              <button type="submit" disabled={loading || code.length !== 6 || !password} className={primary}>
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Set new password"}
              </button>
              <div className="flex items-center justify-between text-sm">
                <button type="button" disabled={loading || cooldown > 0} onClick={() => void sendCode(true)} className="text-red-600 dark:text-red-500 font-medium disabled:text-gray-400 disabled:cursor-not-allowed">
                  {cooldown > 0 ? `Resend code in ${cooldown}s` : "Resend code"}
                </button>
                <button type="button" onClick={() => { setStep("email"); setCode(""); setError(""); }} className="text-gray-500 dark:text-gray-400 hover:underline">
                  Use a different email
                </button>
              </div>
            </form>
          )}

          {step === "emailSent" && (
            <div className="text-center">
              <div className="flex justify-center mb-4"><CheckCircle2 className="w-16 h-16 text-green-500" /></div>
              <p className="text-gray-600 dark:text-gray-300 mb-6">
                If an account exists for that email, a password reset link has been sent. The link expires in 1 hour; check your spam folder if you do not see it. No email? Go back and choose &ldquo;Text me a code&rdquo;.
              </p>
              <Link href="/login" className="inline-block text-red-600 hover:text-red-700 dark:text-red-500 font-medium">Back to Login</Link>
            </div>
          )}

          {step === "done" && (
            <div className="text-center">
              <div className="flex justify-center mb-4"><CheckCircle2 className="w-16 h-16 text-green-500" /></div>
              <p className="text-gray-600 dark:text-gray-300 mb-2">Your password has been changed and you were signed out everywhere.</p>
              <p className="text-gray-500 dark:text-gray-400 text-sm mb-6">Sign in with the new password and your authenticator app code.</p>
              <Link href="/login" className="inline-block text-red-600 hover:text-red-700 dark:text-red-500 font-medium">Go to Login</Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
