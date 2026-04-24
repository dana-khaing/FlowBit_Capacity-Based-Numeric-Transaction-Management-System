"use client";

import { useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowDownWideShort,
  faCircleNotch,
  faFileInvoiceDollar,
  faLayerGroup,
  faPlus,
  faTicket,
} from "@fortawesome/free-solid-svg-icons";
import { AdminConfirmModal } from "@/components/admin/admin-confirm-modal";
import { AdminActionToast } from "@/components/admin/admin-action-toast";
import { WorkspaceShell } from "@/components/app/workspace-shell";
import {
  TicketItemRow,
  type TicketDraftItem,
} from "@/components/tickets/ticket-item-row";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { usePeriodState } from "@/components/period/use-period-state";
import { fetchLedgers, type FlowBitLedger } from "@/lib/ledger-client";
import {
  createTicket,
  fetchTickets,
  fetchIdentifierOptions,
  type FlowBitTicketListItem,
  previewTicketItemAllocation,
  type FlowBitIdentifierOption,
} from "@/lib/ticket-client";

type ToastState = {
  type: "success" | "error";
  message: string;
} | null;

type TicketSubmissionItem = {
  identifier: number;
  amount: string;
  allow_overflow: boolean;
  manual_allocations?: Array<{ ledger: number; amount: string }>;
};

type PendingOverflowSubmission = {
  items: TicketSubmissionItem[];
  overflowEntryCount: number;
  overflowAmount: number;
};

function createDraftItem(partial?: Partial<TicketDraftItem>): TicketDraftItem {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    identifierNumber: "",
    amount: "",
    manualMode: false,
    manualAllocations: {},
    preview: null,
    previewError: null,
    isPreviewing: false,
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
  const sanitized = value.replace(/[^0-9.]/g, "");
  const [whole = "", ...decimalParts] = sanitized.split(".");
  const decimal = decimalParts.join("").slice(0, 2);
  return decimalParts.length ? `${whole}.${decimal}` : whole;
}

