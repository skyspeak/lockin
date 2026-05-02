import { useState } from "react";
import { useListThoughts, useDeleteThought, useUpdateThought } from "@workspace/api-client-react";
import { getListThoughtsQueryKey, getGetThoughtsStatsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Trash2, Pencil, Search, Brain } from "lucide-react";

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

export default function ThoughtsLog() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [editingThought, setEditingThought] = useState<{ id: number; content: string; category: Category } | null>(null);
  const [editContent, setEditContent] = useState("");
  const [editCategory, setEditCategory] = useState<Category>("other");

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const params: Record<string, unknown> = { limit: 100 };
  if (category !== "all") params.category = category;
  if (search) params.search = search;

  const { data, isLoading } = useListThoughts(params as Parameters<typeof useListThoughts>[0]);
  const deleteThought = useDeleteThought();
  const updateThought = useUpdateThought();

  const handleDelete = (id: number) => {
    deleteThought.mutate({ id }, {
      onSuccess: () => {
        toast({ title: "Thought deleted" });
        queryClient.invalidateQueries({ queryKey: getListThoughtsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetThoughtsStatsQueryKey() });
      },
    });
  };

  const openEdit = (thought: { id: number; content: string; category: Category }) => {
    setEditingThought(thought);
    setEditContent(thought.content);
    setEditCategory(thought.category);
  };

  const handleUpdate = () => {
    if (!editingThought) return;
    updateThought.mutate({ id: editingThought.id, data: { content: editContent, category: editCategory } }, {
      onSuccess: () => {
        toast({ title: "Thought updated" });
        queryClient.invalidateQueries({ queryKey: getListThoughtsQueryKey() });
        setEditingThought(null);
      },
    });
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-3xl font-serif font-semibold mb-2">Thought Log</h1>
        <p className="text-muted-foreground">Everything you've captured, organized.</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search thoughts..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={category} onValueChange={setCategory}>
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
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}
        </div>
      ) : data?.thoughts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center gap-4 border border-dashed rounded-xl">
          <Brain className="h-10 w-10 text-muted-foreground/40" />
          <div>
            <p className="text-lg font-medium text-muted-foreground">No thoughts here</p>
            <p className="text-sm text-muted-foreground/70 mt-1">Capture something from the dashboard.</p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {data?.thoughts.map((thought) => (
            <div
              key={thought.id}
              className="group p-5 rounded-xl border bg-card hover:shadow-sm transition-all duration-200"
            >
              <div className="flex items-start justify-between gap-4">
                <p className="text-foreground leading-relaxed flex-1">{thought.content}</p>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-foreground"
                    onClick={() => openEdit({ id: thought.id, content: thought.content, category: thought.category as Category })}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    onClick={() => handleDelete(thought.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              <div className="flex items-center gap-2 mt-3 text-xs text-muted-foreground">
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border capitalize ${categoryColors[thought.category as Category] || categoryColors.other}`}>
                  {thought.category.replace("-", " ")}
                </span>
                <span>•</span>
                <span>{new Date(thought.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!editingThought} onOpenChange={(open) => !open && setEditingThought(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-serif">Edit Thought</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <Textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              className="min-h-[100px] resize-none"
            />
            <Select value={editCategory} onValueChange={(v) => setEditCategory(v as Category)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c} className="capitalize">{c.replace("-", " ")}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingThought(null)}>Cancel</Button>
            <Button onClick={handleUpdate} disabled={updateThought.isPending}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
