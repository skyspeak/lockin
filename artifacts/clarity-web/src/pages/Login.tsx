import { useState } from "react";

interface LoginProps {
  onLogin: (token: string) => void;
}

type Step = "invite" | "account";
type Mode = "signin" | "signup";

const fieldClass =
  "w-full rounded-2xl border border-[#f5d5c4] bg-white px-4 py-3 text-sm text-[#3a241e] outline-none focus:border-[#ff5a7a] transition-colors";

export default function Login({ onLogin }: LoginProps) {
  const [step, setStep] = useState<Step>("invite");
  const [mode, setMode] = useState<Mode>("signup");
  const [inviteCode, setInviteCode] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const checkInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = inviteCode.trim();
    if (!code) {
      setError("Input your special invite code.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/auth/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inviteCode: code }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(body.error || "That invite code is not valid.");
        return;
      }
      setError("");
      setStep("account");
    } catch {
      setError("Could not reach the API.");
    } finally {
      setBusy(false);
    }
  };

  const submitAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setError("Email and password are required");
      return;
    }
    if (mode === "signup" && password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }

    setBusy(true);
    try {
      const path = mode === "signup" ? "/api/auth/signup" : "/api/auth/login";
      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          mode === "signup"
            ? { email: trimmedEmail, password, inviteCode: inviteCode.trim() }
            : { email: trimmedEmail, password },
        ),
      });
      const body = (await res.json().catch(() => ({}))) as { token?: string; error?: string };
      if (!res.ok) {
        setError(body.error || `Server returned ${res.status}`);
        return;
      }
      if (!body.token) {
        setError("Could not start a session. Please try again.");
        return;
      }
      onLogin(body.token);
    } catch {
      setError("Could not reach the API.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen lockin-shell flex items-center justify-center">
      <div className="w-full max-w-sm px-6">
        <img src="/favicon.svg" alt="" className="mx-auto mb-4 h-16 w-16 lockin-float" />
        <p className="text-xs font-bold tracking-wide text-[#ff5a7a] mb-2 text-center">
          dump it. lock it.
        </p>
        <h1 className="text-3xl font-bold tracking-tight text-center mb-2 text-[#3a241e] font-serif">
          Lock In
        </h1>

        {step === "invite" ? (
          <>
            <p className="text-sm text-[#a06d62] text-center mb-8">
              Got an invite? Slip it in.
            </p>
            <form onSubmit={checkInvite} className="flex flex-col gap-3">
              <input
                type="password"
                value={inviteCode}
                onChange={(e) => {
                  setInviteCode(e.target.value);
                  setError("");
                }}
                placeholder="your secret handshake"
                autoComplete="off"
                autoFocus
                className={fieldClass}
              />
              {error && <p className="text-xs text-red-500">{error}</p>}
              <button
                type="submit"
                disabled={busy}
                className="w-full rounded-full bg-[#ff5a7a] py-3 text-sm font-semibold text-white hover:bg-[#ff7a93] transition-colors disabled:opacity-60"
              >
                {busy ? "Checking…" : "Let’s go"}
              </button>
            </form>
          </>
        ) : (
          <>
            <p className="text-sm text-[#a06d62] text-center mb-8">
              {mode === "signup" ? "Make your corner of Lock In." : "Welcome back. Let’s lock in."}
            </p>
            <form onSubmit={submitAccount} className="flex flex-col gap-3">
              <input
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setError("");
                }}
                placeholder="Email"
                autoComplete="email"
                autoFocus
                className={fieldClass}
              />
              <input
                type="password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError("");
                }}
                placeholder={mode === "signup" ? "Password (8+ characters)" : "Password"}
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                className={fieldClass}
              />
              {error && <p className="text-xs text-red-500">{error}</p>}
              <button
                type="submit"
                disabled={busy}
                className="w-full rounded-full bg-[#ff5a7a] py-3 text-sm font-semibold text-white hover:bg-[#ff7a93] transition-colors disabled:opacity-60"
              >
                {busy ? "One sec…" : mode === "signup" ? "Create account" : "Sign in"}
              </button>
            </form>
            <button
              type="button"
              onClick={() => {
                setMode(mode === "signup" ? "signin" : "signup");
                setError("");
              }}
              className="mt-4 w-full text-center text-sm font-semibold text-[#ff5a7a]"
            >
              {mode === "signup" ? "Already have an account? Sign in" : "Need an account? Create one"}
            </button>
          </>
        )}

        <p className="mt-6 text-center text-xs text-[#a06d62]">
          By continuing you agree to the{" "}
          <a href="/terms" className="underline">
            Terms
          </a>{" "}
          and{" "}
          <a href="/privacy" className="underline">
            Privacy Policy
          </a>
          .
        </p>
      </div>
    </div>
  );
}
