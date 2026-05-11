"use client";

import { useEffect, useState } from "react";
import { AdminActionToast } from "@/components/admin/admin-action-toast";
import { fetchPendingOverflowPage } from "@/lib/overflow-client";
import { fetchCurrentPeriod } from "@/lib/period-client";

type ToastState = {
  title: string;
  message: string;
} | null;

const THIRTY_MINUTES_MS = 30 * 60 * 1000;
const CHECK_INTERVAL_MS = 60 * 1000;

function buildStorageKey(periodId: number, endDate: string, pendingCount: number) {
  return `flowbit:pre-close-overflow-toast:${periodId}:${endDate}:${pendingCount}`;
}

export function PreCloseOverflowToast() {
  const [toast, setToast] = useState<ToastState>(null);

  useEffect(() => {
    let cancelled = false;

    async function checkPreCloseOverflow() {
      try {
        const period = await fetchCurrentPeriod();
        if (!period || cancelled) {
          return;
        }

        const periodEnd = new Date(period.end_date).getTime();
        if (Number.isNaN(periodEnd)) {
          return;
        }

        const remaining = periodEnd - Date.now();
        if (remaining <= 0 || remaining > THIRTY_MINUTES_MS) {
          return;
        }

        const pendingPage = await fetchPendingOverflowPage({
          periodId: period.id,
          page: 1,
          pageSize: 1,
        });
        if (cancelled || pendingPage.count <= 0) {
          return;
        }

        const storageKey = buildStorageKey(period.id, period.end_date, pendingPage.count);
        if (typeof window !== "undefined" && window.sessionStorage.getItem(storageKey) === "seen") {
          return;
        }

        setToast({
          title: "Period closing soon",
          message: `${pendingPage.count} pending spill over ${pendingPage.count === 1 ? "item remains" : "items remain"} before ${period.name} closes.`,
        });

        if (typeof window !== "undefined") {
          window.sessionStorage.setItem(storageKey, "seen");
        }
      } catch {
        // Ignore background reminder errors.
      }
    }

    checkPreCloseOverflow();
    const intervalId = window.setInterval(checkPreCloseOverflow, CHECK_INTERVAL_MS);
    window.addEventListener("focus", checkPreCloseOverflow);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      window.removeEventListener("focus", checkPreCloseOverflow);
    };
  }, []);

  if (!toast) {
    return null;
  }

  return (
    <AdminActionToast
      message={toast.message}
      type="warning"
      title={toast.title}
      onClose={() => setToast(null)}
    />
  );
}
