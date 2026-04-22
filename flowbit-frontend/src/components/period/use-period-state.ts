"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchCurrentPeriod, type FlowBitPeriod } from "@/lib/period-client";

const PERIODS_UPDATED_EVENT = "flowbit:periods-updated";

export function notifyPeriodsUpdated() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(PERIODS_UPDATED_EVENT));
  }
}

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

    function handlePeriodsUpdated() {
      refresh();
    }

    window.addEventListener(PERIODS_UPDATED_EVENT, handlePeriodsUpdated);
    return () => window.removeEventListener(PERIODS_UPDATED_EVENT, handlePeriodsUpdated);
  }, [refresh]);

  return {
    activePeriod,
    hasActivePeriod: Boolean(activePeriod),
    isLoading,
    error,
    refresh,
  };
}
