import { useState, useCallback, useEffect } from "react";
import { Route, Switch, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { setAuthTokenGetter } from "@workspace/api-client-react";
import { Toaster } from "@/components/ui/toaster";
import Home from "@/pages/Home";
import Login from "@/pages/Login";
import { PrivacyPage, TermsPage } from "@/pages/Legal";
import { AccountBar } from "@/components/AccountBar";
import { ApiKeyContext } from "@/lib/auth-context";

const queryClient = new QueryClient();
const STORAGE_KEY = "clarity_api_key";

function readToken(): string {
  return localStorage.getItem(STORAGE_KEY) || sessionStorage.getItem(STORAGE_KEY) || "";
}

export default function App() {
  const [location] = useLocation();
  const [apiKey, setApiKey] = useState<string>(readToken);

  useEffect(() => {
    if (apiKey) {
      setAuthTokenGetter(() => apiKey);
    } else {
      setAuthTokenGetter(null);
    }
  }, [apiKey]);

  const handleLogin = useCallback((token: string) => {
    localStorage.setItem(STORAGE_KEY, token);
    sessionStorage.removeItem(STORAGE_KEY);
    setApiKey(token);
  }, []);

  const handleLogout = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    sessionStorage.removeItem(STORAGE_KEY);
    setAuthTokenGetter(null);
    setApiKey("");
  }, []);

  if (location === "/privacy") return <PrivacyPage />;
  if (location === "/terms") return <TermsPage />;

  if (!apiKey) {
    return <Login onLogin={handleLogin} />;
  }

  return (
    <ApiKeyContext.Provider value={apiKey}>
      <QueryClientProvider client={queryClient}>
        <AccountBar token={apiKey} onLogout={handleLogout} />
        <Switch>
          <Route path="/" component={Home} />
        </Switch>
        <Toaster />
      </QueryClientProvider>
    </ApiKeyContext.Provider>
  );
}
