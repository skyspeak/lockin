import { Link, useRoute } from "wouter";
import { useEffect } from "react";
import { formatDistanceToNow } from "date-fns";
import { Loader2, ArrowLeft, CalendarClock } from "lucide-react";
import {
  useGetFollowUpPlan,
  useToggleFollowUpTodo,
  getListFollowUpPlansUrl,
  getGetFollowUpPlanQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Checkbox } from "@/components/ui/checkbox";

export default function FollowUpDetail() {
  const [, params] = useRoute("/follow-ups/:id");
  const id = Number(params?.id);
  const qc = useQueryClient();
  const listKey = getListFollowUpPlansUrl();

  const planId = Number.isInteger(id) && id > 0 ? id : 0;
  const { data: plan, isLoading, refetch } = useGetFollowUpPlan(planId);

  useEffect(() => {
    if (plan?.status !== "generating") return;
    const timer = setInterval(() => {
      void refetch();
    }, 3000);
    return () => clearInterval(timer);
  }, [plan?.status, refetch]);

  const toggleTodo = useToggleFollowUpTodo({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: [listKey] });
        qc.invalidateQueries({ queryKey: getGetFollowUpPlanQueryKey(planId) });
      },
    },
  });

  if (isLoading || !plan) {
    return (
      <div className="min-h-screen bg-[#fdfbf7] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#c8553d]" />
      </div>
    );
  }

  const toggle = (todoId: string, done: boolean) => {
    toggleTodo.mutate({ id: planId, todoId, data: { done } });
  };

  return (
    <div className="min-h-screen bg-[#fdfbf7] text-[#1a1715]">
      <div className="mx-auto max-w-xl px-6 pt-12 pb-24">
        <Link
          href="/follow-ups"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#c8553d] hover:text-[#a8412e] mb-8"
        >
          <ArrowLeft className="h-4 w-4" />
          All follow-ups
        </Link>

        <header className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#7a716b] mb-2">
            Original task
          </p>
          <h1 className="text-2xl font-bold leading-snug">{plan.actionTitle}</h1>
          <p className="mt-2 text-sm text-[#7a716b]">
            {formatDistanceToNow(new Date(plan.createdAt), { addSuffix: true })}
          </p>
        </header>

        {plan.status === "generating" && (
          <div className="flex items-center gap-3 rounded-2xl border border-[#ebe5dd] bg-white p-6 mb-6">
            <Loader2 className="h-5 w-5 animate-spin text-[#c8553d]" />
            <p className="text-sm text-[#7a716b]">Building your follow-up plan…</p>
          </div>
        )}

        {plan.status === "failed" && (
          <div className="rounded-2xl border border-[#c0392b33] bg-[#c0392b08] p-4 mb-6">
            <p className="text-sm text-[#c0392b]">
              {plan.errorMessage ?? "Failed to generate follow-up plan."}
            </p>
          </div>
        )}

        {plan.summary && (
          <section className="mb-8">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-[#7a716b] mb-3">
              Summary
            </h2>
            <p className="text-[15px] leading-relaxed">{plan.summary}</p>
          </section>
        )}

        {plan.steps.length > 0 && (
          <section className="mb-8">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-[#7a716b] mb-3">
              Action plan
            </h2>
            <ol className="space-y-3">
              {plan.steps.map((step, index) => (
                <li
                  key={index}
                  className="flex gap-3 rounded-xl border border-[#ebe5dd] bg-white p-4"
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#c8553d] text-xs font-bold text-white">
                    {index + 1}
                  </span>
                  <p className="text-[15px] leading-snug pt-0.5">{step}</p>
                </li>
              ))}
            </ol>
          </section>
        )}

        {plan.userTodos.length > 0 && (
          <section className="mb-8">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-[#7a716b] mb-3">
              Your TODOs
            </h2>
            <ul className="space-y-2">
              {plan.userTodos.map((todo) => (
                <li
                  key={todo.id}
                  className="flex items-start gap-3 rounded-xl border border-[#ebe5dd] bg-white p-4"
                >
                  <Checkbox
                    id={todo.id}
                    checked={todo.done}
                    disabled={toggleTodo.isPending}
                    onCheckedChange={(checked) => toggle(todo.id, checked === true)}
                    className="mt-0.5 border-[#c8553d] data-[state=checked]:bg-[#c8553d] data-[state=checked]:border-[#c8553d]"
                  />
                  <label
                    htmlFor={todo.id}
                    className={`text-[15px] leading-snug cursor-pointer ${todo.done ? "line-through text-[#7a716b]" : ""}`}
                  >
                    {todo.text}
                  </label>
                </li>
              ))}
            </ul>
          </section>
        )}

        {plan.checkInHint && (
          <section className="rounded-2xl border border-[#b8862c33] bg-[#b8862c10] p-4">
            <div className="flex gap-3">
              <CalendarClock className="h-5 w-5 shrink-0 text-[#b8862c]" />
              <div>
                <h2 className="text-sm font-semibold text-[#b8862c] mb-1">Check-in hint</h2>
                <p className="text-sm leading-relaxed">{plan.checkInHint}</p>
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
