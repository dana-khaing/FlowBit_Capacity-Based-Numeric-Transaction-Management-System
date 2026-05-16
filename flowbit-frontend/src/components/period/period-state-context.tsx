"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { PERIODS_UPDATED_EVENT, startWorkspaceLiveSync } from "@/components/app/workspace-events";
import { fetchCurrentPeriod, type FlowBitPeriod } from "@/lib/period-client";

type PeriodStateContextValue = {
  activePeriod: FlowBitPeriod | null;
  hasActivePeriod: boolean;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

const PeriodStateContext = createContext<PeriodStateContextValue | null>(null);

type PeriodStateProviderProps = {
  children: ReactNode;
};

export function PeriodStateProvider({ children }: PeriodStateProviderProps) {
  const [activePeriod, setActivePeriod] = useState<FlowBitPeriod | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      const period = await fetchCurrentPeriod();
      setActivePeriod(period);
      setError(null);
    } catch (fetchError) {
      setActivePeriod(null);
      setError(fetchError instanceof Error ? fetchError.message : "Request failed.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const stopWorkspaceSync = startWorkspaceLiveSync();

    function handlePeriodsUpdated() {
      void refresh();
    }

    window.addEventListener(PERIODS_UPDATED_EVENT, handlePeriodsUpdated);
    return () => {
      stopWorkspaceSync();
      window.removeEventListener(PERIODS_UPDATED_EVENT, handlePeriodsUpdated);
    };
  }, [refresh]);

  const value = useMemo<PeriodStateContextValue>(() => ({
    activePeriod,
    hasActivePeriod: Boolean(activePeriod),
    isLoading,
    error,
    refresh,
  }), [activePeriod, error, isLoading, refresh]);

  return <PeriodStateContext.Provider value={value}>{children}</PeriodStateContext.Provider>;
}

export function usePeriodStateContext() {
  return useContext(PeriodStateContext);
}
