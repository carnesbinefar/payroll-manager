import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AuthState {
  token: string | null;
  email: string | null;
  name: string | null;
  setAuth: (token: string, email: string, name: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      email: null,
      name: null,
      setAuth: (token, email, name) => set({ token, email, name }),
      logout: () => set({ token: null, email: null, name: null }),
    }),
    { name: 'payroll-auth' },
  ),
);
