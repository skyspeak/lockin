import { Link, useLocation } from "wouter";
import { Brain, ListTodo, CheckCircle2, Home } from "lucide-react";

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();

  const navItems = [
    { href: "/", label: "Dashboard", icon: Home },
    { href: "/thoughts", label: "Thoughts Log", icon: Brain },
    { href: "/queue", label: "Action Queue", icon: ListTodo },
    { href: "/done", label: "Completed", icon: CheckCircle2 },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col md:flex-row">
      <aside className="w-full md:w-64 border-b md:border-b-0 md:border-r border-border bg-sidebar shrink-0 p-6 flex flex-col gap-8">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-primary text-primary-foreground flex items-center justify-center">
            <Brain className="h-5 w-5" />
          </div>
          <span className="font-serif font-semibold text-xl tracking-tight">Clarity</span>
        </div>

        <nav className="flex md:flex-col gap-2 overflow-x-auto md:overflow-x-visible pb-2 md:pb-0">
          {navItems.map((item) => {
            const isActive = location === item.href;
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href}>
                <div
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap cursor-pointer ${
                    isActive
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground"
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {item.label}
                </div>
              </Link>
            );
          })}
        </nav>
      </aside>

      <main className="flex-1 max-w-5xl mx-auto w-full p-6 md:p-12 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}