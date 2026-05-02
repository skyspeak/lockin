import { useGetThoughtsStats, useGetActionsSummary, useListThoughts } from "@workspace/api-client-react";
import { QuickCapture } from "@/components/QuickCapture";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { BrainCircuit, ListTodo, AlertCircle, CheckCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function Dashboard() {
  const { data: stats, isLoading: statsLoading } = useGetThoughtsStats();
  const { data: actionsSummary, isLoading: actionsLoading } = useGetActionsSummary();
  const { data: recentThoughts, isLoading: thoughtsLoading } = useListThoughts({ limit: 5 });

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-3xl font-serif font-semibold mb-2">Good morning.</h1>
        <p className="text-muted-foreground">Clear your mind. Organize your day.</p>
      </div>

      <QuickCapture />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-primary/5 border-primary/20">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-primary">Thoughts Today</CardTitle>
            <BrainCircuit className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-3xl font-bold text-primary">{stats?.recentCount || 0}</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pending Actions</CardTitle>
            <ListTodo className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {actionsLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-3xl font-bold">{actionsSummary?.pending || 0}</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">In Progress</CardTitle>
            <AlertCircle className="h-4 w-4 text-secondary" />
          </CardHeader>
          <CardContent>
            {actionsLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-3xl font-bold text-secondary">{actionsSummary?.inProgress || 0}</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Completed</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {actionsLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-3xl font-bold">{actionsSummary?.done || 0}</div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        <h2 className="text-xl font-serif font-semibold">Recent Thoughts</h2>
        {thoughtsLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}
          </div>
        ) : recentThoughts?.thoughts.length === 0 ? (
          <div className="text-center p-8 border border-dashed rounded-xl text-muted-foreground">
            No thoughts captured yet. Your mind is clear.
          </div>
        ) : (
          <div className="space-y-3">
            {recentThoughts?.thoughts.map(thought => (
              <div key={thought.id} className="p-4 rounded-xl border bg-card hover:bg-accent/50 transition-colors group">
                <p className="text-foreground leading-relaxed mb-3">{thought.content}</p>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant="outline" className="capitalize font-normal text-[10px]">
                    {thought.category.replace("-", " ")}
                  </Badge>
                  <span>•</span>
                  <span>{new Date(thought.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}