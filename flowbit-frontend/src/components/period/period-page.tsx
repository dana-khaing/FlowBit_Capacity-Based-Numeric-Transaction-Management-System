"use client";

import { useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCalendarDays, faCircleDot, faClock, faLock, faRotateLeft, faTrashCan } from "@fortawesome/free-solid-svg-icons";
import { AdminConfirmModal } from "@/components/admin/admin-confirm-modal";
import { WorkspaceShell } from "@/components/app/workspace-shell";
import { ActionLoadingModal } from "@/components/app/action-loading-modal";
import { AdminActionToast } from "@/components/admin/admin-action-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fetchCurrentUser, getStoredUser, type AuthUser } from "@/lib/auth-client";
import {
  closePeriod,
  createPeriod,
  deletePeriod,
  deletePeriodLuckyDraw,
  fetchPeriodLuckyDraw,
  fetchPeriods,
  reopenPeriod,
  savePeriodLuckyDraw,
  type FlowBitPeriod,
  type FlowBitLuckyDraw,
  updatePeriod,
} from "@/lib/period-client";
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
  pre_close_time: string;
};

type PeriodAction = "create" | "update" | "close" | "reopen" | "delete" | null;

function formatDateFieldValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function buildDefaultPeriodFormState(): PeriodFormState {
  const today = new Date();
  const endDate = new Date(today);

  if (today.getDate() <= 1) {
    endDate.setDate(1);
  } else if (today.getDate() <= 16) {
    endDate.setDate(16);
  } else {
    endDate.setMonth(endDate.getMonth() + 1, 1);
  }

  return {
    name: "",
    start_date: formatDateFieldValue(today),
    end_date: formatDateFieldValue(endDate),
    close_time: "23:00",
    pre_close_time: "15:30",
  };
}

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

function formatTimeValue(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "23:00";
  }
  return `${String(parsed.getHours()).padStart(2, "0")}:${String(parsed.getMinutes()).padStart(2, "0")}`;
}

function formatClockValue(value?: string | null) {
  if (!value) {
    return "--:--";
  }
  return value.slice(0, 5);
}

function formatDateInputValue(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }
  return parsed.toISOString().slice(0, 10);
}

function comparePeriods(left: FlowBitPeriod, right: FlowBitPeriod) {
  return new Date(right.start_date).getTime() - new Date(left.start_date).getTime();
}

function isPreCloseTimeValid(preCloseTime: string, closeTime: string) {
  return preCloseTime < closeTime;
}

