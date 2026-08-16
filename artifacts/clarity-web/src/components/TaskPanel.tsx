import { Check, Mail, MessageSquare, Moon, Trash2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export type TaskItem = {
  id: number;
  title: string;
  status: string;
  priority: string;
  category?: string;
  nextSteps?: string[];
  snoozedUntil?: string | null;
  createdAt: string;
};

const CATEGORY_ORDER = ["work", "family", "hobbies", "extracurriculars", "other"] as const;

const CATEGORY_LABELS: Record<string, string> = {
  work: "Work",
  family: "Family",
  hobbies: "Hobbies",
  extracurriculars: "Extracurriculars",
  other: "Other",
};

const CATEGORY_COLORS: Record<string, { bg: string; text: string }> = {
  work: { bg: "#dbeafe", text: "#1e40af" },
  family: { bg: "#fef3c7", text: "#92400e" },
  hobbies: { bg: "#ede9fe", text: "#6d28d9" },
  extracurriculars: { bg: "#ccfbf1", text: "#134e4a" },
  other: { bg: "#f3f4f6", text: "#374151" },
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

function sortByCategory(tasks: TaskItem[]): TaskItem[] {
  return [...tasks].sort((a, b) => {
    const ai = CATEGORY_ORDER.indexOf((a.category ?? "other") as (typeof CATEGORY_ORDER)[number]);
    const bi = CATEGORY_ORDER.indexOf((b.category ?? "other") as (typeof CATEGORY_ORDER)[number]);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });
}

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

  const grouped = sortByCategory(tasks).reduce<Array<{ category: string; items: TaskItem[] }>>(
    (acc, task) => {
      const category = task.category ?? "other";
      const last = acc[acc.length - 1];
      if (last && last.category === category) {
        last.items.push(task);
      } else {
        acc.push({ category, items: [task] });
      }
      return acc;
    },
    [],
  );

  return (
    <div className={`space-y-4 ${compact ? "max-h-[40vh] overflow-y-auto pr-1" : ""}`}>
      {grouped.map((group) => {
        const chip = CATEGORY_COLORS[group.category] ?? CATEGORY_COLORS.other;
        return (
          <section key={group.category}>
            <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-[#7a716b]">
              {CATEGORY_LABELS[group.category] ?? group.category}
            </p>
            <ul className="space-y-2">
              {group.items.map((a) => (
                <li key={a.id} className="rounded-2xl border border-[#ebe5dd] bg-white p-4">
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <p className="text-[15px] leading-snug font-medium">{a.title}</p>
                    <span
                      className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                      style={{ backgroundColor: chip.bg, color: chip.text }}
                    >
                      {CATEGORY_LABELS[group.category] ?? group.category}
                    </span>
                  </div>
                  {(a.nextSteps ?? []).length > 0 && (
                    <ol className="mb-3 ml-4 list-decimal space-y-1">
                      {(a.nextSteps ?? []).map((step) => (
                        <li key={step} className="text-xs text-[#7a716b] leading-snug">
                          {step}
                        </li>
                      ))}
                    </ol>
                  )}
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
          </section>
        );
      })}
    </div>
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
