"use client";

import { useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowsRotate,
  faCircleCheck,
  faClockRotateLeft,
  faPenToSquare,
  faPlus,
  faReceipt,
  faTrashCan,
  faTriangleExclamation,
  faUser,
} from "@fortawesome/free-solid-svg-icons";
import { AppSectionPage } from "@/components/app/app-section-page";
import {
  notifyDashboardUpdated,
  notifyTicketsUpdated,
  REPEAT_TICKETS_UPDATED_EVENT,
} from "@/components/app/workspace-events";
import { AdminActionToast } from "@/components/admin/admin-action-toast";
import { AdminConfirmModal } from "@/components/admin/admin-confirm-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { usePeriodState } from "@/components/period/use-period-state";
import { fetchLedgers } from "@/lib/ledger-client";
import {
  createRepeatTicket,
  deleteRepeatTicket,
  fetchRepeatTickets,
  generateRepeatTicket,
  type FlowBitRepeatTicket,
  type RepeatTicketGenerateResponse,
  updateRepeatTicket,
} from "@/lib/repeat-ticket-client";

type ToastState = {
  type: "success" | "error";
  message: string;
} | null;

type RepeatTicketOverflowPromptState = {
  repeatTicketId: number;
  repeatTicketCode: string;
  overflowItems: Array<{
    identifier_number: string;
    overflow_amount: string;
  }>;
  totalOverflowAmount: string;
  remainingQueue: number[];
  generatedCount: number;
  unsuccessfulCount: number;
};

type RepeatDraftItem = {
  id: string;
  identifierNumber: string;
  amount: string;
  amountUsesAllocationBasis: boolean;
  usePermutations: boolean;
};

function createDraftItem(partial?: Partial<RepeatDraftItem>): RepeatDraftItem {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    identifierNumber: "",
    amount: "",
    amountUsesAllocationBasis: false,
    usePermutations: false,
    ...partial,
  };
}

function normalizeIdentifierNumber(value: string) {
  const digits = value.replace(/\D/g, "");
  if (!digits) {
    return value.trim();
  }
  return digits.slice(-3).padStart(3, "0");
}

function sanitizeIdentifierInput(value: string) {
  return value.replace(/\D/g, "").slice(0, 3);
}

function sanitizeAmountInput(value: string) {
  return value.replace(/\D/g, "");
}

