import { useEffect, useState } from "react";
import { Link } from "wouter";

export function AccountBar({ token, onLogout }: { token: string; onLogout: () => void }) {
  const [email, setEmail] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [gmail, setGmail] = useState<{ connected: boolean; email: string | null; configured: boolean } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me", { headers: { Authorization: `Bearer ${token}` } })
      .then(async (res) => {
        if (!res.ok) return;
        const body = (await res.json()) as { email?: string | null };
        if (!cancelled) setEmail(body.email ?? null);
      })
      .catch(() => {});
    fetch("/api/google/status", { headers: { Authorization: `Bearer ${token}` } })
      .then(async (res) => {
        if (!res.ok) return;
        const body = (await res.json()) as { connected: boolean; email: string | null; configured: boolean };
        if (!cancelled) setGmail(body);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [token]);

  const connectGmail = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/google/connect", { headers: { Authorization: `Bearer ${token}` } });
      const body = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !body.url) {
        window.alert(body.error || "Could not start Gmail connect.");
        return;
      }
      window.location.href = body.url;
    } catch {
      window.alert("Could not start Gmail connect.");
    } finally {
      setBusy(false);
    }
  };

  const deleteAccount = async () => {
    if (
      !window.confirm(
        "Delete your account and all tasks? This cannot be undone.",
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/auth/account", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok && res.status !== 204) {
        window.alert("Could not delete the account. Please try again.");
        return;
      }
      onLogout();
    } catch {
      window.alert("Could not delete the account. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="w-full border-b border-[#f5d5c4] bg-[#fff3e6]/90 backdrop-blur-sm">
      <div className="mx-auto flex max-w-xl items-center justify-between gap-3 px-6 py-3">
        <nav className="flex items-center gap-4 text-sm font-semibold">
          <Link href="/" className="text-[#3a241e] hover:text-[#ff5a7a]">
            Speak
          </Link>
          <Link href="/follow-ups" className="text-[#a06d62] hover:text-[#ff5a7a] font-medium">
            Follow-ups
          </Link>
          <Link href="/privacy" className="text-[#a06d62] hover:text-[#ff5a7a] font-medium">
            Privacy
          </Link>
        </nav>
        <div className="flex items-center gap-3">
          {typeof window !== "undefined" && new URLSearchParams(window.location.search).get("gmail") === "connected" ? (
            <span className="text-xs font-semibold text-[#ff5a7a]">Gmail connected</span>
          ) : null}
          {email ? <span className="hidden sm:inline text-xs text-[#a06d62] truncate max-w-[140px]">{email}</span> : null}
          {gmail?.connected ? (
            <span className="hidden md:inline text-xs text-[#a06d62]">Gmail connected</span>
          ) : (
            <button
              type="button"
              onClick={() => void connectGmail()}
              disabled={busy}
              className="text-sm font-semibold text-[#ff5a7a] hover:text-[#e63e64] disabled:opacity-60"
            >
              Connect Gmail
            </button>
          )}
          <button
            type="button"
            onClick={() => void deleteAccount()}
            disabled={busy}
            className="text-sm font-semibold text-[#a06d62] hover:text-[#c0392b] disabled:opacity-60"
          >
            Delete account
          </button>
          <button
            type="button"
            onClick={onLogout}
            className="text-sm font-semibold text-[#c0392b] hover:text-[#922b21]"
          >
            Log out
          </button>
        </div>
      </div>
    </div>
  );
}
