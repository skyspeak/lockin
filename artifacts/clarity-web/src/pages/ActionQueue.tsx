import { useState } from "react";
import { useGetActionQueue, useUpdateAction, useCreateAction, useDeleteAction, useGetActionsSummary } from "@workspace/api-client-react";
import { getGetActionQueueQueryKey, getGetActionsSummaryQueryKey, getListActionsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2, Circle, Loader, XCircle, Plus, ListTodo, Trash2 } from "lucide-react";

const CATEGORIES = ["work", "side-projects", "family", "finance", "personal", "health", "other"] as const;
type Category = typeof CATEGORIES[number];
type Priority = "low" | "medium" | "high";

const priorityColors: Record<Priority, string> = {
  high: "text-red-600 bg-red-50 border-red-200",
  medium: "text-amber-600 bg-amber-50 border-amber-200",
  low: "text-green-600 bg-green-50 border-green-200",
};

const categoryColors: Record<Category, string> = {
  work: "bg-blue-100 text-blue-800 border-blue-200",
  "side-projects": "bg-purple-100 text-purple-800 border-purple-200",
  family: "bg-amber-100 text-amber-800 border-amber-200",
  finance: "bg-green-100 text-green-800 border-green-200",
  personal: "bg-rose-100 text-rose-800 border-rose-200",
  health: "bg-teal-100 text-teal-800 border-teal-200",
  other: "bg-gray-100 text-gray-700 border-gray-200",
};

export default function ActionQueue() {
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newCategory, setNewCategory] = useState<Category>("work");
  const [newPriority, setNewPriority] = useState<Priority>("medium");

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const params = filterCategory !== "all" ? { category: filterCategory as Category } : {};
  const { data, isLoading } = useGetActionQueue(params as Parameters<typeof useGetActionQueue>[0]);
  const { data: summary } = useGetActionsSummary();
  const updateAction = useUpdateAction();
  const createAction = useCreateAction();
  const deleteAction = useDeleteAction();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getGetActionQueueQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetActionsSummaryQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListActionsQueryKey() });
  };

  const setStatus = (id: number, status: "pending" | "in-progress" | "done" | "dismissed") => {
    updateAction.mutate({ id, data: { status } }, {
      onSuccess: () => {
        toast({ title: status === "done" ? "Marked as done" : `Moved to ${status}` });
        invalidate();
      },
    });
  };

  const handleAdd = () => {
    if (!newTitle.trim()) return;
    createAction.mutate({ data: { title: newTitle, description: newDescription || undefined, category: newCategory, priority: newPriority } }, {
      onSuccess: () => {
        toast({ title: "Action added" });
        setShowAddDialog(false);
        setNewTitle("");
        setNewDescription("");
        invalidate();
      },
    });
  };

  const handleDelete = (id: number) => {
    deleteAction.mutate({ id }, {
      onSuccess: () => {
        toast({ title: "Action removed" });
        invalidate();
      },
    });
  };

  const inProgress = data?.queue.filter((a) => a.status === "in-progress") || [];
  const pending = data?.queue.filter((a) => a.status === "pending") || [];

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-serif font-semibold mb-2">Action Queue</h1>
          <p className="text-muted-foreground">
            {summary ? `${summary.pending} pending, ${summary.inProgress} in progress` : "Your prioritized to-do list."}
          </p>
        </div>
        <Button onClick={() => setShowAddDialog(true)} className="shrink-0">
          <Plus className="h-4 w-4 mr-2" />
          Add Action
        </Button>
      </div>

      <div className="flex gap-3">
        <Select value={filterCategory} onValueChange={setFilterCategory}>
          <SelectTrigger className="w-44">
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
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}
        </div>
      ) : data?.queue.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center gap-4 border border-dashed rounded-xl">
          <ListTodo className="h-10 w-10 text-muted-foreground/40" />
          <div>
            <p className="text-lg font-medium text-muted-foreground">Queue is clear</p>
            <p className="text-sm text-muted-foreground/70 mt-1">Add actions or capture thoughts and extract them.</p>
          </div>
        </div>
      ) : (
        <div className="space-y-8">
          {inProgress.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                <Loader className="h-3.5 w-3.5 animate-spin" /> In Progress
              </h2>
              <ActionList actions={inProgress} onSetStatus={setStatus} onDelete={handleDelete} />
            </section>
          )}

          {pending.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                <Circle className="h-3.5 w-3.5" /> Pending
              </h2>
              <ActionList actions={pending} onSetStatus={setStatus} onDelete={handleDelete} />
            </section>
          )}
        </div>
      )}

      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-serif">Add Action</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <Input placeholder="What needs to be done?" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} />
            <Textarea placeholder="Details (optional)" value={newDescription} onChange={(e) => setNewDescription(e.target.value)} className="resize-none" rows={3} />
            <div className="grid grid-cols-2 gap-3">
              <Select value={newCategory} onValueChange={(v) => setNewCategory(v as Category)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c} className="capitalize">{c.replace("-", " ")}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={newPriority} onValueChange={(v) => setNewPriority(v as Priority)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="high">High priority</SelectItem>
                  <SelectItem value="medium">Medium priority</SelectItem>
                  <SelectItem value="low">Low priority</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>Cancel</Button>
            <Button onClick={handleAdd} disabled={!newTitle.trim() || createAction.isPending}>Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ActionList({
  actions,
  onSetStatus,
  onDelete,
}: {
  actions: Array<{ id: number; title: string; description?: string | null; category: string; status: string; priority: string }>;
  onSetStatus: (id: number, status: "pending" | "in-progress" | "done" | "dismissed") => void;
  onDelete: (id: number) => void;
}) {
  return (
    <div className="space-y-2">
      {actions.map((action) => (
        <div key={action.id} className="group flex items-start gap-4 p-4 rounded-xl border bg-card hover:shadow-sm transition-all duration-200">
          <button
            onClick={() => onSetStatus(action.id, action.status === "in-progress" ? "done" : "in-progress")}
            className="mt-0.5 shrink-0 text-muted-foreground hover:text-primary transition-colors"
          >
            {action.status === "in-progress" ? (
              <CheckCircle2 className="h-5 w-5 text-primary" />
            ) : (
              <Circle className="h-5 w-5" />
            )}
          </button>

          <div className="flex-1 min-w-0">
            <p className="font-medium text-foreground">{action.title}</p>
            {action.description && (
              <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{action.description}</p>
            )}
            <div className="flex items-center gap-2 mt-2">
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border capitalize ${categoryColors[action.category as Category] || categoryColors.other}`}>
                {action.category.replace("-", " ")}
              </span>
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border capitalize ${priorityColors[action.priority as Priority] || priorityColors.medium}`}>
                {action.priority}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
            {action.status === "pending" && (
              <Button
                variant="ghost" size="sm"
                className="h-7 text-xs text-muted-foreground hover:text-primary px-2"
                onClick={() => onSetStatus(action.id, "in-progress")}
              >
                Start
              </Button>
            )}
            <Button
              variant="ghost" size="sm"
              className="h-7 text-xs text-muted-foreground hover:text-foreground px-2"
              onClick={() => onSetStatus(action.id, "dismissed")}
            >
              <XCircle className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost" size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-destructive"
              onClick={() => onDelete(action.id)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
