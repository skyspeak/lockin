import { useEffect, useState } from "react";
import { Link } from "wouter";

export function AccountBar({ token, onLogout }: { token: string; onLogout: () => void }) {
  const [email, setEmail] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me", { headers: { Authorization: `Bearer ${token}` } })
      .then(async (res) => {
        if (!res.ok) return;
        const body = (await res.json()) as { email?: string | null };
        if (!cancelled) setEmail(body.email ?? null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [token]);

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
    <div className="w-full border-b border-[#ebe5dd] bg-[#fdfbf7]/90 backdrop-blur-sm">
      <div className="mx-auto flex max-w-xl items-center justify-between gap-3 px-6 py-3">
        <nav className="flex items-center gap-4 text-sm font-semibold">
          <Link href="/" className="text-[#1a1715] hover:text-[#c8553d]">
            Tasks
          </Link>
          <Link href="/privacy" className="text-[#7a716b] hover:text-[#c8553d] font-medium">
            Privacy
          </Link>
        </nav>
        <div className="flex items-center gap-3">
          {email ? <span className="hidden sm:inline text-xs text-[#7a716b] truncate max-w-[140px]">{email}</span> : null}
          <button
            type="button"
            onClick={() => void deleteAccount()}
            disabled={busy}
            className="text-sm font-semibold text-[#7a716b] hover:text-[#c0392b] disabled:opacity-60"
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
