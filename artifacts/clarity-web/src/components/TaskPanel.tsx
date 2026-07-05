import { Check, Mail, MessageSquare, Moon, Trash2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export type TaskItem = {
  id: number;
  title: string;
  status: string;
  priority: string;
  snoozedUntil?: string | null;
  createdAt: string;
};

type TaskPanelProps = {
  tasks: TaskItem[];
  isLoading?: boolean;
  onComplete: (id: number) => void;
  onSnooze: (id: number, days: number) => void;
  onDelete: (id: number) => void;
  onEmail: (title: string) => void;
  onText: (title: string) => void;
  compact?: boolean;
};

export function TaskPanel({
  tasks,
  isLoading,
  onComplete,
  onSnooze,
  onDelete,
  onEmail,
  onText,
  compact = false,
}: TaskPanelProps) {
  if (isLoading) {
    return (
      <div className="py-8 text-center text-sm text-[#7a716b]">Loading tasks…</div>
    );
  }

  if (tasks.length === 0) {
    return (
      <div className="py-10 text-center">
        <p className="text-sm text-[#7a716b]">No tasks yet.</p>
        <p className="text-xs text-[#7a716b]/80 mt-1">Speak something to add your first one.</p>
      </div>
    );
  }

  return (
    <ul className={`space-y-2 ${compact ? "max-h-[40vh] overflow-y-auto pr-1" : ""}`}>
      {tasks.map((a) => (
        <li
          key={a.id}
          className="rounded-2xl border border-[#ebe5dd] bg-white p-4"
        >
          <p className="text-[15px] leading-snug font-medium mb-3">{a.title}</p>
          <div className="grid grid-cols-5 gap-2">
            <PillBtn icon={<Check className="h-4 w-4" />} label="Done" tint="#5d7a4a" onClick={() => onComplete(a.id)} />
            <PillBtn icon={<Mail className="h-4 w-4" />} label="Email" tint="#3a6b8a" onClick={() => onEmail(a.title)} />
            <PillBtn icon={<MessageSquare className="h-4 w-4" />} label="Text" tint="#c8553d" onClick={() => onText(a.title)} />
            <Popover>
              <PopoverTrigger asChild>
                <button
                  className="flex items-center justify-center gap-1.5 rounded-lg border bg-white py-2 text-xs font-semibold transition-colors hover:bg-[#b8862c10] active:scale-95"
                  style={{ color: "#b8862c", borderColor: "#b8862c33" }}
                >
                  <Moon className="h-4 w-4" />
                  Snooze
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-36 p-1" align="end">
                <button
                  onClick={() => onSnooze(a.id, 1)}
                  className="w-full text-left rounded-md px-3 py-2 text-sm font-medium hover:bg-[#fbeae5]"
                >
                  1 day
                </button>
                <button
                  onClick={() => onSnooze(a.id, 7)}
                  className="w-full text-left rounded-md px-3 py-2 text-sm font-medium hover:bg-[#fbeae5]"
                >
                  1 week
                </button>
              </PopoverContent>
            </Popover>
            <button
              onClick={() => onDelete(a.id)}
              aria-label="Delete"
              className="flex items-center justify-center gap-1.5 rounded-lg border bg-white py-2 text-xs font-semibold text-[#c0392b] border-[#c0392b33] transition-colors hover:bg-[#c0392b10] active:scale-95"
            >
              <Trash2 className="h-4 w-4" />
              Delete
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}

function PillBtn({
  icon,
  label,
  tint,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  tint: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center justify-center gap-1.5 rounded-lg border bg-white py-2 text-xs font-semibold transition-colors hover:bg-[var(--tint-bg)] active:scale-95"
      style={
        {
          color: tint,
          borderColor: `${tint}33`,
          ["--tint-bg" as string]: `${tint}10`,
        } as React.CSSProperties
      }
    >
      {icon}
      {label}
    </button>
  );
}
