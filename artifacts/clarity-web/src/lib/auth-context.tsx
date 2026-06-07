import { createContext, useContext } from "react";

export const ApiKeyContext = createContext<string>("");

export function useApiKey(): string {
  return useContext(ApiKeyContext);
}
