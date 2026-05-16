"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  fetchNotificationSummary,
  FLOWBIT_NOTIFICATIONS_UPDATED_EVENT,
  startNotificationsLiveSync,
  type FlowBitNotificationSummary,
} from "@/lib/notification-client";

type NotificationSummaryContextValue = {
  summary: FlowBitNotificationSummary;
  refreshSummary: () => Promise<FlowBitNotificationSummary | null>;
};

const emptySummary: FlowBitNotificationSummary = {
  unread_count: 0,
  recent: [],
};

const NotificationSummaryContext = createContext<NotificationSummaryContextValue | null>(null);

type NotificationSummaryProviderProps = {
  children: ReactNode;
};

export function NotificationSummaryProvider({ children }: NotificationSummaryProviderProps) {
  const [summary, setSummary] = useState<FlowBitNotificationSummary>(emptySummary);

  const refreshSummary = useCallback(async () => {
    try {
      const nextSummary = await fetchNotificationSummary();
      setSummary(nextSummary);
      return nextSummary;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    void refreshSummary();
    const stopLiveSync = startNotificationsLiveSync();
    function handleNotificationsUpdated() {
      void refreshSummary();
    }

    window.addEventListener(FLOWBIT_NOTIFICATIONS_UPDATED_EVENT, handleNotificationsUpdated);
    return () => {
      window.removeEventListener(FLOWBIT_NOTIFICATIONS_UPDATED_EVENT, handleNotificationsUpdated);
      stopLiveSync();
    };
  }, [refreshSummary]);

  const value = useMemo<NotificationSummaryContextValue>(() => ({
    summary,
    refreshSummary,
  }), [refreshSummary, summary]);

  return <NotificationSummaryContext.Provider value={value}>{children}</NotificationSummaryContext.Provider>;
}

export function useNotificationSummaryState() {
  return useContext(NotificationSummaryContext);
}
