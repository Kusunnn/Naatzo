import { Outlet, useLocation, Navigate } from "react-router";
import { useAuth } from "../contexts/AuthContext";
import { Navbar } from "./Navbar";
import { FloatingElephant } from "./FloatingElephant";
import { AppModeProvider, useAppMode } from "../contexts/AppModeContext";

export function Layout() {
  return (
    <AppModeProvider>
      <AppLayout />
    </AppModeProvider>
  );
}

function AppLayout() {
  const { user, isAuthReady } = useAuth();
  const location = useLocation();

  const isAuthPage =
    location.pathname === "/" || location.pathname === "/register" || location.pathname.startsWith('/invite/');
  const { mode } = useAppMode();
  const showFloatingElephant = !isAuthPage && location.pathname !== "/chatbot";

  if (!isAuthReady) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Cargando sesión...</p>
      </div>
    );
  }

  if (!isAuthPage && !user) {
    return <Navigate to="/" replace />;
  }

  if (isAuthPage) {
    return (
      <div className="min-h-screen bg-background">
        <Outlet />
      </div>
    );
  }

  return (
    <div
      className={`min-h-screen bg-background${mode === "team" ? " team-theme" : ""}`}
    >
      <Navbar />
      <main>
        <Outlet />
      </main>
      {showFloatingElephant && <FloatingElephant />}
    </div>
  );
}
