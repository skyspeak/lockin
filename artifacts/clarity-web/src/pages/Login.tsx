import { useState } from "react";

interface LoginProps {
  onLogin: (key: string) => void;
}

export default function Login({ onLogin }: LoginProps) {
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) {
      setError("API key is required");
      return;
    }

    setBusy(true);
    try {
      const res = await fetch("/api/actions/queue", {
        headers: { Authorization: `Bearer ${trimmed}` },
      });
      if (res.status === 401) {
        setError("API key does not match this server");
        return;
      }
      if (!res.ok) {
        setError(`Server returned ${res.status}`);
        return;
      }
      onLogin(trimmed);
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
          Speak tasks. Stay organized. Enter your API key to start.
        </p>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <input
            type="password"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setError("");
            }}
            placeholder="API key"
            autoFocus
            className="w-full rounded-xl border border-[#ebe5dd] bg-white px-4 py-3 text-sm text-[#1a1715] outline-none focus:border-[#c8553d] transition-colors"
          />
          {error && <p className="text-xs text-red-500">{error}</p>}
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-xl bg-[#c8553d] py-3 text-sm font-semibold text-white hover:bg-[#b34a35] transition-colors disabled:opacity-60"
          >
            {busy ? "Checking…" : "Unlock"}
          </button>
        </form>
      </div>
    </div>
  );
}
