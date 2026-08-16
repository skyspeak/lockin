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
  onDelete: (id: number) => void;
  onRefine: (id: number) => void;
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
  onRefine,
  refiningId = null,
  isRefining = false,
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
      <p className="px-1 text-[11px] text-[#7a716b]">
        Swipe right to finish · swipe left to delete
      </p>
      {grouped.map((group) => {
        const chip = CATEGORY_COLORS[group.category] ?? CATEGORY_COLORS.other;
        return (
          <section key={group.category}>
            <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-[#7a716b]">
              {CATEGORY_LABELS[group.category] ?? group.category}
            </p>
            <ul className="space-y-2">
              {group.items.map((a) => {
                const listening = refiningId === a.id;
                return (
                  <li key={a.id}>
                    <SwipeTask onDone={() => onComplete(a.id)} onDelete={() => onDelete(a.id)}>
                      <div className="rounded-2xl border border-[#ebe5dd] bg-white p-4">
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
                        <button
                          type="button"
                          disabled={isRefining && !listening}
                          onClick={() => onRefine(a.id)}
                          className={`rounded-lg border px-3 py-2 text-xs font-semibold ${
                            listening
                              ? "border-[#c8553d] bg-[#c8553d] text-white"
                              : "border-[#c8553d44] bg-white text-[#c8553d]"
                          }`}
                        >
                          {isRefining && listening ? "Refining…" : listening ? "Tap to stop" : "Refine"}
                        </button>
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
