"use client";

import { useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCalendarDays, faCircleDot, faClock, faLock } from "@fortawesome/free-solid-svg-icons";
import { WorkspaceShell } from "@/components/app/workspace-shell";
import { AdminActionToast } from "@/components/admin/admin-action-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fetchCurrentUser, getStoredUser, type AuthUser } from "@/lib/auth-client";
import { createPeriod, fetchPeriods, type FlowBitPeriod } from "@/lib/period-client";
import { notifyPeriodsUpdated } from "@/components/period/use-period-state";

type ToastState = {
  type: "success" | "error";
  message: string;
} | null;

type PeriodFormState = {
  name: string;
  start_date: string;
  end_date: string;
  close_time: string;
};

const defaultFormState: PeriodFormState = {
  name: "",
  start_date: "",
  end_date: "",
  close_time: "15:00",
};

function formatPeriodDate(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatPeriodRange(period: FlowBitPeriod) {
  return `${formatPeriodDate(period.start_date)} - ${formatPeriodDate(period.end_date)}`;
}

function comparePeriods(left: FlowBitPeriod, right: FlowBitPeriod) {
  return new Date(right.start_date).getTime() - new Date(left.start_date).getTime();
}

export function PeriodPage() {
  const [user, setUser] = useState<AuthUser | null>(getStoredUser());
  const [periods, setPeriods] = useState<FlowBitPeriod[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);
  const [form, setForm] = useState<PeriodFormState>(defaultFormState);

  const activePeriod = useMemo(
    () => periods.find((period) => period.is_open) ?? null,
    [periods],
  );

  const archivedPeriods = useMemo(
    () => periods.filter((period) => !period.is_open),
    [periods],
  );

  const canManagePeriods = user?.role === "admin";

  async function loadPageData() {
    setIsLoading(true);
    try {
      const [nextUser, nextPeriods] = await Promise.all([fetchCurrentUser(), fetchPeriods()]);
      setUser(nextUser);
      setPeriods([...nextPeriods].sort(comparePeriods));
    } catch (error) {
      setToast({
        type: "error",
        message: error instanceof Error ? error.message : "Request failed.",
      });
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadPageData();
  }, []);

  async function handleCreatePeriod(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!form.name.trim() || !form.start_date || !form.end_date) {
      setToast({ type: "error", message: "Name, start date, and end date are required." });
      return;
    }

    setIsSaving(true);
    try {
      await createPeriod({
        name: form.name.trim(),
        start_date: form.start_date,
        end_date: form.end_date,
        close_time: form.close_time || "15:00",
        is_open: true,
      });
      setForm(defaultFormState);
      setToast({ type: "success", message: "Period created successfully." });
      await loadPageData();
      notifyPeriodsUpdated();
    } catch (error) {
      setToast({
        type: "error",
        message: error instanceof Error ? error.message : "Request failed.",
      });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <WorkspaceShell>
      {toast ? <AdminActionToast message={toast.message} type={toast.type} onClose={() => setToast(null)} /> : null}

      <div className="mx-auto w-full max-w-[1800px] px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
        <section className="rounded-[28px] border border-stone-900/8 bg-white px-5 py-6 shadow-[0_8px_24px_rgba(28,24,20,0.04)] sm:px-8 sm:py-8">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-stone-400">Periods</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-[-0.02em] text-stone-950 sm:text-5xl">Period control</h1>
          <p className="mt-4 max-w-3xl text-base leading-7 text-stone-500 sm:text-lg">
            Create the active period term first. Ticket entry, ledgers, spill-over, and ticket history stay locked until an active period exists.
          </p>
        </section>

        <section className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(360px,0.85fr)]">
          <article className="rounded-[28px] border border-stone-900/8 bg-white p-5 shadow-[0_8px_24px_rgba(28,24,20,0.04)] sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-stone-400">Active term</p>
                <h2 className="mt-2 text-2xl font-semibold text-stone-950">Current period</h2>
              </div>
              <span className={`inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] ${
                activePeriod ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
              }`}>
                <FontAwesomeIcon icon={activePeriod ? faCircleDot : faLock} className="h-3 w-3" />
                {activePeriod ? "Active" : "Locked"}
              </span>
            </div>

            <div className="mt-5 rounded-[24px] border border-stone-900/8 bg-[#f3f0ea] p-5">
              {isLoading ? (
                <p className="text-sm text-stone-500">Loading period data...</p>
              ) : activePeriod ? (
                <div className="space-y-4">
                  <div>
                    <p className="text-xl font-semibold text-stone-950">{activePeriod.name}</p>
                    <p className="mt-1 text-sm text-stone-500">{formatPeriodRange(activePeriod)}</p>
                  </div>
                  <div className="flex flex-wrap gap-3 text-sm text-stone-500">
                    <span className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-2">
                      <FontAwesomeIcon icon={faCalendarDays} className="h-3.5 w-3.5" />
                      {formatPeriodDate(activePeriod.start_date)}
                    </span>
                    <span className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-2">
                      <FontAwesomeIcon icon={faClock} className="h-3.5 w-3.5" />
                      Close time {activePeriod.close_time || "15:00"}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-lg font-semibold text-stone-900">No active period yet</p>
                  <p className="text-sm leading-6 text-stone-500">
                    Create the period term here to unlock ticket entry, ledgers, spill-over, and ticket history.
                  </p>
                </div>
              )}
            </div>

            <div className="mt-6">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-stone-400">History</p>
                  <h3 className="mt-2 text-xl font-semibold text-stone-950">Existing periods</h3>
                </div>
                <p className="text-sm text-stone-400">{periods.length} total</p>
              </div>

              <div className="mt-4 space-y-3">
                {isLoading ? (
                  <p className="text-sm text-stone-500">Loading period history...</p>
                ) : periods.length ? (
                  periods.map((period) => (
                    <div
                      key={period.id}
                      className="flex flex-col gap-3 rounded-[22px] border border-stone-900/8 bg-white px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div>
                        <p className="text-base font-semibold text-stone-900">{period.name}</p>
                        <p className="mt-1 text-sm text-stone-500">{formatPeriodRange(period)}</p>
                      </div>
                      <span className={`inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] ${
                        period.is_open ? "bg-emerald-100 text-emerald-700" : "bg-stone-200 text-stone-600"
                      }`}>
                        <FontAwesomeIcon icon={period.is_open ? faCircleDot : faLock} className="h-3 w-3" />
                        {period.is_open ? "Open" : "Closed"}
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-stone-500">No periods have been created yet.</p>
                )}
              </div>
            </div>
          </article>

          <aside className="rounded-[28px] border border-stone-900/8 bg-white p-5 shadow-[0_8px_24px_rgba(28,24,20,0.04)] sm:p-6">
            <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-stone-400">Setup</p>
            <h2 className="mt-2 text-2xl font-semibold text-stone-950">Create a period term</h2>
            <p className="mt-3 text-sm leading-6 text-stone-500">
              Use date-only inputs and set the close time for the period. End-of-day close is usually 15:00.
            </p>

            {canManagePeriods ? (
              <form className="mt-6 space-y-4" onSubmit={handleCreatePeriod}>
                <label className="block space-y-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Period name</span>
                  <Input
                    value={form.name}
                    onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                    placeholder="April 2026 Term"
                    disabled={isSaving}
                  />
                </label>

                <label className="block space-y-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Start date</span>
                  <Input
                    type="date"
                    value={form.start_date}
                    onChange={(event) => setForm((current) => ({ ...current, start_date: event.target.value }))}
                    disabled={isSaving}
                  />
                </label>

                <label className="block space-y-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">End date</span>
                  <Input
                    type="date"
                    value={form.end_date}
                    onChange={(event) => setForm((current) => ({ ...current, end_date: event.target.value }))}
                    disabled={isSaving}
                  />
                </label>

                <label className="block space-y-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Close time</span>
                  <Input
                    type="time"
                    value={form.close_time}
                    onChange={(event) => setForm((current) => ({ ...current, close_time: event.target.value }))}
                    disabled={isSaving}
                  />
                </label>

                <Button type="submit" className="w-full" disabled={isSaving}>
                  {isSaving ? "Creating period..." : "Create period"}
                </Button>
              </form>
            ) : (
              <div className="mt-6 rounded-[24px] border border-stone-900/8 bg-[#f3f0ea] px-5 py-5 text-sm leading-6 text-stone-500">
                Only admin users can create or update periods. You can still review the active period and period history here.
              </div>
            )}

            <div className="mt-6 rounded-[24px] border border-stone-900/8 bg-[#f3f0ea] px-5 py-5 text-sm leading-6 text-stone-500">
              <p className="font-semibold text-stone-900">What unlocks next</p>
              <ul className="mt-3 space-y-2">
                <li>Create Tickets</li>
                <li>Ledgers</li>
                <li>Spill over</li>
                <li>Tickets</li>
              </ul>
            </div>
          </aside>
        </section>
      </div>
    </WorkspaceShell>
  );
}
