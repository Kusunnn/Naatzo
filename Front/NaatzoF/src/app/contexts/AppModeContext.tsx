import { createContext, useContext, useState, ReactNode } from "react";
import { useLocation } from "react-router";
import { useAuth } from "./AuthContext";

export type AppMode = "individual" | "team";
const Context = createContext<
  { mode: AppMode; setMode: (mode: AppMode) => void } | undefined
>(undefined);
export function AppModeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const key = `naatzo-mode-${user?.id || "guest"}`;
  const [choice, setChoice] = useState<{ key: string; mode: AppMode }>();
  let saved: AppMode = "individual";
  try {
    if (localStorage.getItem(key) === "team") saved = "team";
  } catch {
    /* In-memory mode remains available. */
  }
  const selected = choice?.key === key ? choice.mode : saved;
  const teamRoute =
    pathname === "/projects" ||
    pathname.startsWith("/projects/") ||
    pathname === "/board" ||
    pathname.startsWith("/board/") ||
    pathname === "/team-calendar";
  const personalRoute = ["/calendar", "/recommendations", "/library"].includes(
    pathname,
  );
  const mode = teamRoute ? "team" : personalRoute ? "individual" : selected;
  const setMode = (next: AppMode) => {
    setChoice({ key, mode: next });
    try {
      localStorage.setItem(key, next);
    } catch {
      /* Selection still works without storage. */
    }
  };
  return (
    <Context.Provider value={{ mode, setMode }}>{children}</Context.Provider>
  );
}
export function useAppMode() {
  const value = useContext(Context);
  if (!value) throw new Error("AppModeProvider requerido");
  return value;
}
