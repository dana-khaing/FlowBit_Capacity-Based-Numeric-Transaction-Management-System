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
export const CURRENT_USER_UPDATED_EVENT = "flowbit:current-user-updated";

function persistUser(nextUser: AuthUser | null) {
  if (typeof window === "undefined") {
    return;
  }
  if (nextUser) {
    window.localStorage.setItem(AUTH_USER_STORAGE_KEY, JSON.stringify(nextUser));
    return;
  }
  window.localStorage.removeItem(AUTH_USER_STORAGE_KEY);
}

export function dispatchCurrentUserUpdated(nextUser: AuthUser | null) {
  if (typeof window === "undefined") {
    return;
  }
  persistUser(nextUser);
  window.dispatchEvent(new CustomEvent<AuthUser | null>(CURRENT_USER_UPDATED_EVENT, { detail: nextUser }));
}

type CurrentUserProviderProps = {
  children: ReactNode;
};

export function CurrentUserProvider({ children }: CurrentUserProviderProps) {
  const [user, setUser] = useState<AuthUser | null>(getStoredUser());

  const applyUser = useCallback((nextUser: AuthUser | null) => {
    setUser(nextUser);
    persistUser(nextUser);
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
    void refreshUser();
  }, [applyUser, refreshUser]);

  useEffect(() => {
    function handleCurrentUserUpdated(event: Event) {
      const customEvent = event as CustomEvent<AuthUser | null>;
      applyUser(customEvent.detail ?? null);
    }

    window.addEventListener(CURRENT_USER_UPDATED_EVENT, handleCurrentUserUpdated);
    return () => window.removeEventListener(CURRENT_USER_UPDATED_EVENT, handleCurrentUserUpdated);
  }, [applyUser]);

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
