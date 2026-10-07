import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { apiRequest } from '../services/api';

interface User {
  id: string;
  name: string;
  email: string;
}

interface AuthContextType {
  user: User | null;
  isAuthReady: boolean;
  login: (email: string, password: string) => Promise<boolean>;
  register: (name: string, email: string, password: string) => Promise<boolean>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);

  useEffect(() => {
    // Preserve the saved session when upgrading from the previous brand.
    const legacyKey = 'kibo-user';
    const raw = localStorage.getItem('naatzo-user') ?? localStorage.getItem(legacyKey);
    if (raw) {
      try {
        setUser(JSON.parse(raw) as User);
        localStorage.setItem('naatzo-user', raw);
      } catch {
        localStorage.removeItem('naatzo-user');
      }
    }
    localStorage.removeItem(legacyKey);
    setIsAuthReady(true);
  }, []);

  const login = async (email: string, password: string) => {
    if (!email || !password) {
      return false;
    }

    try {
      const payload = await apiRequest<{ user: User }>('/auth/login', {
        method: 'POST',
        body: { email, password },
      });

      setUser(payload.user);
      localStorage.setItem('naatzo-user', JSON.stringify(payload.user));
      return true;
    } catch {
      return false;
    }
  };

  const register = async (name: string, email: string, password: string) => {
    if (!name || !email || !password) {
      return false;
    }

    try {
      const payload = await apiRequest<{ user: User }>('/auth/register', {
        method: 'POST',
        body: { name, email, password },
      });

      setUser(payload.user);
      localStorage.setItem('naatzo-user', JSON.stringify(payload.user));
      return true;
    } catch {
      return false;
    }
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('naatzo-user');
  };

  return (
    <AuthContext.Provider value={{ user, isAuthReady, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
