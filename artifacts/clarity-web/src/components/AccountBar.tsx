import { Link } from "wouter";

export function AccountBar({ onLogout }: { onLogout: () => void }) {
  return (
    <div className="w-full border-b border-[#ebe5dd] bg-[#fdfbf7]/90 backdrop-blur-sm">
      <div className="mx-auto flex max-w-xl items-center justify-between gap-3 px-6 py-3">
        <nav className="flex items-center gap-4 text-sm font-semibold">
          <Link href="/" className="text-[#1a1715] hover:text-[#c8553d]">
            Tasks
          </Link>
          <Link href="/follow-ups" className="text-[#7a716b] hover:text-[#c8553d]">
            Follow-ups
          </Link>
        </nav>
        <button
          type="button"
          onClick={onLogout}
          className="text-sm font-semibold text-[#c0392b] hover:text-[#922b21]"
        >
          Log out
        </button>
      </div>
    </div>
  );
}
