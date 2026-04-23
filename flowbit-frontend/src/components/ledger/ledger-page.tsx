"use client";

import { useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowDownWideShort,
  faCircleDot,
  faClock,
  faLayerGroup,
  faLock,
  faPlus,
} from "@fortawesome/free-solid-svg-icons";
import { AdminConfirmModal } from "@/components/admin/admin-confirm-modal";
import { AdminActionToast } from "@/components/admin/admin-action-toast";
import { WorkspaceShell } from "@/components/app/workspace-shell";
import { usePeriodState } from "@/components/period/use-period-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fetchCurrentUser, getStoredUser, type AuthUser } from "@/lib/auth-client";
import {
  closeLedger,
  createLedger,
  fetchLedgers,
  reorderLedgerPriorities,
  type FlowBitLedger,
} from "@/lib/ledger-client";

type ToastState = {
  type: "success" | "error";
  message: string;
} | null;

type LedgerFormState = {
  name: string;
  limit_per_identifier: string;
  priority: string;
  close_time: string;
};

type PendingAction =
  | { type: "create" }
  | { type: "close"; ledger: FlowBitLedger }
  | { type: "reorder" }
  | null;

const defaultLedgerForm: LedgerFormState = {
  name: "",
  limit_per_identifier: "100.00",
  priority: "1",
  close_time: "15:00",
};

