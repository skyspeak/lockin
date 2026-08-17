import { useState } from "react";

interface LoginProps {
  onLogin: (token: string) => void;
}

type Mode = "signin" | "signup";

export default function Login({ onLogin }: LoginProps) {
  const [mode, setMode] = useState<Mode>("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setError("Email and password are required");
      return;
    }
    if (mode === "signup" && !inviteCode.trim()) {
      setError("Invite code is required");
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
    <div className="min-h-screen bg-[#fdfbf7] flex items-center justify-center">
      <div className="w-full max-w-sm px-6">
        <p className="text-xs font-semibold uppercase tracking-widest text-[#c8553d] mb-2 text-center">
          Voice first
        </p>
        <h1 className="text-3xl font-bold tracking-tight text-center mb-2 text-[#1a1715] font-serif">
          Clarity
        </h1>
        <p className="text-sm text-[#7a716b] text-center mb-8">
          {mode === "signup"
            ? "Create an account with an invite code to keep your own task list."
            : "Sign in to your Clarity account."}
        </p>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
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
            className="w-full rounded-xl border border-[#ebe5dd] bg-white px-4 py-3 text-sm text-[#1a1715] outline-none focus:border-[#c8553d] transition-colors"
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
            className="w-full rounded-xl border border-[#ebe5dd] bg-white px-4 py-3 text-sm text-[#1a1715] outline-none focus:border-[#c8553d] transition-colors"
          />
          {mode === "signup" && (
            <input
              type="password"
              value={inviteCode}
              onChange={(e) => {
                setInviteCode(e.target.value);
                setError("");
              }}
              placeholder="Invite code"
              autoComplete="off"
              className="w-full rounded-xl border border-[#ebe5dd] bg-white px-4 py-3 text-sm text-[#1a1715] outline-none focus:border-[#c8553d] transition-colors"
            />
          )}
          {error && <p className="text-xs text-red-500">{error}</p>}
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-xl bg-[#c8553d] py-3 text-sm font-semibold text-white hover:bg-[#b34a35] transition-colors disabled:opacity-60"
          >
            {busy ? "Please wait…" : mode === "signup" ? "Create account" : "Sign in"}
          </button>
        </form>
        <button
          type="button"
          onClick={() => {
            setMode(mode === "signup" ? "signin" : "signup");
            setError("");
          }}
          className="mt-4 w-full text-center text-sm font-semibold text-[#c8553d]"
        >
          {mode === "signup" ? "Already have an account? Sign in" : "Need an account? Create one"}
        </button>
        <p className="mt-6 text-center text-xs text-[#7a716b]">
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