function formatAmount(value: string | number) {
  const amount = Number(value);
  if (Number.isNaN(amount)) {
    return String(value);
  }
  return amount.toLocaleString("en-GB", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

function formatRepeatTicketDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getRepeatTicketCode(repeatTicket: Pick<FlowBitRepeatTicket, "repeat_code" | "customer_name" | "id">) {
  return repeatTicket.repeat_code || repeatTicket.customer_name || `Repeat Ticket #${repeatTicket.id}`;
}

function getRepeatTicketCustomerName(customerName: string | null | undefined) {
  const trimmedValue = customerName?.trim();
  if (!trimmedValue) {
    return "No customer name";
  }
  return trimmedValue;
}

function sortRepeatTickets(tickets: FlowBitRepeatTicket[]) {
  return [...tickets].sort((left, right) => {
    const updatedDifference =
      new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime();
    if (updatedDifference !== 0) {
      return updatedDifference;
    }
    return new Date(right.created_at).getTime() - new Date(left.created_at).getTime();
  });
}

function getPermutationCount(identifierNumber: string) {
  const digits = normalizeIdentifierNumber(identifierNumber);
  if (digits.length !== 3) {
    return 1;
  }
  return new Set(digits.split("").flatMap((first, firstIndex, all) =>
    all.flatMap((second, secondIndex) =>
      all
        .filter((_third, thirdIndex) => thirdIndex !== firstIndex && thirdIndex !== secondIndex && secondIndex !== firstIndex)
        .map((third) => `${first}${second}${third}`),
    ),
  )).size || 1;
}

function getPermutationNumbers(identifierNumber: string) {
  const digits = normalizeIdentifierNumber(identifierNumber);
  if (digits.length !== 3) {
    return [identifierNumber];
  }

  return Array.from(
    new Set(
      digits.split("").flatMap((first, firstIndex, all) =>
        all.flatMap((second, secondIndex) =>
          all
            .filter(
              (_third, thirdIndex) =>
                thirdIndex !== firstIndex &&
                thirdIndex !== secondIndex &&
                secondIndex !== firstIndex,
            )
            .map((third) => `${first}${second}${third}`),
        ),
      ),
    ),
  ).sort();
}

function getRepeatItemDisplayAmount(amount: string | number, usesAllocationBasis: boolean) {
  return usesAllocationBasis ? Number(amount) : Number(amount);
}

function getStatusTone(status: FlowBitRepeatTicket["current_status"]) {
  if (status === "GENERATED") {
    return "bg-emerald-100 text-emerald-700";
  }
  if (status === "UPDATED") {
    return "bg-sky-100 text-sky-700";
  }
  if (status === "UNSUCCESSFUL") {
    return "bg-rose-100 text-rose-700";
  }
  return "bg-amber-100 text-amber-700";
}

function getStatusLabel(status: FlowBitRepeatTicket["current_status"]) {
  if (status === "GENERATED") {
    return "Generated";
  }
  if (status === "UPDATED") {
    return "Updated";
  }
  if (status === "UNSUCCESSFUL") {
    return "Unsuccessful";
  }
  return "New";
}

export function RepeatTicketPage() {
  const { activePeriod, hasActivePeriod } = usePeriodState();
  const actionButtonClassName = "h-12 min-w-[152px] rounded-[18px] justify-center";
  const ticketsPerPage = 20;
  const [repeatTickets, setRepeatTickets] = useState<FlowBitRepeatTicket[]>([]);
  const [activeStandardLedgerCount, setActiveStandardLedgerCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isGeneratingAll, setIsGeneratingAll] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);
  const [pageError, setPageError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRepeatTicket, setEditingRepeatTicket] = useState<FlowBitRepeatTicket | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [notes, setNotes] = useState("");
  const [draftItems, setDraftItems] = useState<RepeatDraftItem[]>([createDraftItem()]);
  const [deleteTarget, setDeleteTarget] = useState<FlowBitRepeatTicket | null>(null);
  const [busyTicketId, setBusyTicketId] = useState<number | null>(null);
  const [selectedRepeatTicketId, setSelectedRepeatTicketId] = useState<number | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [overflowPrompt, setOverflowPrompt] = useState<RepeatTicketOverflowPromptState | null>(null);

  const canGenerate = hasActivePeriod && activeStandardLedgerCount > 0;
  const actionableRepeatTickets = repeatTickets.filter(
    (repeatTicket) => repeatTicket.current_status === "NEW" || repeatTicket.current_status === "UNSUCCESSFUL",
  );
  const totalPages = Math.max(1, Math.ceil(repeatTickets.length / ticketsPerPage));
  const paginatedRepeatTickets = useMemo(
    () => repeatTickets.slice((currentPage - 1) * ticketsPerPage, currentPage * ticketsPerPage),
    [currentPage, repeatTickets],
  );
  const selectedRepeatTicket = useMemo(
    () =>
      repeatTickets.find((repeatTicket) => repeatTicket.id === selectedRepeatTicketId) ??
      repeatTickets[0] ??
      null,
    [repeatTickets, selectedRepeatTicketId],
  );

  async function loadPageData() {
    setIsLoading(true);
    setPageError(null);
    try {
      const nextRepeatTickets = await fetchRepeatTickets();
      setRepeatTickets(sortRepeatTickets(nextRepeatTickets));
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "Failed to load repeat tickets.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadPageData();
  }, []);

  useEffect(() => {
    const handleRepeatTicketsUpdated = () => {
      void loadPageData();
    };

    window.addEventListener(REPEAT_TICKETS_UPDATED_EVENT, handleRepeatTicketsUpdated);
    return () => {
      window.removeEventListener(REPEAT_TICKETS_UPDATED_EVENT, handleRepeatTicketsUpdated);
    };
  }, []);

  useEffect(() => {
    if (!repeatTickets.length) {
      setSelectedRepeatTicketId(null);
      return;
    }

    setSelectedRepeatTicketId((current) =>
      current && repeatTickets.some((repeatTicket) => repeatTicket.id === current)
        ? current
        : repeatTickets[0].id,
    );
  }, [repeatTickets]);

  useEffect(() => {
    setCurrentPage((current) => Math.min(current, Math.max(1, Math.ceil(repeatTickets.length / ticketsPerPage))));
  }, [repeatTickets.length]);

  useEffect(() => {
    if (!activePeriod) {
      setActiveStandardLedgerCount(0);
      return;
    }

    let active = true;
    fetchLedgers({ period_id: activePeriod.id })
      .then((ledgers) => {
        if (!active) {
          return;
        }
        setActiveStandardLedgerCount(
          ledgers.filter((ledger) => ledger.is_active && !ledger.is_capacity_reserve).length,
        );
      })
      .catch(() => {
        if (active) {
          setActiveStandardLedgerCount(0);
        }
      });

    return () => {
      active = false;
    };
  }, [activePeriod?.id]);

  function resetModalState() {
    setCustomerName("");
    setNotes("");
    setDraftItems([createDraftItem()]);
    setEditingRepeatTicket(null);
  }

  function openCreateModal() {
    resetModalState();
    setIsModalOpen(true);
  }

  function openEditModal(repeatTicket: FlowBitRepeatTicket) {
    setEditingRepeatTicket(repeatTicket);
    setCustomerName(repeatTicket.customer_name?.trim() || "");
    setNotes(repeatTicket.notes ?? "");
    setDraftItems(
      repeatTicket.items.map((item) =>
        createDraftItem({
          identifierNumber: item.identifier_number,
          amount: formatAmount(item.amount_uses_allocation_basis ? Number(item.amount) : Number(item.amount)),
          amountUsesAllocationBasis: item.amount_uses_allocation_basis,
          usePermutations: item.use_permutations,
        }),
      ),
    );
    setIsModalOpen(true);
  }

  function setDraftItemState(itemId: string, updater: (item: RepeatDraftItem) => RepeatDraftItem) {
    setDraftItems((current) => current.map((item) => (item.id === itemId ? updater(item) : item)));
  }

  function focusRepeatTicket(ticketId: number) {
    setSelectedRepeatTicketId(ticketId);
    if (typeof window === "undefined") {
      return;
    }
    window.requestAnimationFrame(() => {
      const target = document.querySelector<HTMLElement>(`[data-repeat-ticket-trigger="${ticketId}"]`);
      target?.focus();
    });
  }

  function handleRepeatTicketKeyDown(
    repeatTicketId: number,
    event: React.KeyboardEvent<HTMLElement>,
  ) {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") {
      return;
    }

    event.preventDefault();
    const currentIndex = repeatTickets.findIndex((repeatTicket) => repeatTicket.id === repeatTicketId);
    if (currentIndex === -1) {
      return;
    }

    const nextIndex =
      event.key === "ArrowDown"
        ? Math.min(currentIndex + 1, repeatTickets.length - 1)
        : Math.max(currentIndex - 1, 0);

    const nextTicket = repeatTickets[nextIndex];
    const nextPage = Math.floor(nextIndex / ticketsPerPage) + 1;
    setCurrentPage(nextPage);
    focusRepeatTicket(nextTicket.id);
  }

  function buildPayload() {
    const items = draftItems.map((item, index) => {
      const normalizedIdentifier = normalizeIdentifierNumber(item.identifierNumber);
      const amount = Number(item.amount);
      if (normalizedIdentifier.length !== 3 || Number.isNaN(amount) || amount <= 0) {
        return null;
      }
      return {
        identifier_number: normalizedIdentifier,
        amount: `${amount}.00`,
        amount_uses_allocation_basis: item.amountUsesAllocationBasis,
        use_permutations: item.usePermutations,
        position: index,
      };
    });

    if (items.some((item) => item === null)) {
      throw new Error("Every repeat ticket entry needs a valid identifier and amount.");
    }

    if (!items.length) {
      throw new Error("Add at least one repeat ticket entry.");
    }

    const validItems = items.filter(
      (item): item is NonNullable<(typeof items)[number]> => item !== null,
    );

    return {
      customer_name: customerName.trim(),
      notes,
      items: validItems,
    };
  }

  async function handleSaveRepeatTicket() {
    setIsSaving(true);
    try {
      const payload = buildPayload();
      if (editingRepeatTicket) {
        const updatedRepeatTicket = await updateRepeatTicket(editingRepeatTicket.id, payload);
        setRepeatTickets((current) =>
          sortRepeatTickets(
            current.map((repeatTicket) =>
              repeatTicket.id === updatedRepeatTicket.id ? updatedRepeatTicket : repeatTicket,
            ),
          ),
        );
        setToast({ type: "success", message: "Repeat ticket updated." });
      } else {
        const createdRepeatTicket = await createRepeatTicket(payload);
        setRepeatTickets((current) => sortRepeatTickets([createdRepeatTicket, ...current]));
        setSelectedRepeatTicketId(createdRepeatTicket.id);
        setToast({ type: "success", message: "Repeat ticket created." });
      }
      setIsModalOpen(false);
      resetModalState();
    } catch (error) {
      setToast({ type: "error", message: error instanceof Error ? error.message : "Request failed." });
    } finally {
      setIsSaving(false);
    }
  }

  async function handleGenerateTicket(repeatTicket: FlowBitRepeatTicket) {
    await processRepeatTicketQueue([repeatTicket.id]);
  }

  async function handleGenerateAll() {
    setIsGeneratingAll(true);
    try {
      await processRepeatTicketQueue(actionableRepeatTickets.map((repeatTicket) => repeatTicket.id), true);
    } catch (error) {
      setToast({ type: "error", message: error instanceof Error ? error.message : "Request failed." });
    }
  }

  async function processRepeatTicketQueue(
    queue: number[],
    isBatch = false,
    generatedCount = 0,
    unsuccessfulCount = 0,
  ) {
    if (!queue.length) {
      setBusyTicketId(null);
      setIsGeneratingAll(false);
      if (isBatch) {
        setToast({
          type: unsuccessfulCount ? "error" : "success",
          message: unsuccessfulCount
            ? `${generatedCount} repeat tickets generated, ${unsuccessfulCount} unsuccessful or skipped.`
            : `${generatedCount} repeat tickets generated successfully.`,
        });
      } else if (generatedCount > 0) {
        setToast({
          type: "success",
          message: "Repeat ticket generated successfully.",
        });
      }
      if (generatedCount > 0) {
        notifyTicketsUpdated();
        notifyDashboardUpdated();
      }
      await loadPageData();
      return;
    }

    const [currentTicketId, ...remainingQueue] = queue;
    const currentRepeatTicket = repeatTickets.find((repeatTicket) => repeatTicket.id === currentTicketId);
    if (!currentRepeatTicket) {
      await processRepeatTicketQueue(
        remainingQueue,
        isBatch,
        generatedCount,
        unsuccessfulCount + 1,
      );
      return;
    }

    setBusyTicketId(currentTicketId);
    try {
      const response = await generateRepeatTicket(currentTicketId);
      if (response.status === "CONFIRM_REQUIRED") {
        setBusyTicketId(null);
        setOverflowPrompt({
          repeatTicketId: currentTicketId,
          repeatTicketCode: getRepeatTicketCode(currentRepeatTicket),
          overflowItems: response.overflow_items || [],
          totalOverflowAmount: response.total_overflow_amount || "0",
          remainingQueue,
          generatedCount,
          unsuccessfulCount,
        });
        return;
      }

      await processRepeatTicketQueue(
        remainingQueue,
        isBatch,
        generatedCount + 1,
        unsuccessfulCount,
      );
    } catch (error) {
      if (!isBatch) {
        setToast({ type: "error", message: error instanceof Error ? error.message : "Request failed." });
      }
      await processRepeatTicketQueue(
        remainingQueue,
        isBatch,
        generatedCount,
        unsuccessfulCount + 1,
      );
    }
  }

  async function handleOverflowPromptConfirm() {
    if (!overflowPrompt) {
      return;
    }
    setBusyTicketId(overflowPrompt.repeatTicketId);
    try {
      const response: RepeatTicketGenerateResponse = await generateRepeatTicket(
        overflowPrompt.repeatTicketId,
        { confirm_spill_over: true },
      );
      setOverflowPrompt(null);
      await processRepeatTicketQueue(
        overflowPrompt.remainingQueue,
        overflowPrompt.remainingQueue.length > 0,
        overflowPrompt.generatedCount + (response.status === "GENERATED" ? 1 : 0),
        overflowPrompt.unsuccessfulCount + (response.status === "GENERATED" ? 0 : 1),
      );
    } catch (error) {
      setToast({ type: "error", message: error instanceof Error ? error.message : "Request failed." });
      const promptState = overflowPrompt;
      setOverflowPrompt(null);
      await processRepeatTicketQueue(
        promptState.remainingQueue,
        promptState.remainingQueue.length > 0,
        promptState.generatedCount,
        promptState.unsuccessfulCount + 1,
      );
    }
  }

  async function handleOverflowPromptDecline() {
    if (!overflowPrompt) {
      return;
    }
    const promptState = overflowPrompt;
    setOverflowPrompt(null);
    await processRepeatTicketQueue(
      promptState.remainingQueue,
      promptState.remainingQueue.length > 0,
      promptState.generatedCount,
      promptState.unsuccessfulCount + 1,
    );
  }

  async function handleDeleteRepeatTicket() {
    if (!deleteTarget) {
      return;
    }
    setIsSaving(true);
    try {
      await deleteRepeatTicket(deleteTarget.id);
      setRepeatTickets((current) => current.filter((repeatTicket) => repeatTicket.id !== deleteTarget.id));
      setToast({ type: "success", message: "Repeat ticket deleted." });
      setDeleteTarget(null);
    } catch (error) {
      setToast({ type: "error", message: error instanceof Error ? error.message : "Request failed." });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <>
      {toast ? (
        <AdminActionToast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      ) : null}

      <AdminConfirmModal
        open={Boolean(deleteTarget)}
        title="Delete repeat ticket"
        description={
          deleteTarget
            ? `Delete this repeat ticket for ${deleteTarget.customer_name || deleteTarget.generated_ticket_number || "Walk-in"}?`
            : ""
        }
        confirmLabel="Delete"
        showCodeInput={false}
        busy={isSaving}
        onCodeChange={() => {}}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleDeleteRepeatTicket}
      />

      <AdminConfirmModal
        open={Boolean(overflowPrompt)}
        title="Process spill over"
        description={
          overflowPrompt
            ? `${overflowPrompt.repeatTicketCode} will create spill over. Process this repeat ticket and continue?`
            : ""
        }
        confirmLabel="Process"
        showCodeInput={false}
        busy={busyTicketId === overflowPrompt?.repeatTicketId}
        onCodeChange={() => {}}
        onCancel={() => {
          void handleOverflowPromptDecline();
        }}
        onConfirm={() => {
          void handleOverflowPromptConfirm();
        }}
      >
        {overflowPrompt ? (
          <div className="space-y-3 text-sm text-stone-600">
            <div className="rounded-[18px] border border-stone-900/8 bg-stone-50 px-4 py-3">
              Total spill over {formatAmount(overflowPrompt.totalOverflowAmount)}
            </div>
            <div className="space-y-2">
              {overflowPrompt.overflowItems.map((item) => (
                <p key={`${item.identifier_number}-${item.overflow_amount}`}>
                  {item.identifier_number} spill over {formatAmount(item.overflow_amount)}
                </p>
              ))}
            </div>
          </div>
        ) : null}
      </AdminConfirmModal>

      <AppSectionPage
        eyebrow=""
        title=""
        description={`Reusable ticket templates${activePeriod ? ` for ${activePeriod.name}` : ""}.`}
        workspaceLabel=""
        headerClassName="hidden"
        layoutClassName="print:block"
        workspaceClassName="print:hidden"
        asideClassName="print:block"
        aside={
          <section className="ticket-history-print-shell h-[calc(100vh-6.5rem)] overflow-y-auto rounded-[28px] border border-stone-900/8 bg-white p-5 shadow-[0_8px_24px_rgba(28,24,20,0.04)] print:h-auto print:max-h-none print:overflow-visible print:rounded-none print:border-0 print:p-0 print:shadow-none sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-stone-400">Repeat ticket view</p>
              </div>
              {selectedRepeatTicket ? (
                <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] ${getStatusTone(selectedRepeatTicket.current_status)}`}>
                  {getStatusLabel(selectedRepeatTicket.current_status)}
                </span>
              ) : null}
            </div>

            {selectedRepeatTicket ? (
              <div className="mt-5 space-y-4">
                <div className="rounded-[24px] border border-dashed border-stone-300 bg-stone-50 p-5">
                  <div className="flex flex-wrap items-center gap-3">
                    <p className="text-2xl font-semibold text-stone-950">
                      {getRepeatTicketCode(selectedRepeatTicket)}
                    </p>
                    {selectedRepeatTicket.generated_ticket_number ? (
                      <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-stone-600">
                        {selectedRepeatTicket.generated_ticket_number}
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-4 grid gap-3 text-sm text-stone-600 sm:grid-cols-2">
                    <div className="space-y-1">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-400">Customer</p>
                      <p className="inline-flex items-center gap-2 font-medium text-stone-900">
                        <FontAwesomeIcon icon={faUser} className="h-3.5 w-3.5 text-stone-400" />
                        {getRepeatTicketCustomerName(selectedRepeatTicket.customer_name)}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-400">Total amount</p>
                      <p className="inline-flex items-center gap-2 font-medium text-stone-900">
                        <FontAwesomeIcon icon={faReceipt} className="h-3.5 w-3.5 text-stone-400" />
                        {formatAmount(selectedRepeatTicket.total_amount)}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-400">Entries</p>
                      <p className="font-medium text-stone-900">{selectedRepeatTicket.item_count} entries</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-400">Created</p>
                      <p className="font-medium text-stone-900">{formatRepeatTicketDate(selectedRepeatTicket.created_at)}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-400">Status</p>
                      <p className="font-medium text-stone-900">{getStatusLabel(selectedRepeatTicket.current_status)}</p>
                    </div>
                    {selectedRepeatTicket.generated_ticket_number ? (
                      <div className="space-y-1">
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-400">Generated ticket</p>
                        <p className="font-medium text-stone-900">{selectedRepeatTicket.generated_ticket_number}</p>
                      </div>
                    ) : null}
                  </div>
                  <p className="mt-4 text-sm leading-6 text-stone-500">
                    {selectedRepeatTicket.notes?.trim() || "No notes added."}
                  </p>
                </div>

                {selectedRepeatTicket.generation_error ? (
                  <div className="rounded-[22px] border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-700">
                    {selectedRepeatTicket.generation_error}
                  </div>
                ) : null}

                <div className="space-y-3">
                  {selectedRepeatTicket.items.flatMap((item) => {
                    const identifierNumbers = item.use_permutations
                      ? getPermutationNumbers(item.identifier_number)
                      : [item.identifier_number];
                    const displayAmount = getRepeatItemDisplayAmount(item.amount, item.amount_uses_allocation_basis);

                    return identifierNumbers.map((identifierNumber) => (
                      <div
                        key={`${item.id}-${identifierNumber}`}
                        className="rounded-[22px] border-2 border-stone-300 bg-stone-50 px-4 py-4 shadow-[inset_0_0_0_1px_rgba(41,37,36,0.04)]"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-lg font-semibold text-stone-950">
                            {identifierNumber}
                          </p>
                          <p className="text-lg font-semibold text-stone-950">
                            {formatAmount(displayAmount)}
                          </p>
                        </div>
                      </div>
                    ));
                  })}
                </div>

                <div className="rounded-[24px] border border-stone-900/8 bg-[#f3f0ea] px-4 py-4 text-sm text-stone-600">
                  <div className="flex items-center gap-2 font-semibold text-stone-900">
                    <FontAwesomeIcon icon={faClockRotateLeft} className="h-4 w-4 text-stone-500" />
                    Status reminders
                  </div>
                  <div className="mt-3 space-y-2">
                    <p><span className="font-semibold text-stone-900">New</span> means ready for the current period.</p>
                    <p><span className="font-semibold text-stone-900">Generated</span> means already created as a real ticket in this period.</p>
                    <p><span className="font-semibold text-stone-900">Updated</span> means the saved repeat ticket changed after generation, but it still will not generate again in the same period.</p>
                    <p><span className="font-semibold text-stone-900">Unsuccessful</span> means real ticket rules failed during generation and you can try again after fixing it.</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-5 rounded-[22px] border border-dashed border-stone-300 bg-stone-50 px-4 py-4 text-sm text-stone-500">
                Select a repeat ticket from the list to preview it here.
              </div>
            )}
          </section>
        }
      >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h1 className="mt-2 text-3xl font-semibold text-stone-950">Repeat Tickets</h1>
                <p className="mt-3 max-w-3xl text-sm leading-6 text-stone-500">
                  Save reusable ticket templates here, independent from periods and archive rules. When a new active period opens, generate them into real active tickets without losing the saved repeat tickets.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Button
                  variant="outline"
                  className={actionButtonClassName}
                  onClick={handleGenerateAll}
                  disabled={!canGenerate || !actionableRepeatTickets.length || isGeneratingAll}
                >
                  <FontAwesomeIcon icon={faArrowsRotate} className="h-3.5 w-3.5" />
                  {isGeneratingAll ? "Generating..." : "Generate all"}
                </Button>
                <Button className={actionButtonClassName} onClick={openCreateModal}>
                  <FontAwesomeIcon icon={faPlus} className="h-3.5 w-3.5" />
                  Add
                </Button>
              </div>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <div className="rounded-[22px] border border-stone-900/8 bg-stone-50 px-4 py-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-400">Repeat tickets</p>
                <p className="mt-2 text-3xl font-semibold text-stone-950">{repeatTickets.length}</p>
              </div>
              <div className="rounded-[22px] border border-stone-900/8 bg-stone-50 px-4 py-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-400">Ready to generate</p>
                <p className="mt-2 text-3xl font-semibold text-stone-950">{actionableRepeatTickets.length}</p>
              </div>
              <div className="rounded-[22px] border border-stone-900/8 bg-stone-50 px-4 py-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-400">Current period</p>
                <p className="mt-2 text-lg font-semibold text-stone-950">{activePeriod?.name ?? "No active period"}</p>
              </div>
            </div>

            <div className="mt-5 rounded-[24px] border border-stone-900/8 bg-[#f3f0ea] px-5 py-4 text-sm leading-6 text-stone-600">
              {!hasActivePeriod
                ? "You can still create and edit repeat tickets, but generation stays locked until an active period is opened."
                : activeStandardLedgerCount === 0
                  ? "You can save repeat tickets now, but generation is locked until you have at least one active standard ledger in the current period."
                  : "Generate is enabled for repeat tickets with New or Unsuccessful status. Generated and Updated tickets stay locked for the current period to prevent duplicates."}
            </div>

            <div className="mt-6 rounded-[28px] border border-stone-900/8 bg-white p-3 shadow-[0_8px_24px_rgba(28,24,20,0.04)]">
            <div className="h-[calc(100vh-18rem)] min-h-[34rem] space-y-4 overflow-y-auto pr-1">
              {isLoading ? (
                <div className="rounded-[24px] border border-dashed border-stone-300 bg-stone-50 px-5 py-10 text-sm text-stone-500">
                  Loading repeat tickets.
                </div>
              ) : pageError ? (
                <div className="rounded-[24px] border border-rose-200 bg-rose-50 px-5 py-5 text-sm text-rose-700">
                  {pageError}
                </div>
              ) : repeatTickets.length ? (
                paginatedRepeatTickets.map((repeatTicket) => {
                  const isGeneratedForPeriod =
                    repeatTicket.current_status === "GENERATED" ||
                    repeatTicket.current_status === "UPDATED";
                  const isSelected = selectedRepeatTicket?.id === repeatTicket.id;
                  return (
                    <div
                      key={repeatTicket.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => focusRepeatTicket(repeatTicket.id)}
                      onKeyDown={(event) => handleRepeatTicketKeyDown(repeatTicket.id, event)}
                      className={`rounded-[24px] border shadow-[0_8px_24px_rgba(28,24,20,0.04)] transition ${
                        isSelected
                          ? "border-stone-950 bg-white"
                          : "border-stone-900/8 bg-white"
                      } cursor-pointer`}
                    >
                      <div className="px-5 py-5">
                        <div className="flex items-start justify-between gap-3">
                          <button
                            type="button"
                            data-repeat-ticket-trigger={repeatTicket.id}
                            onClick={() => focusRepeatTicket(repeatTicket.id)}
                            onKeyDown={(event) => handleRepeatTicketKeyDown(repeatTicket.id, event)}
                            className="min-w-0 flex-1 text-left"
                          >
                            <div className="flex items-center gap-3 overflow-hidden">
                              <p className="truncate text-xl font-semibold text-stone-950">
                                {getRepeatTicketCode(repeatTicket)}
                              </p>
                              <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] ${getStatusTone(repeatTicket.current_status)}`}>
                                {getStatusLabel(repeatTicket.current_status)}
                              </span>
                              {repeatTicket.generation_error ? (
                                <span className="inline-flex items-center gap-2 rounded-full bg-rose-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-rose-700">
                                  <FontAwesomeIcon icon={faTriangleExclamation} className="h-3 w-3" />
                                  Needs attention
                                </span>
                              ) : null}
                            </div>
                          </button>
                          <div className="flex shrink-0 items-center gap-2 whitespace-nowrap">
                            <Button
                              variant="outline"
                              onClick={(event) => {
                                event.stopPropagation();
                                void handleGenerateTicket(repeatTicket);
                              }}
                              disabled={!canGenerate || isGeneratedForPeriod || busyTicketId === repeatTicket.id}
                            >
                              <FontAwesomeIcon icon={faCircleCheck} className="h-3.5 w-3.5" />
                              {busyTicketId === repeatTicket.id
                                ? "Generating..."
                                : isGeneratedForPeriod
                                  ? "Generated"
                                  : "Generate"}
                            </Button>
                            <Button
                              variant="outline"
                              onClick={(event) => {
                                event.stopPropagation();
                                openEditModal(repeatTicket);
                              }}
                            >
                              <FontAwesomeIcon icon={faPenToSquare} className="h-3.5 w-3.5" />
                              Edit
                            </Button>
                            <Button
                              variant="outline"
                              onClick={(event) => {
                                event.stopPropagation();
                                setDeleteTarget(repeatTicket);
                              }}
                            >
                              <FontAwesomeIcon icon={faTrashCan} className="h-3.5 w-3.5" />
                              Delete
                            </Button>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => focusRepeatTicket(repeatTicket.id)}
                          onKeyDown={(event) => handleRepeatTicketKeyDown(repeatTicket.id, event)}
                          className="mt-3 block w-full text-left"
                        >
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-stone-600">
                            <span className="inline-flex items-center gap-2">
                              <FontAwesomeIcon
                                icon={faReceipt}
                                className="h-3.5 w-3.5 text-stone-400"
                              />
                              {formatAmount(repeatTicket.total_amount)}
                            </span>
                            <span>{repeatTicket.item_count} entries</span>
                            <span>{getRepeatTicketCustomerName(repeatTicket.customer_name)}</span>
                            <span>{formatRepeatTicketDate(repeatTicket.created_at)}</span>
                            {repeatTicket.generated_ticket_number ? (
                              <span>{repeatTicket.generated_ticket_number}</span>
                            ) : null}
                          </div>
                        </button>
                      </div>

                      {repeatTicket.generation_error ? (
                        <div className={`mx-5 mb-5 rounded-[20px] border px-4 py-3 text-sm ${
                          "border-rose-200 bg-rose-50 text-rose-700"
                        }`}>
                          {repeatTicket.generation_error}
                        </div>
                      ) : null}
                    </div>
                  );
                })
              ) : (
                <div className="rounded-[24px] border border-dashed border-stone-300 bg-stone-50 px-5 py-10 text-sm text-stone-500">
                  No repeat tickets yet. Add one from the top-right button and keep reusable ticket templates here.
                </div>
              )}
            </div>
            <div className="mt-4 flex items-center justify-between gap-3 px-2">
              <p className="text-sm text-stone-500">
                Page {currentPage} of {totalPages}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => setCurrentPage((current) => Math.max(1, current - 1))}
                  disabled={currentPage === 1}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setCurrentPage((current) => Math.min(totalPages, current + 1))}
                  disabled={currentPage === totalPages}
                >
                  Next
                </Button>
              </div>
            </div>
            </div>
      </AppSectionPage>

      {isModalOpen ? (
        <div className="fixed inset-0 z-[80] overflow-y-auto bg-stone-950/35 px-4 py-8 sm:py-10" onClick={() => !isSaving && setIsModalOpen(false)}>
          <div className="mx-auto flex min-h-full items-start justify-center">
            <div className="w-full max-w-4xl overflow-hidden rounded-[30px] border border-stone-900/8 bg-white shadow-[0_18px_60px_rgba(24,24,24,0.22)]" onClick={(event) => event.stopPropagation()}>
              <div className="border-b border-stone-900/8 px-5 py-5 sm:px-6 sm:py-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-stone-400">Repeat Tickets</p>
                    <h2 className="mt-2 text-2xl font-semibold text-stone-950">
                      {editingRepeatTicket ? "Edit repeat ticket" : "Add repeat ticket"}
                    </h2>
                    <p className="mt-3 text-sm leading-6 text-stone-500">
                      This form keeps the same entry feel as ticket creation, but it does not check current-period capacity or preview allocation before saving.
                    </p>
                  </div>
                  <Button variant="outline" onClick={() => !isSaving && setIsModalOpen(false)}>Close</Button>
                </div>
              </div>

              <div className="max-h-[calc(100vh-22rem)] overflow-y-auto px-5 py-5 sm:px-6">
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="block space-y-2">
                    <span className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Customer name</span>
                    <Input value={customerName} onChange={(event) => setCustomerName(event.target.value)} placeholder="Customer name" disabled={isSaving} />
                  </label>
                  <label className="block space-y-2">
                    <span className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Notes</span>
                    <Input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Optional notes" disabled={isSaving} />
                  </label>
                </div>

                <div className="mt-6 space-y-4">
                  {draftItems.map((item, index) => {
                    const permutationCount = getPermutationCount(item.identifierNumber);
                    const normalizedIdentifier = normalizeIdentifierNumber(item.identifierNumber);
                    const hasValidIdentifier = normalizedIdentifier.length === 3;
                    return (
                      <div key={item.id} className="rounded-[24px] border border-stone-900/8 bg-stone-50 p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-stone-500">Entry {index + 1}</p>
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              onClick={() =>
                                setDraftItems((current) => [
                                  ...current,
                                  createDraftItem({
                                    identifierNumber: item.identifierNumber,
                                    amount: item.amount,
                                    amountUsesAllocationBasis: item.amountUsesAllocationBasis,
                                    usePermutations: item.usePermutations,
                                  }),
                                ])
                              }
                              disabled={isSaving}
                            >
                              <FontAwesomeIcon icon={faPlus} className="h-3.5 w-3.5" />
                              Duplicate
                            </Button>
                            {draftItems.length > 1 ? (
                              <Button
                                variant="outline"
                                onClick={() => setDraftItems((current) => current.filter((draft) => draft.id !== item.id))}
                                disabled={isSaving}
                              >
                                <FontAwesomeIcon icon={faTrashCan} className="h-3.5 w-3.5" />
                                Remove
                              </Button>
                            ) : null}
                          </div>
                        </div>

                        <div className="mt-4 grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                          <label className="space-y-2">
                            <span className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Identifier</span>
                            <Input
                              inputMode="numeric"
                              pattern="[0-9]*"
                              value={item.identifierNumber}
                              onChange={(event) => setDraftItemState(item.id, (current) => ({ ...current, identifierNumber: sanitizeIdentifierInput(event.target.value) }))}
                              placeholder="Enter identifier"
                              disabled={isSaving}
                            />
                            {!hasValidIdentifier && item.identifierNumber ? (
                              <p className="text-sm text-rose-600">Enter a 3-digit identifier.</p>
                            ) : null}
                          </label>

                          <label className="space-y-2">
                            <span className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Amount</span>
                            <div className="flex gap-2">
                              <Input
                                inputMode="numeric"
                                pattern="[0-9]*"
                                value={item.amount}
                                onChange={(event) => setDraftItemState(item.id, (current) => ({ ...current, amount: sanitizeAmountInput(event.target.value) }))}
                                placeholder="0.00"
                                disabled={isSaving}
                              />
                              {permutationCount > 1 ? (
                                <Button
                                  type="button"
                                  variant={item.usePermutations ? "default" : "outline"}
                                  className="h-12 w-20 rounded-[18px] px-0 whitespace-nowrap"
                                  onClick={() => setDraftItemState(item.id, (current) => ({ ...current, usePermutations: !current.usePermutations }))}
                                  disabled={isSaving}
                                >
                                  x{permutationCount}
                                </Button>
                              ) : null}
                              <Button
                                type="button"
                                variant={item.amountUsesAllocationBasis ? "default" : "outline"}
                                className="h-12 w-20 rounded-[18px] px-0 whitespace-nowrap"
                                onClick={() => setDraftItemState(item.id, (current) => ({ ...current, amountUsesAllocationBasis: !current.amountUsesAllocationBasis }))}
                                disabled={isSaving}
                              >
                                %
                              </Button>
                            </div>
                          </label>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="border-t border-stone-900/8 bg-white px-5 pb-6 pt-4 sm:px-6 sm:pb-6">
                <div className="flex min-h-[64px] items-center justify-between gap-3">
                <Button className="h-11 rounded-[18px]" variant="outline" onClick={() => setDraftItems((current) => [...current, createDraftItem()])} disabled={isSaving}>
                  <FontAwesomeIcon icon={faPlus} className="h-3.5 w-3.5" />
                  Add entry
                </Button>
                <Button className="h-11 min-w-[188px] justify-center self-center rounded-[18px]" onClick={handleSaveRepeatTicket} disabled={isSaving}>
                  {editingRepeatTicket ? "Save repeat ticket" : "Create repeat ticket"}
                </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
