"use client";

import { useCallback, useState } from "react";
import { ShieldAlert, Loader2, Smartphone } from "lucide-react";
import Link from "next/link";
import { ThemeToggle } from "@/components/ThemeToggle";
import { PhoneOtp } from "@/components/PhoneOtp";
import { TotpSetup } from "@/components/TotpSetup";
import { RecoveryCodes } from "@/components/RecoveryCodes";

type Step = "credentials" | "code" | "phone" | "setup" | "recovery-codes";

const field =
  "w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-red-600";
const primary =
  "w-full py-3 px-4 bg-gray-900 dark:bg-white text-white dark:text-gray-900 font-bold rounded-lg hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors flex justify-center items-center disabled:opacity-50";
const linkButton = "w-full text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300";

const SUBTITLE: Record<Step, string> = {
  credentials: "Sign in to access your profile or C2 Center",
  code: "Two-factor authentication",
  phone: "Verify your phone number",
  setup: "Set up your authenticator app",
  "recovery-codes": "Almost done",
};

export default function LoginPage() {
  const [step, setStep] = useState<Step>("credentials");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const [tempToken, setTempToken] = useState(""); // proves the password step passed; only good for the second step
  const [phoneHint, setPhoneHint] = useState("");
  const [canRecoverByPhone, setCanRecoverByPhone] = useState(false);
  const [recoveryFlow, setRecoveryFlow] = useState(false); // true when replacing a lost authenticator
  const [otpKey, setOtpKey] = useState(0); // bumping this resets the phone-code widget after a server-side rejection

  const [code, setCode] = useState("");
  const [useRecovery, setUseRecovery] = useState(false);

  const [enrollToken, setEnrollToken] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [role, setRole] = useState("");

  const goHome = (r: string) => {
    window.location.href = r === "ADMIN" ? "/admin" : "/dashboard";
  };

  const backToStart = useCallback((message = "") => {
    setStep("credentials");
    setPassword("");
    setTempToken("");
    setEnrollToken("");
    setCode("");
    setError(message);
  }, []);

  // Stable identity: TotpSetup restarts its setup request if this callback changes.
  const setupExpired = useCallback(() => backToStart("That took too long. Please sign in again."), [backToStart]);

  const post = async (body: unknown) => {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return { res, data: await res.json().catch(() => ({})) };
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const { res, data } = await post({ email, password });
      if (res.ok && data.requires2FA) {
        setTempToken(data.tempToken);
        setPhoneHint(data.phoneHint);
        setCanRecoverByPhone(Boolean(data.canRecoverByPhone));
        setRecoveryFlow(false);
        // Accounts without an authenticator yet must first prove their phone, then set one up.
        setStep(data.method === "totp" ? "code" : "phone");
      } else {
        setError(data.error || "Login failed");
      }
    } catch {
      setError("An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  };

  const handleCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const { res, data } = await post({ tempToken, ...(useRecovery ? { recoveryCode: code } : { totpCode: code }) });
      if (res.ok) return goHome(data.role);
      if (res.status === 401 && /session expired/i.test(data.error ?? "")) return backToStart(data.error);
      setError(data.error || "Verification failed");
      setCode("");
    } catch {
      setError("An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  };

  // Phone code entered correctly -> trade the proof for permission to set up (or replace) the authenticator.
  const handlePhoneVerified = async ({ proof }: { proof: string }) => {
    setError("");
    try {
      const { res, data } = await post({ tempToken, phoneProof: proof });
      if (res.ok) {
        setEnrollToken(data.enrollToken);
        setStep("setup");
        return;
      }
      if (res.status === 401 && /session expired/i.test(data.error ?? "")) return backToStart(data.error);
      setError(data.error || "Verification failed");
      if (res.status === 403) setStep("code"); // e.g. administrators cannot reset by phone
      else setOtpKey((k) => k + 1);
    } catch {
      setError("An unexpected error occurred");
      setOtpKey((k) => k + 1);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 p-6 transition-colors">
      <div className="absolute top-4 right-4"><ThemeToggle /></div>
      <div className="w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-xl overflow-hidden border border-gray-100 dark:border-gray-800 transition-colors">
        <div className="p-8">
          <div className="flex justify-center mb-6">
            <ShieldAlert className="w-12 h-12 text-red-600" />
          </div>
          <h2 className="text-2xl font-bold text-center text-gray-900 dark:text-white mb-2">Sanjivani Identity Login</h2>
          <p className="text-center text-gray-500 dark:text-gray-400 mb-8 text-sm">{SUBTITLE[step]}</p>

          {error && (
            <div role="alert" className="mb-4 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-sm rounded-lg text-center">
              {error}
            </div>
          )}

          {step === "credentials" && (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email Address</label>
                <input required type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} className={field} placeholder="user@rru.edu" />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Password</label>
                  <Link href="/forgot-password" className="text-sm text-red-600 hover:text-red-700 dark:text-red-500 font-medium">Forgot password?</Link>
                </div>
                <input required type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className={field} placeholder="••••••••" />
              </div>
              <button type="submit" disabled={loading} className={primary}>
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Sign In"}
              </button>
              <div className="text-center mt-4">
                <Link href="/register" className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300">
                  Don&apos;t have a profile? Register Now
                </Link>
              </div>
            </form>
          )}

          {step === "code" && (
            <form onSubmit={handleCode} className="space-y-4">
              <p className="text-sm text-gray-600 dark:text-gray-400 flex items-start">
                <Smartphone className="w-4 h-4 mr-2 mt-0.5 flex-shrink-0" />
                {useRecovery ? "Enter one of your recovery codes. Each works only once." : "Open your authenticator app and enter the 6-digit code for Sanjivani."}
              </p>
              <input
                required
                autoFocus
                type="text"
                inputMode={useRecovery ? "text" : "numeric"}
                autoComplete="one-time-code"
                maxLength={useRecovery ? 12 : 6}
                value={code}
                onChange={(e) => setCode(useRecovery ? e.target.value.toUpperCase() : e.target.value.replace(/\D/g, ""))}
                placeholder={useRecovery ? "XXXXX-XXXXX" : "000000"}
                className={`${field} text-center text-2xl tracking-[0.3em]`}
              />
              <button type="submit" disabled={loading} className={primary}>
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Verify & Enter"}
              </button>
              <button type="button" className={linkButton} onClick={() => { setUseRecovery(!useRecovery); setCode(""); setError(""); }}>
                {useRecovery ? "Use my authenticator app instead" : "Use a recovery code instead"}
              </button>
              {canRecoverByPhone && (
                <button
                  type="button"
                  className={linkButton}
                  onClick={() => { setRecoveryFlow(true); setStep("phone"); setError(""); }}
                >
                  I lost my authenticator and recovery codes
                </button>
              )}
              <button type="button" className={linkButton} onClick={() => backToStart()}>Back to sign in</button>
            </form>
          )}

          {step === "phone" && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {recoveryFlow
                  ? "To replace your authenticator, confirm it is you with a code sent to your registered number. This signs out your other sessions and cancels your old recovery codes."
                  : "To keep your account safe, first confirm your registered number. Then you will set up an authenticator app, which you will use every time you sign in."}
              </p>
              <PhoneOtp
                key={otpKey}
                purpose="login"
                tempToken={tempToken}
                hint={`We will send a code to your registered mobile number (${phoneHint}).`}
                sendLabel="Send code"
                verifyLabel="Continue"
                onVerified={handlePhoneVerified}
              />
              <button
                type="button"
                className={linkButton}
                onClick={() => {
                  if (recoveryFlow) {
                    setRecoveryFlow(false);
                    setStep("code");
                  } else {
                    backToStart();
                  }
                }}
              >
                {recoveryFlow ? "Back" : "Back to sign in"}
              </button>
            </div>
          )}

          {step === "setup" && (
            <TotpSetup
              enrollToken={enrollToken}
              onExpired={setupExpired}
              onDone={({ recoveryCodes: codes, role: r }) => {
                setRecoveryCodes(codes);
                setRole(r);
                setStep("recovery-codes");
              }}
            />
          )}

          {step === "recovery-codes" && <RecoveryCodes codes={recoveryCodes} onContinue={() => goHome(role)} continueLabel="Go to my account" />}
        </div>
      </div>
    </div>
  );
}
