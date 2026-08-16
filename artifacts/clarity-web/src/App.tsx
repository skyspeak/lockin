import { useState, useCallback, useEffect } from "react";
import { Route, Switch } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { setAuthTokenGetter } from "@workspace/api-client-react";
import { Toaster } from "@/components/ui/toaster";
import Home from "@/pages/Home";
import Login from "@/pages/Login";
import { AccountBar } from "@/components/AccountBar";
import { ApiKeyContext } from "@/lib/auth-context";

const queryClient = new QueryClient();
const STORAGE_KEY = "clarity_api_key";

export default function App() {
  const [apiKey, setApiKey] = useState<string>(
    () => sessionStorage.getItem(STORAGE_KEY) ?? "",
  );

  useEffect(() => {
    if (apiKey) {
      setAuthTokenGetter(() => apiKey);
    } else {
      setAuthTokenGetter(null);
    }
  }, [apiKey]);

  const handleLogin = useCallback((key: string) => {
    sessionStorage.setItem(STORAGE_KEY, key);
    setApiKey(key);
  }, []);

  const handleLogout = useCallback(() => {
    sessionStorage.removeItem(STORAGE_KEY);
    setAuthTokenGetter(null);
    setApiKey("");
  }, []);

  if (!apiKey) {
    return <Login onLogin={handleLogin} />;
  }

  return (
    <ApiKeyContext.Provider value={apiKey}>
      <QueryClientProvider client={queryClient}>
        <AccountBar onLogout={handleLogout} />
        <Switch>
          <Route path="/" component={Home} />
        </Switch>
        <Toaster />
      </QueryClientProvider>
    </ApiKeyContext.Provider>
  );
}
