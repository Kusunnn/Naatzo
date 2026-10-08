import { useState } from "react";
import { useNavigate, useLocation } from "react-router";
import { useAuth } from "../contexts/AuthContext";
import { useAppMode, AppMode } from "../contexts/AppModeContext";
import {
  Home,
  Calendar,
  Lightbulb,
  MessageSquare,
  Library as LibraryIcon,
  LogOut,
  Moon,
  Sun,
  Users,
  User,
  Menu,
  X,
  Columns3,
} from "lucide-react";
import { useTheme } from "../contexts/ThemeContext";
import { NaatzoLogo } from "./NaatzoLogo";

export function Navbar() {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { mode, setMode } = useAppMode();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const items =
    mode === "individual"
      ? [
          { icon: Home, label: "Inicio", path: "/home" },
          { icon: Calendar, label: "Calendario", path: "/calendar" },
          {
            icon: Lightbulb,
            label: "Recomendaciones",
            path: "/recommendations",
          },
          { icon: LibraryIcon, label: "Biblioteca", path: "/library" },
          { icon: MessageSquare, label: "Chatbot", path: "/chatbot" },
        ]
      : [
          { icon: Home, label: "Inicio", path: "/home" },
          { icon: Users, label: "Proyectos", path: "/projects" },
          { icon: Columns3, label: "Tablero", path: "/board" },
          {
            icon: Calendar,
            label: "Calendario de actividades",
            path: "/team-calendar",
          },
          { icon: MessageSquare, label: "Chatbot", path: "/chatbot" },
        ];
  const active = (path: string) =>
    path === "/projects" || path === "/board"
      ? pathname === path || pathname.startsWith(`${path}/`)
      : pathname === path;
  const switchMode = (next: AppMode) => {
    setMode(next);
    setMenuOpen(false);
    // Shared pages keep their place; each mode owns its other tabs.
    if (!["/home", "/chatbot"].includes(pathname)) navigate("/home");
  };
  const go = (path: string) => {
    setMode(mode);
    const projectId =
      pathname.startsWith("/board/") || pathname.startsWith("/projects/")
        ? pathname.split("/")[2]
        : undefined;
    navigate(
      path === "/team-calendar" && projectId
        ? `${path}?project=${encodeURIComponent(projectId)}`
        : path,
    );
    setMenuOpen(false);
  };
  return (
    <nav className="bg-card border-b border-border sticky top-0 z-50 shadow-sm">
      <div className="max-w-screen-2xl mx-auto px-3 md:px-6">
        <div className="flex items-center h-16 gap-1 sm:gap-3 md:gap-4">
          <button
            onClick={() => go("/home")}
            aria-label="Naatzo, ir al inicio"
            className="flex items-center gap-2 shrink-0"
          >
            <NaatzoLogo showText={false} size="compact" />
            <span className="hidden sm:inline font-bold text-xl text-foreground">
              Naatzo
            </span>
          </button>
          <div
            role="group"
            aria-label="Modo de trabajo"
            className="flex shrink-0 items-center bg-secondary border border-border rounded-xl p-1 gap-0.5"
          >
            {(
              [
                { key: "individual", label: "Individual", icon: User },
                { key: "team", label: "Equipo", icon: Users },
              ] as const
            ).map((item) => (
              <button
                key={item.key}
                aria-pressed={mode === item.key}
                aria-label={item.label}
                onClick={() => switchMode(item.key)}
                className={`flex items-center gap-1.5 px-2.5 md:px-3 py-1.5 rounded-lg text-xs md:text-sm font-semibold transition-colors ${mode === item.key ? "bg-card text-primary shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              >
                <item.icon size={15} strokeWidth={1.7} />
                <span className="hidden sm:inline">{item.label}</span>
                <span className="sm:hidden">
                  {item.key === "individual" ? "Yo" : "Equipo"}
                </span>
              </button>
            ))}
          </div>
          <div className="hidden xl:flex flex-1 items-center gap-0.5">
            {items.map((item) => (
              <button
                key={item.path}
                onClick={() => go(item.path)}
                aria-current={active(item.path) ? "page" : undefined}
                className={`flex items-center gap-2 px-3 py-2 text-sm rounded-lg relative transition-colors ${active(item.path) ? "text-primary" : "text-muted-foreground hover:text-foreground hover:bg-secondary"}`}
              >
                <item.icon size={18} strokeWidth={1.7} />
                <span className="font-medium">{item.label}</span>
                {active(item.path) && (
                  <span className="absolute bottom-0 left-3 right-3 h-0.5 bg-primary rounded-full" />
                )}
              </button>
            ))}
          </div>
          <div className="flex-1 xl:hidden" />
          <button
            className="xl:hidden p-2 text-foreground"
            aria-label="Abrir navegación"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(!menuOpen)}
          >
            {menuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
          <div className="hidden 2xl:block text-right">
            <p className="text-sm text-foreground font-medium">{user?.name}</p>
            <p className="text-xs text-muted-foreground">{user?.email}</p>
          </div>
          <button
            onClick={toggleTheme}
            className="p-1.5 md:p-2 rounded-lg text-muted-foreground hover:bg-secondary"
            title={
              theme === "dark" ? "Activar modo claro" : "Activar modo oscuro"
            }
          >
            {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <button
            onClick={() => {
              logout();
              navigate("/");
            }}
            className="p-1.5 md:p-2 rounded-lg text-muted-foreground hover:bg-secondary"
            title="Cerrar sesión"
          >
            <LogOut size={18} />
          </button>
        </div>
        {menuOpen && (
          <div className="xl:hidden grid grid-cols-2 gap-2 pb-4">
            {items.map((item) => (
              <button
                key={item.path}
                onClick={() => go(item.path)}
                aria-current={active(item.path) ? "page" : undefined}
                className={`flex items-center gap-2 p-3 rounded-lg text-sm ${active(item.path) ? "bg-secondary text-primary" : "text-muted-foreground hover:bg-secondary"}`}
              >
                <item.icon size={18} />
                {item.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </nav>
  );
}
