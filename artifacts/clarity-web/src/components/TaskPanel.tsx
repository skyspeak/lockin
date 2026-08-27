import { SwipeTask } from "@/components/SwipeTask";

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
  work: { bg: "#ffe0e8", text: "#c73d5c" },
  family: { bg: "#fff0c8", text: "#b07a12" },
  hobbies: { bg: "#eadcff", text: "#6b3db8" },
  extracurriculars: { bg: "#d4f7f2", text: "#1a8f84" },
  other: { bg: "#fde8d8", text: "#9a6e62" },
};

type TaskPanelProps = {
  tasks: TaskItem[];
  isLoading?: boolean;
  onComplete: (id: number) => void;
  onDelete: (id: number) => void;
  onRefineVoice: (id: number) => void;
  onRefineText: (id: number, note: string) => void;
  notes: Record<number, string>;
  onNoteChange: (id: number, note: string) => void;
  refiningId?: number | null;
  isRefining?: boolean;
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
  onDelete,
  onRefineVoice,
  onRefineText,
  notes,
  onNoteChange,
  refiningId = null,
  isRefining = false,
  compact = false,
}: TaskPanelProps) {
  if (isLoading) {
    return (
      <div className="py-8 text-center text-sm text-[#a06d62]">Loading tasks…</div>
    );
  }

  if (tasks.length === 0) {
    return (
      <div className="py-10 text-center">
        <p className="text-sm text-[#a06d62]">Nothing in the pile yet.</p>
        <p className="text-xs text-[#a06d62]/80 mt-1">Speak something into existence.</p>
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
      <p className="px-1 text-[11px] text-[#a06d62]">
        Swipe right to finish · swipe left to delete
      </p>
      {grouped.map((group) => {
        const chip = CATEGORY_COLORS[group.category] ?? CATEGORY_COLORS.other;
        return (
          <section key={group.category}>
            <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-[#a06d62]">
              {CATEGORY_LABELS[group.category] ?? group.category}
            </p>
            <ul className="space-y-2">
              {group.items.map((a) => {
                const listening = refiningId === a.id;
                return (
                  <li key={a.id}>
                    <SwipeTask onDone={() => onComplete(a.id)} onDelete={() => onDelete(a.id)}>
                      <div className="rounded-2xl border border-[#f5d5c4] bg-white p-4">
                        <div className="mb-3 flex items-start justify-between gap-3">
                          <p className="text-[15px] leading-snug font-medium">{a.title}</p>
                          <span
                            className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                            style={{ backgroundColor: chip.bg, color: chip.text }}
                          >
                            {CATEGORY_LABELS[group.category] ?? group.category}
                          </span>
                        </div>
                        {Array.isArray(a.nextSteps) && a.nextSteps.length > 0 && (
                          <ol className="mb-3 ml-4 list-decimal space-y-1">
                            {a.nextSteps.map((step, index) => (
                              <li key={`${a.id}-step-${index}`} className="text-xs text-[#a06d62] leading-snug">
                                {step}
                              </li>
                            ))}
                          </ol>
                        )}
                        <textarea
                          value={notes[a.id] ?? ""}
                          onChange={(e) => onNoteChange(a.id, e.target.value)}
                          onPointerDown={(e) => e.stopPropagation()}
                          placeholder="Type a refinement or paste a transcript…"
                          disabled={isRefining}
                          rows={3}
                          className="mb-2 w-full resize-y rounded-2xl border border-[#f5d5c4] bg-white px-3 py-2 text-sm text-[#3a241e] outline-none focus:border-[#ff5a7a]"
                        />
                        <div className="flex gap-2">
                          <button
                            type="button"
                            disabled={isRefining}
                            onClick={() => onRefineText(a.id, notes[a.id] ?? "")}
                            className="rounded-full border border-[#ff5a7a44] bg-white px-3 py-2 text-xs font-semibold text-[#ff5a7a]"
                          >
                            {isRefining && refiningId === a.id && !listening ? "Refining…" : "Refine"}
                          </button>
                          <button
                            type="button"
                            disabled={isRefining && !listening}
                            onClick={() => onRefineVoice(a.id)}
                            className={`rounded-full border px-3 py-2 text-xs font-semibold ${
                              listening
                                ? "border-[#ff5a7a] bg-[#ff5a7a] text-white"
                                : "border-[#ff5a7a44] bg-white text-[#ff5a7a]"
                            }`}
                          >
                            {listening ? "Tap to stop" : "Speak"}
                          </button>
                        </div>
                      </div>
                    </SwipeTask>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
