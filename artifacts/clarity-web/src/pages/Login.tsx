import { useState } from "react";

interface LoginProps {
  onLogin: (key: string) => void;
}

export default function Login({ onLogin }: LoginProps) {
  const [value, setValue] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) {
      setError("API key is required");
      return;
    }
    onLogin(trimmed);
  };

  return (
    <div className="min-h-screen bg-[#fdfbf7] flex items-center justify-center">
      <div className="w-full max-w-sm px-6">
        <h1 className="text-3xl font-bold tracking-tight text-center mb-2 text-[#1a1715]">
          Clarity
        </h1>
        <p className="text-sm text-[#7a716b] text-center mb-8">
          Enter your API key to access your workspace
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
            className="w-full rounded-xl bg-[#c8553d] py-3 text-sm font-semibold text-white hover:bg-[#b34a35] transition-colors"
          >
            Unlock
          </button>
        </form>
      </div>
    </div>
  );
}
