import { createContext, useContext } from "react";

export const ApiKeyContext = createContext<string>("");

export const SessionContext = createContext<{ logout: () => void }>({
  logout: () => {},
});

export function useApiKey(): string {
  return useContext(ApiKeyContext);
}

export function useSession() {
  return useContext(SessionContext);
}
