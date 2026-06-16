import { Link } from "wouter";
import { useEffect } from "react";
import { formatDistanceToNow } from "date-fns";
import { Loader2, ChevronRight } from "lucide-react";
import { useListFollowUpPlans } from "@workspace/api-client-react";

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    generating: "bg-[#b8862c20] text-[#b8862c]",
    ready: "bg-[#5d7a4a20] text-[#5d7a4a]",
    failed: "bg-[#c0392b20] text-[#c0392b]",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${styles[status] ?? "bg-[#ebe5dd] text-[#7a716b]"}`}
    >
      {status === "generating" && <Loader2 className="h-3 w-3 animate-spin" />}
      {status}
    </span>
  );
}

export default function FollowUps() {
  const { data, isLoading, refetch } = useListFollowUpPlans();
  const plans = data?.plans ?? [];
  const hasGenerating = plans.some((p) => p.status === "generating");

  useEffect(() => {
    if (!hasGenerating) return;
    const timer = setInterval(() => {
      void refetch();
    }, 3000);
    return () => clearInterval(timer);
  }, [hasGenerating, refetch]);

  return (
    <div className="min-h-screen bg-[#fdfbf7] text-[#1a1715]">
      <div className="mx-auto max-w-xl px-6 pt-12 pb-24">
        <header className="mb-8 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Follow-ups</h1>
            <p className="mt-1 text-sm text-[#7a716b]">
              Action plans generated from your captured tasks
            </p>
          </div>
          <Link
            href="/"
            className="text-sm font-semibold text-[#c8553d] hover:text-[#a8412e] shrink-0 pt-1"
          >
            Queue
          </Link>
        </header>

        <ul className="space-y-3">
          {plans.map((plan) => (
            <li key={plan.id}>
              <Link href={`/follow-ups/${plan.id}`}>
                <article className="rounded-2xl border border-[#ebe5dd] bg-white p-4 transition-colors hover:border-[#c8553d44] cursor-pointer">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <p className="text-[15px] font-semibold leading-snug">{plan.actionTitle}</p>
                    <StatusBadge status={plan.status} />
                  </div>
                  {plan.summary && (
                    <p className="text-sm text-[#7a716b] leading-relaxed mb-3 line-clamp-2">
                      {plan.summary}
                    </p>
                  )}
                  {plan.status === "failed" && plan.errorMessage && (
                    <p className="text-sm text-[#c0392b] mb-3">{plan.errorMessage}</p>
                  )}
                  <div className="flex items-center justify-between text-xs text-[#7a716b]">
                    <span>
                      {formatDistanceToNow(new Date(plan.createdAt), { addSuffix: true })}
                    </span>
                    <ChevronRight className="h-4 w-4 text-[#c8553d]" />
                  </div>
                </article>
              </Link>
            </li>
          ))}
          {!isLoading && plans.length === 0 && (
            <li className="text-center text-sm text-[#7a716b] py-12">
              No follow-up plans yet. Capture a task and one will appear here.
            </li>
          )}
          {isLoading && (
            <li className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-[#c8553d]" />
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}