export function PeriodPage() {
  const [user, setUser] = useState<AuthUser | null>(getStoredUser());
  const [periods, setPeriods] = useState<FlowBitPeriod[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);
  const [form, setForm] = useState<PeriodFormState>(buildDefaultPeriodFormState);
  const [activePeriodForm, setActivePeriodForm] = useState({ end_date: "", close_time: "23:00", pre_close_time: "15:30" });
  const [reopenForm, setReopenForm] = useState({ end_date: "", close_time: "23:00" });
  const [showActionConfirm, setShowActionConfirm] = useState(false);
  const [pendingAction, setPendingAction] = useState<PeriodAction>(null);
  const [overrideCode, setOverrideCode] = useState("");
  const [luckyDraw, setLuckyDraw] = useState<FlowBitLuckyDraw | null>(null);
  const [luckyDrawNumber, setLuckyDrawNumber] = useState("");
  const [luckyDrawRevealTime, setLuckyDrawRevealTime] = useState("15:30");
  const [isLuckyDrawModalOpen, setIsLuckyDrawModalOpen] = useState(false);
  const [isLuckyDrawTimeModalOpen, setIsLuckyDrawTimeModalOpen] = useState(false);

  const activePeriod = useMemo(
    () => periods.find((period) => period.is_open) ?? null,
    [periods],
  );

  const archivedPeriods = useMemo(
    () => periods.filter((period) => !period.is_open),
    [periods],
  );
  const latestClosedPeriod = archivedPeriods[0] ?? null;

  const canManagePeriods = user?.role === "admin";
  const canEditLuckyDraw = Boolean(
    canManagePeriods &&
    activePeriod &&
    activePeriod.is_open &&
    new Date(activePeriod.end_date).getTime() > Date.now(),
  );

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

  useEffect(() => {
    if (!activePeriod) {
      setActivePeriodForm({ end_date: "", close_time: "23:00", pre_close_time: "15:30" });
      setLuckyDraw(null);
      setLuckyDrawNumber("");
      setLuckyDrawRevealTime("15:30");
      return;
    }

    setActivePeriodForm({
      end_date: formatDateInputValue(activePeriod.end_date),
      close_time: formatTimeValue(activePeriod.end_date),
      pre_close_time: (activePeriod.pre_close_time ?? "15:30").slice(0, 5),
    });
  }, [activePeriod]);

  useEffect(() => {
    if (!canManagePeriods || !activePeriod) {
      setLuckyDraw(null);
      setLuckyDrawNumber("");
      return;
    }

    let isMounted = true;
    fetchPeriodLuckyDraw(activePeriod.id)
      .then((nextLuckyDraw) => {
        if (!isMounted) {
          return;
        }
        setLuckyDraw(nextLuckyDraw);
        setLuckyDrawNumber(nextLuckyDraw.number ?? "");
        setLuckyDrawRevealTime((nextLuckyDraw.reveal_time ?? activePeriod.lucky_draw_reveal_time ?? "15:30").slice(0, 5));
      })
      .catch(() => {
        if (!isMounted) {
          return;
        }
        setLuckyDraw(null);
        setLuckyDrawNumber("");
        setLuckyDrawRevealTime((activePeriod.lucky_draw_reveal_time ?? "15:30").slice(0, 5));
      });

    return () => {
      isMounted = false;
    };
  }, [activePeriod, canManagePeriods]);

  useEffect(() => {
    if (!latestClosedPeriod) {
      setReopenForm({ end_date: "", close_time: "23:00" });
      return;
    }

    setReopenForm({
      end_date: formatDateInputValue(latestClosedPeriod.end_date),
      close_time: formatTimeValue(latestClosedPeriod.end_date),
    });
  }, [latestClosedPeriod]);

  async function handleCreatePeriod(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!form.name.trim() || !form.start_date || !form.end_date) {
      setToast({ type: "error", message: "Name, start date, and end date are required." });
      return;
    }

    if (!isPreCloseTimeValid(form.pre_close_time || "15:30", form.close_time || "23:00")) {
      setToast({ type: "error", message: "Pre-close time must be earlier than the period close time." });
      return;
    }

    setPendingAction("create");
    setIsSaving(true);
    try {
      await createPeriod({
        name: form.name.trim(),
        start_date: form.start_date,
        end_date: form.end_date,
        close_time: form.close_time || "23:00",
        pre_close_time: form.pre_close_time || "15:30",
        is_open: true,
      });
      setForm(buildDefaultPeriodFormState());
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
      setPendingAction(null);
    }
  }

  function openConfirm(action: PeriodAction) {
    setPendingAction(action);
    setOverrideCode("");
    if (action === "reopen" && latestClosedPeriod) {
      setReopenForm({
        end_date: formatDateInputValue(latestClosedPeriod.end_date),
        close_time: formatTimeValue(latestClosedPeriod.end_date),
      });
    }
    setShowActionConfirm(true);
  }

  async function handleConfirmAction() {
    if (!pendingAction) {
      return;
    }

    if (pendingAction === "update" && !activePeriodForm.end_date) {
      setToast({ type: "error", message: "End date is required." });
      setShowActionConfirm(false);
      return;
    }

    if (
      pendingAction === "update" &&
      !isPreCloseTimeValid(activePeriodForm.pre_close_time || "15:30", activePeriodForm.close_time || "23:00")
    ) {
      setToast({ type: "error", message: "Pre-close time must be earlier than the period close time." });
      setShowActionConfirm(false);
      return;
    }

    if (pendingAction === "reopen" && !reopenForm.end_date) {
      setToast({ type: "error", message: "End date is required to reopen the period." });
      setShowActionConfirm(false);
      return;
    }

    setIsSaving(true);
    try {
      if (pendingAction === "update" && activePeriod) {
        await updatePeriod(activePeriod.id, {
          end_date: activePeriodForm.end_date,
          close_time: activePeriodForm.close_time || "23:00",
          pre_close_time: activePeriodForm.pre_close_time || "15:30",
        });
        setToast({ type: "success", message: "Period updated successfully." });
      } else if (pendingAction === "close" && activePeriod) {
        await closePeriod(activePeriod.id);
        setToast({ type: "success", message: "Period closed successfully." });
      } else if (pendingAction === "reopen" && latestClosedPeriod) {
        await reopenPeriod(latestClosedPeriod.id, {
          end_date: reopenForm.end_date,
          close_time: reopenForm.close_time || "23:00",
        });
        setToast({ type: "success", message: "Period reopened successfully." });
      } else if (pendingAction === "delete" && latestClosedPeriod) {
        await deletePeriod(latestClosedPeriod.id);
        setToast({ type: "success", message: "Period deleted successfully." });
      }

      setShowActionConfirm(false);
      setPendingAction(null);
      setOverrideCode("");
      await loadPageData();
      notifyPeriodsUpdated();
    } catch (error) {
      setToast({
        type: "error",
        message: error instanceof Error ? error.message : "Request failed.",
      });
    } finally {
      setIsSaving(false);
      setPendingAction(null);
    }
  }

  async function handleSaveLuckyDraw(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!activePeriod || !canEditLuckyDraw) {
      return;
    }

    const normalizedNumber = luckyDrawNumber.replace(/\D/g, "");
    if (normalizedNumber.length !== 6) {
      setToast({ type: "error", message: "Lucky draw number must be 6 digits." });
      return;
    }

    setIsSaving(true);
    try {
      const savedLuckyDraw = await savePeriodLuckyDraw(activePeriod.id, {
        number: normalizedNumber,
        reveal_time: luckyDrawRevealTime || "15:30",
      });
      setLuckyDraw(savedLuckyDraw);
      setLuckyDrawNumber(savedLuckyDraw.number ?? normalizedNumber);
      setLuckyDrawRevealTime((savedLuckyDraw.reveal_time ?? luckyDrawRevealTime ?? "15:30").slice(0, 5));
      setIsLuckyDrawModalOpen(false);
      setToast({
        type: "success",
        message: luckyDraw?.id ? "Lucky draw updated successfully." : "Lucky draw added successfully.",
      });
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

  async function handleDeleteLuckyDraw() {
    if (!activePeriod || !canEditLuckyDraw || !luckyDraw?.id) {
      return;
    }

    setIsSaving(true);
    try {
      await deletePeriodLuckyDraw(activePeriod.id);
      setLuckyDraw(null);
      setLuckyDrawNumber("");
      setIsLuckyDrawModalOpen(false);
      setToast({ type: "success", message: "Lucky draw removed successfully." });
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

  async function handleSaveLuckyDrawRevealTime(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!activePeriod || !canEditLuckyDraw) {
      return;
    }

    setIsSaving(true);
    try {
      await updatePeriod(activePeriod.id, {
        lucky_draw_reveal_time: luckyDrawRevealTime || "15:30",
      });
      setIsLuckyDrawTimeModalOpen(false);
      setToast({ type: "success", message: "Lucky draw reveal time updated successfully." });
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
      <ActionLoadingModal
        open={isSaving && pendingAction === "create"}
        title="Creating period"
        description="FlowBit is saving the new period and opening the reserve helper for your account before showing success."
      />
      <ActionLoadingModal
        open={isSaving && isLuckyDrawModalOpen}
        title={luckyDraw?.id ? "Updating lucky draw" : "Creating lucky draw"}
        description="FlowBit is saving the period lucky draw number and updating the shared reveal state."
      />
      <ActionLoadingModal
        open={isSaving && isLuckyDrawTimeModalOpen}
        title="Updating reveal time"
        description="FlowBit is saving the lucky draw reveal time for the active period."
      />
      <AdminConfirmModal
        open={showActionConfirm}
        title={
          pendingAction === "close"
            ? "Close active period?"
            : pendingAction === "reopen"
              ? "Reopen the last closed period?"
              : pendingAction === "delete"
                ? "Delete the last closed period?"
              : "Save active period changes?"
        }
        description={
          pendingAction === "close"
            ? "Closing the current period will lock ticket entry, ledgers, spill-over, and tickets until a new period is created."
            : pendingAction === "reopen"
              ? "Reopen the most recently closed period so you can extend its end date or continue using it."
            : pendingAction === "delete"
              ? "Delete the most recently closed period. Older closed periods cannot be deleted."
            : "Update the active period end date and close time for the current term."
        }
        codeValue={overrideCode}
        codeLabel="Admin override code"
        confirmLabel={
          pendingAction === "close"
            ? "Close period"
            : pendingAction === "reopen"
              ? "Reopen period"
              : pendingAction === "delete"
                ? "Delete period"
                : "Save changes"
        }
        showCodeInput={false}
        busy={isSaving}
        onCodeChange={setOverrideCode}
        onCancel={() => {
          setShowActionConfirm(false);
          setPendingAction(null);
          setOverrideCode("");
        }}
        onConfirm={handleConfirmAction}
      >
        {pendingAction === "reopen" ? (
          <div className="space-y-4">
            <label className="block space-y-2">
              <span className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">New end date</span>
              <Input
                type="date"
                value={reopenForm.end_date}
                onChange={(event) =>
                  setReopenForm((current) => ({ ...current, end_date: event.target.value }))
                }
                disabled={isSaving}
              />
            </label>
            <label className="block space-y-2">
              <span className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">New close time</span>
              <Input
                type="time"
                value={reopenForm.close_time}
                onChange={(event) =>
                  setReopenForm((current) => ({ ...current, close_time: event.target.value }))
                }
                disabled={isSaving}
              />
            </label>
          </div>
        ) : null}
      </AdminConfirmModal>

      <div className="mx-auto w-full max-w-[1800px] px-4 py-3 sm:px-6 lg:px-8 lg:py-5">
        <section className="grid gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(360px,0.85fr)]">
          <article className="rounded-[28px] border border-stone-900/8 bg-white p-5 shadow-[0_8px_24px_rgba(28,24,20,0.04)] sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-stone-400">Period control</p>
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
                      Close time {formatTimeValue(activePeriod.end_date)}
                    </span>
                    <span className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-2">
                      <FontAwesomeIcon icon={faClock} className="h-3.5 w-3.5" />
                      Pre-close {formatClockValue(activePeriod.pre_close_time)}
                    </span>
                  </div>
                  {activePeriod.pre_close_at ? (
                    <p className="text-sm text-stone-500">
                      Pre-close applied {new Date(activePeriod.pre_close_at).toLocaleString("en-GB")}
                    </p>
                  ) : null}
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

            {canManagePeriods && activePeriod ? (
              <div className="mt-5 rounded-[24px] border border-stone-900/8 bg-white px-5 py-5 shadow-[0_8px_24px_rgba(28,24,20,0.04)]">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-stone-400">Lucky draw</p>
                    <h3 className="mt-2 text-xl font-semibold text-stone-950">Shared period number</h3>
                    <p className="mt-3 text-sm leading-6 text-stone-500">
                      Only admin users can add or edit the 6-digit lucky draw number, and it locks automatically after the period ends.
                    </p>
                  </div>
                </div>

                <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-1 text-sm text-stone-500">
                    {luckyDraw?.announced_at
                      ? `Last updated ${new Date(luckyDraw.announced_at).toLocaleString("en-GB")}`
                      : "No lucky draw number added yet."}
                    <p>Reveal time {luckyDrawRevealTime}</p>
                  </div>
                  {canEditLuckyDraw ? (
                    <div className="flex flex-wrap gap-3">
                      <Button
                        variant="outline"
                        onClick={() => {
                          setLuckyDrawRevealTime((luckyDraw?.reveal_time ?? activePeriod.lucky_draw_reveal_time ?? "15:30").slice(0, 5));
                          setIsLuckyDrawTimeModalOpen(true);
                        }}
                        disabled={isSaving}
                      >
                        Edit reveal time
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => {
                          setLuckyDrawNumber(luckyDraw?.number ?? "");
                          setIsLuckyDrawModalOpen(true);
                        }}
                        disabled={isSaving}
                      >
                        {luckyDraw?.id ? "Edit lucky number" : "Add lucky number"}
                      </Button>
                    </div>
                  ) : (
                    <span className="text-sm font-medium text-stone-400">
                      Lucky draw is locked after period end.
                    </span>
                  )}
                </div>
              </div>
            ) : null}

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
                      <div className="flex flex-wrap items-center gap-3">
                        <span className={`inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] ${
                          period.is_open ? "bg-emerald-100 text-emerald-700" : "bg-stone-200 text-stone-600"
                        }`}>
                          <FontAwesomeIcon icon={period.is_open ? faCircleDot : faLock} className="h-3 w-3" />
                          {period.is_open ? "Open" : "Closed"}
                        </span>

                        {canManagePeriods && !activePeriod && latestClosedPeriod?.id === period.id ? (
                          <>
                            <Button variant="outline" onClick={() => openConfirm("reopen")} disabled={isSaving}>
                              <FontAwesomeIcon icon={faRotateLeft} className="h-3.5 w-3.5" />
                              Reopen
                            </Button>
                            <Button variant="outline" onClick={() => openConfirm("delete")} disabled={isSaving}>
                              <FontAwesomeIcon icon={faTrashCan} className="h-3.5 w-3.5" />
                              Delete
                            </Button>
                          </>
                        ) : null}
                      </div>
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

            {canManagePeriods && !activePeriod ? (
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

                <label className="block space-y-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Pre-close time</span>
                  <Input
                    type="time"
                    value={form.pre_close_time}
                    onChange={(event) => setForm((current) => ({ ...current, pre_close_time: event.target.value }))}
                    disabled={isSaving}
                  />
                </label>

                <Button type="submit" className="w-full" disabled={isSaving}>
                  {isSaving ? "Creating period..." : "Create period"}
                </Button>
              </form>
            ) : canManagePeriods ? (
              <div className="mt-6 rounded-[24px] border border-amber-200 bg-amber-50 px-5 py-5 text-sm leading-6 text-stone-600">
                There is already an active period. Close the current period first before creating another one.
              </div>
            ) : (
              <div className="mt-6 rounded-[24px] border border-stone-900/8 bg-[#f3f0ea] px-5 py-5 text-sm leading-6 text-stone-500">
                Only admin users can create or update periods. You can still review the active period and period history here.
              </div>
            )}

            {canManagePeriods && activePeriod ? (
              <div className="mt-6 rounded-[24px] border border-stone-900/8 bg-white px-5 py-5 shadow-[0_8px_24px_rgba(28,24,20,0.04)]">
                <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-stone-400">Active period actions</p>
                <h3 className="mt-2 text-xl font-semibold text-stone-950">Edit end date and close time</h3>
                <p className="mt-3 text-sm leading-6 text-stone-500">
                  Update the active period end date, pre-close time, or close the period now from this panel.
                </p>

                <div className="mt-5 space-y-4">
                  <label className="block space-y-2">
                    <span className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">End date</span>
                    <Input
                      type="date"
                      value={activePeriodForm.end_date}
                      onChange={(event) =>
                        setActivePeriodForm((current) => ({ ...current, end_date: event.target.value }))
                      }
                      disabled={isSaving}
                    />
                  </label>

                  <label className="block space-y-2">
                    <span className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Close time</span>
                    <Input
                      type="time"
                      value={activePeriodForm.close_time}
                      onChange={(event) =>
                        setActivePeriodForm((current) => ({ ...current, close_time: event.target.value }))
                      }
                      disabled={isSaving}
                    />
                  </label>

                  <label className="block space-y-2">
                    <span className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Pre-close time</span>
                    <Input
                      type="time"
                      value={activePeriodForm.pre_close_time}
                      onChange={(event) =>
                        setActivePeriodForm((current) => ({ ...current, pre_close_time: event.target.value }))
                      }
                      disabled={isSaving}
                    />
                  </label>
                </div>

                <div className="mt-5 flex flex-col gap-3">
                  <Button onClick={() => openConfirm("update")} disabled={isSaving}>
                    Save changes
                  </Button>
                  <Button variant="outline" onClick={() => openConfirm("close")} disabled={isSaving}>
                    Close period now
                  </Button>
                </div>
              </div>
            ) : null}

          </aside>
        </section>
      </div>

      {isLuckyDrawModalOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/40 px-4 py-6"
          onClick={() => {
            if (!isSaving) {
              setIsLuckyDrawModalOpen(false);
            }
          }}
        >
          <div
            className="w-full max-w-md rounded-[28px] border border-stone-900/8 bg-white p-6 shadow-[0_18px_60px_rgba(28,24,20,0.24)]"
            onClick={(event) => event.stopPropagation()}
          >
            <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-stone-400">Lucky draw</p>
            <h3 className="mt-2 text-2xl font-semibold text-stone-950">
              {luckyDraw?.id ? "Edit lucky number" : "Add lucky number"}
            </h3>
            <p className="mt-3 text-sm leading-6 text-stone-500">
              This number is shared across all users for the active period and becomes read-only after the period ends.
            </p>

            <form className="mt-6 space-y-4" onSubmit={handleSaveLuckyDraw}>
              <label className="block space-y-2">
                <span className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Lucky draw number</span>
                <Input
                  inputMode="numeric"
                  maxLength={6}
                  value={luckyDrawNumber}
                  onChange={(event) =>
                    setLuckyDrawNumber(event.target.value.replace(/\D/g, "").slice(0, 6))
                  }
                  placeholder="123456"
                  disabled={isSaving}
                />
              </label>

              <div className="flex gap-3">
                {luckyDraw?.id ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1"
                    onClick={handleDeleteLuckyDraw}
                    disabled={isSaving}
                  >
                    Remove
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={() => setIsLuckyDrawModalOpen(false)}
                  disabled={isSaving}
                >
                  Cancel
                </Button>
                <Button type="submit" className="flex-1" disabled={isSaving}>
                  {luckyDraw?.id ? "Save" : "Add"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {isLuckyDrawTimeModalOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/40 px-4 py-6"
          onClick={() => {
            if (!isSaving) {
              setIsLuckyDrawTimeModalOpen(false);
            }
          }}
        >
          <div
            className="w-full max-w-md rounded-[28px] border border-stone-900/8 bg-white p-6 shadow-[0_18px_60px_rgba(28,24,20,0.24)]"
            onClick={(event) => event.stopPropagation()}
          >
            <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-stone-400">Lucky draw</p>
            <h3 className="mt-2 text-2xl font-semibold text-stone-950">Edit reveal time</h3>
            <p className="mt-3 text-sm leading-6 text-stone-500">
              This controls when the active period lucky draw changes from masked to visible on the dashboard.
            </p>

            <form className="mt-6 space-y-4" onSubmit={handleSaveLuckyDrawRevealTime}>
              <label className="block space-y-2">
                <span className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Reveal time</span>
                <Input
                  type="time"
                  value={luckyDrawRevealTime}
                  onChange={(event) => setLuckyDrawRevealTime(event.target.value)}
                  disabled={isSaving}
                />
              </label>

              <div className="flex gap-3">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={() => setIsLuckyDrawTimeModalOpen(false)}
                  disabled={isSaving}
                >
                  Cancel
                </Button>
                <Button type="submit" className="flex-1" disabled={isSaving}>
                  Save
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </WorkspaceShell>
  );
}