function formatDateTime(value: string | null) {
  if (!value) {
    return "Not set";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatCurrencyLike(value: string) {
  const amount = Number(value);
  if (Number.isNaN(amount)) {
    return value;
  }
  return amount.toLocaleString("en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function LedgerPage() {
  const [user, setUser] = useState<AuthUser | null>(getStoredUser());
  const [activeLedgers, setActiveLedgers] = useState<FlowBitLedger[]>([]);
  const [archivedLedgers, setArchivedLedgers] = useState<FlowBitLedger[]>([]);
  const [priorityDrafts, setPriorityDrafts] = useState<Record<number, string>>({});
  const [form, setForm] = useState<LedgerFormState>(defaultLedgerForm);
  const [toast, setToast] = useState<ToastState>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [overrideCode, setOverrideCode] = useState("");

  const { activePeriod, hasActivePeriod, error: periodError } = usePeriodState();
  const canManageLedgers = user?.role === "admin";
  const requiresOverride = !canManageLedgers;

  const activeCapacityTotal = useMemo(
    () =>
      activeLedgers.reduce((sum, ledger) => {
        const amount = Number(ledger.limit_per_identifier);
        return sum + (Number.isNaN(amount) ? 0 : amount);
      }, 0),
    [activeLedgers],
  );

  async function loadPageData() {
    if (!activePeriod) {
      setActiveLedgers([]);
      setArchivedLedgers([]);
      setPriorityDrafts({});
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const [nextUser, nextActiveLedgers, nextArchivedLedgers] = await Promise.all([
        fetchCurrentUser(),
        fetchLedgers({ period_id: activePeriod.id }),
        fetchLedgers({ period_id: activePeriod.id, section: "archive" }),
      ]);
      setUser(nextUser);
      setActiveLedgers(nextActiveLedgers.filter((ledger) => ledger.is_active));
      setArchivedLedgers(nextArchivedLedgers.filter((ledger) => !ledger.is_active));
      setPriorityDrafts(
        Object.fromEntries(nextActiveLedgers.filter((ledger) => ledger.is_active).map((ledger) => [ledger.id, String(ledger.priority)])),
      );
    } catch (loadError) {
      setToast({
        type: "error",
        message: loadError instanceof Error ? loadError.message : "Request failed.",
      });
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadPageData();
  }, [activePeriod?.id]);

  function openAction(action: PendingAction) {
    setOverrideCode("");
    setPendingAction(action);
  }

  async function handleConfirmAction() {
    if (!activePeriod || !pendingAction) {
      return;
    }

    setIsSaving(true);
    try {
      if (pendingAction.type === "create") {
        await createLedger({
          period: activePeriod.id,
          name: form.name.trim(),
          limit_per_identifier: form.limit_per_identifier,
          priority: Number(form.priority),
          close_time: form.close_time || "15:00",
          admin_override_code: requiresOverride ? overrideCode : undefined,
        });
        setForm(defaultLedgerForm);
        setToast({ type: "success", message: "Ledger created successfully." });
      } else if (pendingAction.type === "close") {
        await closeLedger(pendingAction.ledger.id, requiresOverride ? overrideCode : undefined);
        setToast({ type: "success", message: "Ledger closed successfully." });
      } else if (pendingAction.type === "reorder") {
        await reorderLedgerPriorities(
          activeLedgers.map((ledger) => ({
            id: ledger.id,
            priority: Number(priorityDrafts[ledger.id] || ledger.priority),
          })),
          requiresOverride ? overrideCode : undefined,
        );
        setToast({ type: "success", message: "Ledger priorities updated successfully." });
      }

      setPendingAction(null);
      setOverrideCode("");
      await loadPageData();
    } catch (actionError) {
      setToast({
        type: "error",
        message: actionError instanceof Error ? actionError.message : "Request failed.",
      });
    } finally {
      setIsSaving(false);
    }
  }

  if (!hasActivePeriod) {
    return (
      <WorkspaceShell>
        {toast ? <AdminActionToast message={toast.message} type={toast.type} onClose={() => setToast(null)} /> : null}
        <div className="mx-auto w-full max-w-[1800px] px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
          <section className="rounded-[28px] border border-stone-900/8 bg-white px-5 py-6 shadow-[0_8px_24px_rgba(28,24,20,0.04)] sm:px-8 sm:py-8">
            <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-stone-400">Ledgers</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-0.02em] text-stone-950 sm:text-[2rem]">Ledger workspace is locked</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-stone-500 sm:text-[15px]">
              {periodError || "Create an active period first. Ledger management unlocks as soon as the period term is ready."}
            </p>
          </section>
        </div>
      </WorkspaceShell>
    );
  }

  return (
    <WorkspaceShell>
      {toast ? <AdminActionToast message={toast.message} type={toast.type} onClose={() => setToast(null)} /> : null}
      <AdminConfirmModal
        open={pendingAction !== null}
        title={
          pendingAction?.type === "close"
            ? `Close ${pendingAction.ledger.name}?`
            : pendingAction?.type === "reorder"
              ? "Save ledger priority changes?"
              : "Create ledger?"
        }
        description={
          pendingAction?.type === "close"
            ? "Closing a ledger stops new allocations to that ledger immediately."
            : pendingAction?.type === "reorder"
              ? "Reorder the active ledgers so the system uses the updated priority sequence."
              : "Create a new ledger in the active period using the details entered in the setup form."
        }
        codeValue={overrideCode}
        codeLabel="Admin override code"
        confirmLabel={
          pendingAction?.type === "close"
            ? "Close ledger"
            : pendingAction?.type === "reorder"
              ? "Save order"
              : "Create ledger"
        }
        showCodeInput={requiresOverride}
        busy={isSaving}
        onCodeChange={setOverrideCode}
        onCancel={() => {
          setPendingAction(null);
          setOverrideCode("");
        }}
        onConfirm={handleConfirmAction}
      />

      <div className="mx-auto w-full max-w-[1800px] px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
        <section className="rounded-[28px] border border-stone-900/8 bg-white px-5 py-6 shadow-[0_8px_24px_rgba(28,24,20,0.04)] sm:px-8 sm:py-8">
          <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-stone-400">Ledgers</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.02em] text-stone-950 sm:text-[2rem]">Ledger workspace</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-stone-500 sm:text-[15px]">
            Manage active ledgers, keep priorities in order, and close ledgers when the current period needs to move forward.
          </p>
        </section>

        <section className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(360px,0.9fr)]">
          <article className="rounded-[28px] border border-stone-900/8 bg-white p-5 shadow-[0_8px_24px_rgba(28,24,20,0.04)] sm:p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-stone-400">Active ledgers</p>
                <h2 className="mt-2 text-2xl font-semibold text-stone-950">{activePeriod?.name}</h2>
                <p className="mt-2 text-sm leading-6 text-stone-500">
                  {activeLedgers.length} active ledger{activeLedgers.length === 1 ? "" : "s"} · total capacity per identifier {formatCurrencyLike(
                    String(activeCapacityTotal),
                  )}
                </p>
              </div>
              <div className="flex flex-wrap gap-3 text-sm text-stone-500">
                <span className="inline-flex items-center gap-2 rounded-full bg-stone-50 px-3 py-2">
                  <FontAwesomeIcon icon={faCircleDot} className="h-3.5 w-3.5 text-emerald-600" />
                  Period active
                </span>
                <span className="inline-flex items-center gap-2 rounded-full bg-stone-50 px-3 py-2">
                  <FontAwesomeIcon icon={faLayerGroup} className="h-3.5 w-3.5" />
                  Priority based allocation
                </span>
              </div>
            </div>

            <div className="mt-6 space-y-4">
              {isLoading ? (
                <p className="text-sm text-stone-500">Loading ledgers...</p>
              ) : activeLedgers.length ? (
                activeLedgers
                  .slice()
                  .sort((left, right) => left.priority - right.priority)
                  .map((ledger) => (
                    <div
                      key={ledger.id}
                      className="rounded-[24px] border border-stone-900/8 bg-[#f7f4ef] px-5 py-5"
                    >
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div className="space-y-2">
                          <p className="text-xl font-semibold text-stone-950">{ledger.name}</p>
                          <div className="flex flex-wrap gap-3 text-sm text-stone-500">
                            <span className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-2">
                              <FontAwesomeIcon icon={faClock} className="h-3.5 w-3.5" />
                              Ends {formatDateTime(ledger.end_date)}
                            </span>
                            <span className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-2">
                              Capacity {formatCurrencyLike(ledger.limit_per_identifier)}
                            </span>
                          </div>
                        </div>

                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                          <label className="block space-y-2">
                            <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-500">
                              Priority
                            </span>
                            <Input
                              type="number"
                              min="1"
                              value={priorityDrafts[ledger.id] ?? String(ledger.priority)}
                              onChange={(event) =>
                                setPriorityDrafts((current) => ({
                                  ...current,
                                  [ledger.id]: event.target.value,
                                }))
                              }
                              className="h-11 w-28 bg-white"
                              disabled={isSaving}
                            />
                          </label>
                          <Button variant="outline" onClick={() => openAction({ type: "close", ledger })} disabled={isSaving}>
                            Close
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))
              ) : (
                <div className="rounded-[24px] border border-dashed border-stone-900/12 bg-[#f7f4ef] px-5 py-6 text-sm leading-6 text-stone-500">
                  No ledgers in the active period yet. Create the first ledger from the setup panel.
                </div>
              )}
            </div>

            {activeLedgers.length ? (
              <div className="mt-6 flex justify-end">
                <Button variant="outline" onClick={() => openAction({ type: "reorder" })} disabled={isSaving}>
                  <FontAwesomeIcon icon={faArrowDownWideShort} className="h-4 w-4" />
                  Save priority order
                </Button>
              </div>
            ) : null}
          </article>

          <aside className="space-y-5">
            <div className="rounded-[28px] border border-stone-900/8 bg-white p-5 shadow-[0_8px_24px_rgba(28,24,20,0.04)] sm:p-6">
              <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-stone-400">Create ledger</p>
              <h2 className="mt-2 text-2xl font-semibold text-stone-950">New active ledger</h2>
              <p className="mt-3 text-sm leading-6 text-stone-500">
                Add a ledger to the current period with its own priority, end time, and per-identifier limit.
              </p>

              <form
                className="mt-6 space-y-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!form.name.trim() || !form.limit_per_identifier || !form.priority) {
                    setToast({ type: "error", message: "Ledger name, limit, and priority are required." });
                    return;
                  }
                  openAction({ type: "create" });
                }}
              >
                <label className="block space-y-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Ledger name</span>
                  <Input
                    value={form.name}
                    onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                    placeholder="Main Ledger"
                    disabled={isSaving}
                  />
                </label>

                <label className="block space-y-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Limit per identifier</span>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.limit_per_identifier}
                    onChange={(event) => setForm((current) => ({ ...current, limit_per_identifier: event.target.value }))}
                    disabled={isSaving}
                  />
                </label>

                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block space-y-2">
                    <span className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Priority</span>
                    <Input
                      type="number"
                      min="1"
                      value={form.priority}
                      onChange={(event) => setForm((current) => ({ ...current, priority: event.target.value }))}
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
                </div>

                <Button type="submit" className="w-full" disabled={isSaving}>
                  <FontAwesomeIcon icon={faPlus} className="h-4 w-4" />
                  Create ledger
                </Button>
              </form>
            </div>

            <div className="rounded-[28px] border border-stone-900/8 bg-white p-5 shadow-[0_8px_24px_rgba(28,24,20,0.04)] sm:p-6">
              <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-stone-400">Archive</p>
              <h2 className="mt-2 text-2xl font-semibold text-stone-950">Closed ledgers</h2>

              <div className="mt-5 space-y-3">
                {isLoading ? (
                  <p className="text-sm text-stone-500">Loading archive...</p>
                ) : archivedLedgers.length ? (
                  archivedLedgers.map((ledger) => (
                    <div key={ledger.id} className="rounded-[22px] border border-stone-900/8 bg-[#f7f4ef] px-4 py-4">
                      <p className="text-base font-semibold text-stone-900">{ledger.name}</p>
                      <p className="mt-1 text-sm text-stone-500">
                        Closed {formatDateTime(ledger.closed_at)} · Priority {ledger.priority}
                      </p>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-stone-500">No closed ledgers in this period yet.</p>
                )}
              </div>
            </div>
          </aside>
        </section>
      </div>
    </WorkspaceShell>
  );
}
