"use client";

import { useCallback, useEffect, useState } from "react";
import { notifyPeriodsUpdated, PERIODS_UPDATED_EVENT, startWorkspaceLiveSync } from "@/components/app/workspace-events";
import { fetchCurrentPeriod, type FlowBitPeriod } from "@/lib/period-client";

export { notifyPeriodsUpdated };

export function usePeriodState() {
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
    refresh();
    const stopWorkspaceSync = startWorkspaceLiveSync();

    function handlePeriodsUpdated() {
      refresh();
    }

    window.addEventListener(PERIODS_UPDATED_EVENT, handlePeriodsUpdated);
    return () => {
      stopWorkspaceSync();
      window.removeEventListener(PERIODS_UPDATED_EVENT, handlePeriodsUpdated);
    };
  }, [refresh]);

  return {
    activePeriod,
    hasActivePeriod: Boolean(activePeriod),
    isLoading,
    error,
    refresh,
  };
}
