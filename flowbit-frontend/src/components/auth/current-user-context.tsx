"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { fetchCurrentUser, getStoredUser, type AuthUser } from "@/lib/auth-client";

type CurrentUserContextValue = {
  user: AuthUser | null;
  refreshUser: () => Promise<AuthUser | null>;
};

const CurrentUserContext = createContext<CurrentUserContextValue | null>(null);

type CurrentUserProviderProps = {
  children: ReactNode;
};

export function CurrentUserProvider({ children }: CurrentUserProviderProps) {
  const [user, setUser] = useState<AuthUser | null>(getStoredUser());

  const refreshUser = useCallback(async () => {
    try {
      const nextUser = await fetchCurrentUser();
      setUser(nextUser);
      return nextUser;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    const storedUser = getStoredUser();
    setUser(storedUser);
    if (!storedUser) {
      void refreshUser();
    }
  }, [refreshUser]);

  const value = useMemo<CurrentUserContextValue>(() => ({
    user,
    refreshUser,
  }), [refreshUser, user]);

  return <CurrentUserContext.Provider value={value}>{children}</CurrentUserContext.Provider>;
}

export function useCurrentUserState() {
  return useContext(CurrentUserContext);
}
