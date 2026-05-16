"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { fetchCurrentUser, getStoredUser, type AuthUser } from "@/lib/auth-client";
import { AUTH_USER_STORAGE_KEY } from "@/lib/auth";

type CurrentUserContextValue = {
  user: AuthUser | null;
  refreshUser: () => Promise<AuthUser | null>;
  applyUser: (user: AuthUser | null) => void;
};

const CurrentUserContext = createContext<CurrentUserContextValue | null>(null);

type CurrentUserProviderProps = {
  children: ReactNode;
};

export function CurrentUserProvider({ children }: CurrentUserProviderProps) {
  const [user, setUser] = useState<AuthUser | null>(getStoredUser());

  const applyUser = useCallback((nextUser: AuthUser | null) => {
    setUser(nextUser);
    if (typeof window === "undefined") {
      return;
    }
    if (nextUser) {
      window.localStorage.setItem(AUTH_USER_STORAGE_KEY, JSON.stringify(nextUser));
      return;
    }
    window.localStorage.removeItem(AUTH_USER_STORAGE_KEY);
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const nextUser = await fetchCurrentUser();
      applyUser(nextUser);
      return nextUser;
    } catch {
      return null;
    }
  }, [applyUser]);

  useEffect(() => {
    const storedUser = getStoredUser();
    applyUser(storedUser);
    if (!storedUser) {
      void refreshUser();
    }
  }, [applyUser, refreshUser]);

  const value = useMemo<CurrentUserContextValue>(() => ({
    user,
    refreshUser,
    applyUser,
  }), [applyUser, refreshUser, user]);

  return <CurrentUserContext.Provider value={value}>{children}</CurrentUserContext.Provider>;
}

export function useCurrentUserState() {
  return useContext(CurrentUserContext);
}