function formatAmount(value: string) {
  const amount = Number(value);
  if (Number.isNaN(amount)) {
    return value;
  }
  return amount.toLocaleString("en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function buildManualAllocations(
  item: Pick<TicketDraftItem, "manualMode" | "manualAllocations">,
) {
  if (!item.manualMode) {
    return undefined;
  }

  const manualAllocations = Object.entries(item.manualAllocations)
    .map(([ledgerId, amount]) => ({
      ledger: Number(ledgerId),
      amount: amount.trim(),
    }))
    .filter(
      (allocation) => allocation.amount !== "" && Number(allocation.amount) > 0,
    );

  return manualAllocations.length ? manualAllocations : undefined;
}

export function TicketCreationPage() {
  const [customerName, setCustomerName] = useState("");
  const [items, setItems] = useState<TicketDraftItem[]>([createDraftItem()]);
  const [identifiers, setIdentifiers] = useState<FlowBitIdentifierOption[]>([]);
  const [activeLedgers, setActiveLedgers] = useState<FlowBitLedger[]>([]);
  const [recentTickets, setRecentTickets] = useState<FlowBitTicketListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRecentTicketsLoading, setIsRecentTicketsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState>(null);
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false);
  const [pendingOverflowSubmission, setPendingOverflowSubmission] =
    useState<PendingOverflowSubmission | null>(null);
  const [lastCreatedTicket, setLastCreatedTicket] = useState<{
    ticketNumber: string;
    customerName: string;
    entryCount: number;
    totalAmount: string;
  } | null>(null);

  const {
    activePeriod,
    hasActivePeriod,
    isLoading: isPeriodLoading,
    error: periodError,
  } = usePeriodState();

  const identifierMap = useMemo(
    () =>
      new Map(identifiers.map((identifier) => [identifier.number, identifier])),
    [identifiers],
  );
  const identifierOptions = useMemo(
    () => identifiers.map((identifier) => identifier.number),
    [identifiers],
  );
  const resolvedItems = useMemo(
    () =>
      items.map((item) => ({
        ...item,
        matchedIdentifier:
          identifierMap.get(normalizeIdentifierNumber(item.identifierNumber)) ||
          null,
        identifierError:
          hasAttemptedSubmit &&
          !identifierMap.get(normalizeIdentifierNumber(item.identifierNumber))
            ? "Choose a valid identifier."
            : null,
        amountError:
          hasAttemptedSubmit && (!(item.amount.trim()) || Number(item.amount) <= 0)
            ? "Enter an amount greater than zero."
            : null,
      })),
    [hasAttemptedSubmit, identifierMap, items],
  );
  const totalDraftAmount = useMemo(
    () =>
      items.reduce((sum, item) => {
        const amount = Number(item.amount);
        return sum + (Number.isNaN(amount) ? 0 : amount);
      }, 0),
    [items],
  );
  const hasAtLeastOneFilledEntry = useMemo(
    () =>
      items.some((item) => {
        const normalizedIdentifier = normalizeIdentifierNumber(item.identifierNumber);
        const amount = Number(item.amount);
        return Boolean(identifierMap.get(normalizedIdentifier)) && amount > 0;
      }),
    [identifierMap, items],
  );
  const hasWorkingLedgers = activeLedgers.length > 0;

  function formatEntryCount(count: number) {
    return `${count} ${count === 1 ? "entry" : "entries"}`;
  }

  async function loadRecentTickets() {
    setIsRecentTicketsLoading(true);
    try {
      const tickets = await fetchTickets();
      setRecentTickets(tickets.slice(0, 5));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Request failed.";
      setToast({ type: "error", message });
    } finally {
      setIsRecentTicketsLoading(false);
    }
  }

  useEffect(() => {
    if (!hasActivePeriod || !activePeriod) {
      setIsLoading(false);
      setIsRecentTicketsLoading(false);
      return;
    }

    let isMounted = true;
    setIsLoading(true);

    Promise.all([
      fetchIdentifierOptions(),
      fetchLedgers({ period_id: activePeriod.id }),
      fetchTickets(),
    ])
      .then(([nextIdentifiers, nextLedgers, tickets]) => {
        if (!isMounted) {
          return;
        }
        setIdentifiers(nextIdentifiers);
        setActiveLedgers(
          nextLedgers
            .filter((ledger) => ledger.is_active && !ledger.is_capacity_reserve)
            .slice()
            .sort((left, right) => left.priority - right.priority),
        );
        setRecentTickets(tickets.slice(0, 5));
        setPageError(null);
      })
      .catch((error) => {
        if (!isMounted) {
          return;
        }
        const message =
          error instanceof Error ? error.message : "Request failed.";
        setPageError(message);
        setToast({ type: "error", message });
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false);
          setIsRecentTicketsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [hasActivePeriod, activePeriod?.id]);

  function setItemState(
    itemId: string,
    updater: (item: TicketDraftItem) => TicketDraftItem,
  ) {
    setItems((current) =>
      current.map((item) => (item.id === itemId ? updater(item) : item)),
    );
  }

  function handleFieldChange(
    itemId: string,
    field: "identifierNumber" | "amount",
    value: string,
  ) {
    const nextValue =
      field === "identifierNumber"
        ? sanitizeIdentifierInput(value)
        : sanitizeAmountInput(value);

    setItemState(itemId, (item) => ({
      ...item,
      [field]: nextValue,
      preview: null,
      previewError: null,
    }));
    if (hasAttemptedSubmit) {
      setHasAttemptedSubmit(false);
    }
  }

  function handleAllocationModeChange(itemId: string, mode: "default" | "manual") {
    setItemState(itemId, (item) => ({
      ...item,
      manualMode: mode === "manual",
      manualAllocations: mode === "manual" ? item.manualAllocations : {},
      preview: null,
      previewError: null,
    }));
  }

  function handleManualAmountChange(
    itemId: string,
    ledgerId: number,
    value: string,
  ) {
    setItemState(itemId, (item) => ({
      ...item,
      manualAllocations: {
        ...item.manualAllocations,
        [ledgerId]: sanitizeAmountInput(value),
      },
      preview: null,
      previewError: null,
    }));
  }

  function addItem(partial?: Partial<TicketDraftItem>) {
    setItems((current) => [...current, createDraftItem(partial)]);
  }

  function duplicateItem(itemId: string) {
    const source = items.find((item) => item.id === itemId);
    if (!source) {
      return;
    }
    addItem({
      identifierNumber: source.identifierNumber,
      amount: source.amount,
      manualMode: source.manualMode,
      manualAllocations: { ...source.manualAllocations },
      preview: source.preview,
      previewError: source.previewError,
    });
  }

  function removeItem(itemId: string) {
    setItems((current) =>
      current.length === 1
        ? current
        : current.filter((item) => item.id !== itemId),
    );
  }

  async function previewItem(itemId: string) {
    if (!hasWorkingLedgers) {
      setToast({
        type: "error",
        message:
          "Create at least one working ledger before previewing ticket lines.",
      });
      return;
    }

    const draft = items.find((item) => item.id === itemId);
    if (!draft) {
      return;
    }

    const identifier = identifierMap.get(
      normalizeIdentifierNumber(draft.identifierNumber),
    );
    if (!identifier) {
      setItemState(itemId, (item) => ({
        ...item,
        preview: null,
        previewError: "Choose a valid identifier before previewing this line.",
        isPreviewing: false,
      }));
      return;
    }

    const amount = draft.amount.trim();
    if (!amount) {
      setItemState(itemId, (item) => ({
        ...item,
        preview: null,
        previewError: "Enter an amount before previewing this line.",
        isPreviewing: false,
      }));
      return;
    }

    setItemState(itemId, (item) => ({
      ...item,
      isPreviewing: true,
      previewError: null,
    }));

    try {
      const preview = await previewTicketItemAllocation({
        identifier: identifier.id,
        total_amount: amount,
        ...(buildManualAllocations(draft)
          ? { manual_allocations: buildManualAllocations(draft) }
          : {}),
      });
      setItemState(itemId, (item) => ({
        ...item,
        preview,
        previewError: null,
        isPreviewing: false,
      }));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Request failed.";
      setItemState(itemId, (item) => ({
        ...item,
        preview: null,
        previewError: message,
        isPreviewing: false,
      }));
    }
  }

  async function previewAllItems() {
    if (!hasWorkingLedgers) {
      setToast({
        type: "error",
        message:
          "Create at least one working ledger before previewing ticket lines.",
      });
      return;
    }

    for (const item of items) {
      await previewItem(item.id);
    }
  }

  async function prepareTicketSubmission() {
    setHasAttemptedSubmit(true);

    if (!hasWorkingLedgers) {
      setToast({
        type: "error",
        message: "Create at least one working ledger before creating tickets.",
      });
      return null;
    }

    if (!hasAtLeastOneFilledEntry) {
      setToast({
        type: "error",
        message: "Add at least one valid ticket entry before creating the ticket.",
      });
      return null;
    }

    const payloadItems: TicketSubmissionItem[] = [];
    const nextPreviewState = new Map<
      string,
      { preview: TicketDraftItem["preview"]; previewError: string | null }
    >();
    let overflowEntryCount = 0;
    let overflowAmount = 0;

    for (const item of items) {
      const identifier = identifierMap.get(
        normalizeIdentifierNumber(item.identifierNumber),
      );
      if (!identifier) {
        setToast({
          type: "error",
          message: "Every ticket line needs a valid identifier.",
        });
        return null;
      }

      const amount = item.amount.trim();
      if (!amount || Number(amount) <= 0) {
        setToast({
          type: "error",
          message: "Every ticket line needs an amount greater than zero.",
        });
        return null;
      }

      const manualAllocations = buildManualAllocations(item);
      try {
        const preview = await previewTicketItemAllocation({
          identifier: identifier.id,
          total_amount: amount,
          ...(manualAllocations ? { manual_allocations: manualAllocations } : {}),
        });
        nextPreviewState.set(item.id, { preview, previewError: null });
        if (preview.has_overflow) {
          overflowEntryCount += 1;
          overflowAmount += Number(preview.overflow_amount) || 0;
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Request failed.";
        nextPreviewState.set(item.id, { preview: null, previewError: message });
        setItems((current) =>
          current.map((currentItem) => {
            const nextState = nextPreviewState.get(currentItem.id);
            return nextState
              ? {
                  ...currentItem,
                  preview: nextState.preview,
                  previewError: nextState.previewError,
                  isPreviewing: false,
                }
              : currentItem;
          }),
        );
        setToast({ type: "error", message });
        return null;
      }

      payloadItems.push({
        identifier: identifier.id,
        amount,
        allow_overflow: true,
        ...(manualAllocations ? { manual_allocations: manualAllocations } : {}),
      });
    }

    setItems((current) =>
      current.map((item) => {
        const nextState = nextPreviewState.get(item.id);
        return nextState
          ? {
              ...item,
              preview: nextState.preview,
              previewError: nextState.previewError,
              isPreviewing: false,
            }
          : item;
      }),
    );

    return { items: payloadItems, overflowEntryCount, overflowAmount };
  }

  async function executeTicketCreate(payloadItems: TicketSubmissionItem[]) {
    setIsSubmitting(true);
    try {
      const response = await createTicket({
        customer_name: customerName.trim(),
        items: payloadItems,
      });
      await loadRecentTickets();
      if (response.errors?.length) {
        setToast({
          type: "error",
          message: `Ticket ${response.ticket_number || "draft"} saved with line issues.`,
        });
      } else {
        setToast({
          type: "success",
          message: `Ticket ${response.ticket?.ticket_number || response.ticket_number} created.`,
        });
        setLastCreatedTicket({
          ticketNumber: response.ticket?.ticket_number || response.ticket_number || "Pending",
          customerName:
            response.ticket?.customer_name || customerName.trim() || "Walk-in Customer",
          entryCount:
            response.ticket?.transaction_count ||
            response.transaction_count ||
            payloadItems.length,
          totalAmount:
            response.ticket?.total_amount ||
            response.total_amount ||
            formatAmount(String(totalDraftAmount)),
        });
        setCustomerName("");
        setItems([createDraftItem()]);
        setHasAttemptedSubmit(false);
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Request failed.";
      setToast({ type: "error", message });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSubmit() {
    const submissionDraft = await prepareTicketSubmission();
    if (!submissionDraft) {
      return;
    }

    if (submissionDraft.overflowEntryCount > 0) {
      setPendingOverflowSubmission(submissionDraft);
      return;
    }

    await executeTicketCreate(submissionDraft.items);
  }

  async function confirmOverflowSubmission() {
    if (!pendingOverflowSubmission) {
      return;
    }

    const payloadItems = pendingOverflowSubmission.items;
    setPendingOverflowSubmission(null);
    await executeTicketCreate(payloadItems);
  }

  if (isPeriodLoading) {
    return (
      <WorkspaceShell>
        <div className="mx-auto flex min-h-[60vh] w-full max-w-[1600px] items-center justify-center px-4 py-10 sm:px-6 lg:px-8">
          <div className="inline-flex items-center gap-3 rounded-full border border-stone-900/8 bg-white px-5 py-3 text-sm font-medium text-stone-600">
            <FontAwesomeIcon
              icon={faCircleNotch}
              className="h-4 w-4 animate-spin text-stone-400"
            />
            Checking period access for ticket entry.
          </div>
        </div>
      </WorkspaceShell>
    );
  }

  if (!hasActivePeriod) {
    return (
      <WorkspaceShell>
        <div className="mx-auto w-full max-w-[1600px] px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
          <section className="rounded-[28px] border border-stone-900/8 bg-white px-6 py-8 shadow-[0_8px_24px_rgba(28,24,20,0.04)]">
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-stone-400">
              Ticket entry
            </p>
            <h1 className="mt-3 text-4xl font-semibold tracking-[-0.02em] text-stone-950 sm:text-5xl">
              Create tickets is locked
            </h1>
            <p className="mt-4 max-w-3xl text-base leading-7 text-stone-500 sm:text-lg">
              {periodError ||
                "Create an active period first. Ticket creation stays locked until a period is in place."}
            </p>
          </section>
        </div>
      </WorkspaceShell>
    );
  }

  return (
      <WorkspaceShell>
      <div className="mx-auto w-full max-w-[1800px] px-4 pb-5 pt-3 sm:px-6 lg:px-8 lg:pb-8 lg:pt-4">
        {toast ? (
          <AdminActionToast
            message={toast.message}
            type={toast.type}
            onClose={() => setToast(null)}
          />
        ) : null}
        <AdminConfirmModal
          open={Boolean(pendingOverflowSubmission)}
          title="Spill over will be created"
          description={
            pendingOverflowSubmission
              ? `${formatEntryCount(
                  pendingOverflowSubmission.overflowEntryCount,
                )} will create spill over totaling ${formatAmount(
                  String(pendingOverflowSubmission.overflowAmount),
                )}.`
              : ""
          }
          confirmLabel="Create ticket"
          showCodeInput={false}
          busy={isSubmitting}
          onCodeChange={() => {}}
          onCancel={() => setPendingOverflowSubmission(null)}
          onConfirm={confirmOverflowSubmission}
        />

        <section className="mt-3 grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(340px,0.85fr)]">
          <div className="space-y-5">
            <article className="rounded-[28px] border border-stone-900/8 bg-[#f7f4ee] p-5 shadow-[0_8px_24px_rgba(28,24,20,0.03)] sm:p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-stone-400">
                    Ticket detail
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="outline"
                    className="rounded-[18px]"
                    onClick={previewAllItems}
                    disabled={
                      !hasWorkingLedgers ||
                      isLoading ||
                      items.some((item) => item.isPreviewing)
                    }
                  >
                    <FontAwesomeIcon
                      icon={faLayerGroup}
                      className="h-3.5 w-3.5"
                    />
                    Preview all
                  </Button>
                  <Button
                    className="rounded-[18px]"
                    onClick={() => addItem()}
                    disabled={!hasWorkingLedgers || isLoading}
                  >
                    <FontAwesomeIcon icon={faPlus} className="h-3.5 w-3.5" />
                    Add identifier
                  </Button>
                </div>
              </div>

              {pageError ? (
                <div className="mt-5 rounded-[22px] border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-700">
                  {pageError}
                </div>
              ) : null}

              {isLoading ? (
                <div className="mt-5 space-y-4">
                  {[0, 1].map((row) => (
                    <div
                      key={row}
                      className="animate-pulse rounded-[26px] border border-stone-900/8 bg-white p-5"
                    >
                      <div className="h-3 w-20 rounded-full bg-stone-200" />
                      <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,0.8fr)_auto]">
                        <div className="h-12 rounded-[18px] bg-stone-100" />
                        <div className="h-12 rounded-[18px] bg-stone-100" />
                        <div className="h-12 rounded-[18px] bg-stone-100" />
                      </div>
                      <div className="mt-4 h-14 rounded-[20px] bg-stone-100" />
                      <div className="mt-4 h-20 rounded-[22px] bg-stone-100" />
                    </div>
                  ))}
                </div>
              ) : !hasWorkingLedgers ? (
                <div className="mt-5 rounded-[22px] border border-dashed border-amber-300 bg-amber-50 px-4 py-5 text-sm text-amber-800">
                  No working ledgers are open for this account yet. The reserve
                  helper does not unlock ticket entry on its own. Create at
                  least one standard ledger first.
                </div>
              ) : identifiers.length === 0 ? (
                <div className="mt-5 rounded-[22px] border border-dashed border-stone-300 bg-white px-4 py-5 text-sm text-stone-500">
                  No identifiers are available yet. Create the first ledgers for
                  this user and FlowBit will rebuild the working identifier
                  list.
                </div>
              ) : (
                <div className="mt-5 space-y-4">
                  {resolvedItems.map((item, index) => (
                    <TicketItemRow
                      key={item.id}
                      item={item}
                      index={index}
                      identifier={item.matchedIdentifier}
                      identifierError={item.identifierError}
                      amountError={item.amountError}
                      activeLedgers={activeLedgers}
                      canRemove={resolvedItems.length > 1}
                      onFieldChange={handleFieldChange}
                      onAllocationModeChange={handleAllocationModeChange}
                      onManualAmountChange={handleManualAmountChange}
                      onRemove={removeItem}
                      onPreview={previewItem}
                      onDuplicate={duplicateItem}
                      identifierOptions={identifierOptions}
                    />
                  ))}
                </div>
              )}
            </article>
          </div>

          <aside className="space-y-5">
            <article className="rounded-[28px] border border-stone-900/8 bg-white p-5 shadow-[0_8px_24px_rgba(28,24,20,0.04)] sm:p-6">
              <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-stone-400">
                Ready to submit
              </p>
              <div className="mt-4 space-y-2">
                <span className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">
                  Customer name
                </span>
                <Input
                  value={customerName}
                  onChange={(event) => setCustomerName(event.target.value)}
                  placeholder="Customer or reference name"
                />
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-[22px] border border-stone-900/8 bg-stone-50 px-4 py-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-400">
                    Entry
                  </p>
                  <p className="mt-2 text-3xl font-semibold text-stone-950">
                    {items.length}
                  </p>
                </div>
                <div className="rounded-[22px] border border-stone-900/8 bg-stone-50 px-4 py-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-400">
                    Amount
                  </p>
                  <p className="mt-2 text-3xl font-semibold text-stone-950">
                    {formatAmount(String(totalDraftAmount))}
                  </p>
                </div>
              </div>

              {lastCreatedTicket ? (
                <div className="mt-4 rounded-[22px] border border-emerald-200 bg-emerald-50 px-4 py-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">
                    Last created ticket
                  </p>
                  <div className="mt-3 space-y-2 text-sm text-emerald-900">
                    <p className="text-lg font-semibold">{lastCreatedTicket.ticketNumber}</p>
                    <p>{lastCreatedTicket.customerName}</p>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-emerald-800">
                      <span>{formatEntryCount(lastCreatedTicket.entryCount)}</span>
                      <span>{lastCreatedTicket.totalAmount}</span>
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="mt-4 flex gap-3">
                <Button
                  className="flex-1 rounded-[18px]"
                  onClick={handleSubmit}
                  disabled={
                    isSubmitting ||
                    isLoading ||
                    !hasWorkingLedgers ||
                    identifiers.length === 0 ||
                    !hasAtLeastOneFilledEntry
                  }
                >
                  {isSubmitting ? (
                    <>
                      <FontAwesomeIcon
                        icon={faCircleNotch}
                        className="h-4 w-4 animate-spin"
                      />
                      Saving ticket
                    </>
                  ) : (
                    <>
                      <FontAwesomeIcon
                        icon={faFileInvoiceDollar}
                        className="h-4 w-4"
                      />
                      Create ticket
                    </>
                  )}
                </Button>
              </div>
            </article>

            <article className="rounded-[28px] border border-stone-900/8 bg-white p-5 shadow-[0_8px_24px_rgba(28,24,20,0.04)] sm:p-6">
              <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-stone-400">
                Latest result
              </p>
              {isRecentTicketsLoading ? (
                <div className="mt-5 space-y-3">
                  {[0, 1, 2].map((row) => (
                    <div
                      key={row}
                      className="animate-pulse rounded-[22px] border border-stone-900/8 bg-stone-50 px-4 py-4"
                    >
                      <div className="h-3 w-20 rounded-full bg-stone-200" />
                      <div className="mt-3 h-5 w-40 rounded-full bg-stone-200" />
                      <div className="mt-3 h-3 w-28 rounded-full bg-stone-200" />
                    </div>
                  ))}
                </div>
              ) : recentTickets.length ? (
                <div className="mt-5 space-y-3">
                  {recentTickets.map((ticket) => (
                    <div
                      key={ticket.id}
                      className="rounded-[22px] border border-stone-900/8 bg-stone-50 px-4 py-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-400">
                            Ticket
                          </p>
                          <p className="mt-2 text-lg font-semibold text-stone-950">
                            {ticket.ticket_number}
                          </p>
                        </div>
                        <span className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
                          <FontAwesomeIcon icon={faTicket} className="h-3 w-3" />
                          {formatEntryCount(ticket.transaction_count)}
                        </span>
                      </div>
                      <p className="mt-3 text-sm font-medium text-stone-700">
                        {ticket.customer_name || "Walk-in Customer"}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-stone-500">
                        <span>{formatAmount(ticket.total_amount)}</span>
                        <span>
                          {new Date(ticket.created_at).toLocaleString("en-GB", {
                            day: "2-digit",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-5 rounded-[22px] border border-dashed border-stone-300 bg-stone-50 px-4 py-4 text-sm text-stone-500">
                  No recent tickets yet for this account.
                </div>
              )}
            </article>
          </aside>
        </section>
      </div>
    </WorkspaceShell>
  );
}
