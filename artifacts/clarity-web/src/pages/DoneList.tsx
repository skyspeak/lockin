import { useState } from "react";
import { useListActions, useUpdateAction, useDeleteAction } from "@workspace/api-client-react";
import { getListActionsQueryKey, getGetActionQueueQueryKey, getGetActionsSummaryQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2, XCircle, RotateCcw, Trash2 } from "lucide-react";

const CATEGORIES = ["work", "side-projects", "family", "finance", "personal", "health", "other"] as const;
type Category = typeof CATEGORIES[number];

const categoryColors: Record<Category, string> = {
  work: "bg-blue-100 text-blue-800 border-blue-200",
  "side-projects": "bg-purple-100 text-purple-800 border-purple-200",
  family: "bg-amber-100 text-amber-800 border-amber-200",
  finance: "bg-green-100 text-green-800 border-green-200",
  personal: "bg-rose-100 text-rose-800 border-rose-200",
  health: "bg-teal-100 text-teal-800 border-teal-200",
  other: "bg-gray-100 text-gray-700 border-gray-200",
};

export default function DoneList() {
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<"done" | "dismissed">("done");
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const params: Record<string, unknown> = { status: filterStatus, limit: 100 };
  if (filterCategory !== "all") params.category = filterCategory;

  const { data, isLoading } = useListActions(params as Parameters<typeof useListActions>[0]);
  const updateAction = useUpdateAction();
  const deleteAction = useDeleteAction();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getListActionsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetActionQueueQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetActionsSummaryQueryKey() });
  };

  const restore = (id: number) => {
    updateAction.mutate({ id, data: { status: "pending" } }, {
      onSuccess: () => {
        toast({ title: "Moved back to queue" });
        invalidate();
      },
    });
  };

  const remove = (id: number) => {
    deleteAction.mutate({ id }, {
      onSuccess: () => {
        toast({ title: "Removed" });
        invalidate();
      },
    });
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-3xl font-serif font-semibold mb-2">Completed</h1>
        <p className="text-muted-foreground">Done and dismissed actions.</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex gap-1 p-1 bg-muted rounded-lg">
          <button
            onClick={() => setFilterStatus("done")}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${filterStatus === "done" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            <CheckCircle2 className="h-3.5 w-3.5" /> Done
          </button>
          <button
            onClick={() => setFilterStatus("dismissed")}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${filterStatus === "dismissed" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            <XCircle className="h-3.5 w-3.5" /> Dismissed
          </button>
        </div>

        <Select value={filterCategory} onValueChange={setFilterCategory}>
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {CATEGORIES.map((c) => (
              <SelectItem key={c} value={c} className="capitalize">{c.replace("-", " ")}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}
        </div>
      ) : data?.actions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center gap-4 border border-dashed rounded-xl">
          {filterStatus === "done" ? (
            <CheckCircle2 className="h-10 w-10 text-muted-foreground/40" />
          ) : (
            <XCircle className="h-10 w-10 text-muted-foreground/40" />
          )}
          <div>
            <p className="text-lg font-medium text-muted-foreground">
              {filterStatus === "done" ? "Nothing completed yet" : "Nothing dismissed"}
            </p>
            <p className="text-sm text-muted-foreground/70 mt-1">
              {filterStatus === "done" ? "Mark actions as done from the queue." : "Dismiss actions you won't do."}
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {data?.actions.map((action) => (
            <div key={action.id} className="group flex items-start gap-4 p-4 rounded-xl border bg-card opacity-80 hover:opacity-100 transition-all">
              <div className="mt-0.5 shrink-0">
                {action.status === "done" ? (
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                ) : (
                  <XCircle className="h-5 w-5 text-muted-foreground" />
                )}
              </div>

              <div className="flex-1 min-w-0">
                <p className="font-medium text-muted-foreground line-through decoration-muted-foreground/40">{action.title}</p>
                {action.description && (
                  <p className="text-sm text-muted-foreground/60 mt-1 line-clamp-1">{action.description}</p>
                )}
                <div className="flex items-center gap-2 mt-2">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border capitalize ${categoryColors[action.category as Category] || categoryColors.other}`}>
                    {action.category.replace("-", " ")}
                  </span>
                  {action.completedAt && (
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(action.completedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground hover:text-foreground px-2" onClick={() => restore(action.id)}>
                  <RotateCcw className="h-3.5 w-3.5 mr-1" /> Restore
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => remove(action.id)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
