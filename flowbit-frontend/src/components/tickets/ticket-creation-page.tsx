"use client";

import { useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowDownWideShort,
  faCircleNotch,
  faFileInvoiceDollar,
  faLayerGroup,
  faPlus,
  faReceipt,
  faTicket,
} from "@fortawesome/free-solid-svg-icons";
import { AdminActionToast } from "@/components/admin/admin-action-toast";
import { WorkspaceShell } from "@/components/app/workspace-shell";
import { TicketItemRow, type TicketDraftItem } from "@/components/tickets/ticket-item-row";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { usePeriodState } from "@/components/period/use-period-state";
import { fetchLedgers, type FlowBitLedger } from "@/lib/ledger-client";
import {
  createTicket,
  fetchIdentifiers,
  previewTicketItemAllocation,
  type TicketCreateResponse,
  type FlowBitIdentifier,
} from "@/lib/ticket-client";

type ToastState = {
  type: "success" | "error";
  message: string;
} | null;

function createDraftItem(partial?: Partial<TicketDraftItem>): TicketDraftItem {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    identifierNumber: "",
    amount: "",
    allowOverflow: true,
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

function buildManualAllocations(item: Pick<TicketDraftItem, "manualMode" | "manualAllocations">) {
  if (!item.manualMode) {
    return undefined;
  }

  const manualAllocations = Object.entries(item.manualAllocations)
    .map(([ledgerId, amount]) => ({ ledger: Number(ledgerId), amount: amount.trim() }))
    .filter((allocation) => allocation.amount !== "" && Number(allocation.amount) > 0);

  return manualAllocations.length ? manualAllocations : undefined;
}

export function TicketCreationPage() {
  const [customerName, setCustomerName] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<TicketDraftItem[]>([createDraftItem()]);
  const [identifiers, setIdentifiers] = useState<FlowBitIdentifier[]>([]);
  const [activeLedgers, setActiveLedgers] = useState<FlowBitLedger[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState>(null);
  const [submission, setSubmission] = useState<TicketCreateResponse | null>(null);

  const { activePeriod, hasActivePeriod, isLoading: isPeriodLoading, error: periodError } = usePeriodState();

  const identifierMap = useMemo(
    () => new Map(identifiers.map((identifier) => [identifier.number, identifier])),
    [identifiers],
  );
  const identifierOptions = useMemo(() => identifiers.map((identifier) => identifier.number), [identifiers]);
  const resolvedItems = useMemo(
    () =>
      items.map((item) => ({
        ...item,
        matchedIdentifier: identifierMap.get(normalizeIdentifierNumber(item.identifierNumber)) || null,
      })),
    [identifierMap, items],
  );
  const totalDraftAmount = useMemo(
    () =>
      items.reduce((sum, item) => {
        const amount = Number(item.amount);
        return sum + (Number.isNaN(amount) ? 0 : amount);
      }, 0),
    [items],
  );
  const previewedCount = useMemo(() => items.filter((item) => item.preview !== null).length, [items]);
  const manuallyDirectedCount = useMemo(
    () => items.filter((item) => buildManualAllocations(item)?.length).length,
    [items],
  );
  const hasWorkingLedgers = activeLedgers.length > 0;

  useEffect(() => {
    if (!hasActivePeriod || !activePeriod) {
      setIsLoading(false);
      return;
    }

    let isMounted = true;
    setIsLoading(true);

    Promise.all([fetchIdentifiers(), fetchLedgers({ period_id: activePeriod.id })])
      .then(([nextIdentifiers, nextLedgers]) => {
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
        setPageError(null);
      })
      .catch((error) => {
        if (!isMounted) {
          return;
        }
        const message = error instanceof Error ? error.message : "Request failed.";
        setPageError(message);
        setToast({ type: "error", message });
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [hasActivePeriod, activePeriod?.id]);

  function setItemState(itemId: string, updater: (item: TicketDraftItem) => TicketDraftItem) {
    setItems((current) => current.map((item) => (item.id === itemId ? updater(item) : item)));
  }

  function handleFieldChange(itemId: string, field: "identifierNumber" | "amount", value: string) {
    setItemState(itemId, (item) => ({
      ...item,
      [field]: value,
      preview: null,
      previewError: null,
    }));
  }

  function handleAllowOverflowChange(itemId: string, checked: boolean) {
    setItemState(itemId, (item) => ({
      ...item,
      allowOverflow: checked,
    }));
  }

  function handleManualModeChange(itemId: string, checked: boolean) {
    setItemState(itemId, (item) => ({
      ...item,
      manualMode: checked,
      manualAllocations: checked ? item.manualAllocations : {},
      preview: null,
      previewError: null,
    }));
  }

  function handleManualAmountChange(itemId: string, ledgerId: number, value: string) {
    setItemState(itemId, (item) => ({
      ...item,
      manualAllocations: {
        ...item.manualAllocations,
        [ledgerId]: value,
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
      allowOverflow: source.allowOverflow,
      manualMode: source.manualMode,
      manualAllocations: { ...source.manualAllocations },
      preview: source.preview,
      previewError: source.previewError,
    });
  }

  function removeItem(itemId: string) {
    setItems((current) => (current.length === 1 ? current : current.filter((item) => item.id !== itemId)));
  }

  async function previewItem(itemId: string) {
    if (!hasWorkingLedgers) {
      setToast({ type: "error", message: "Create at least one working ledger before previewing ticket lines." });
      return;
    }

    const draft = items.find((item) => item.id === itemId);
    if (!draft) {
      return;
    }

    const identifier = identifierMap.get(normalizeIdentifierNumber(draft.identifierNumber));
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

    setItemState(itemId, (item) => ({ ...item, isPreviewing: true, previewError: null }));

    try {
      const preview = await previewTicketItemAllocation({
        identifier: identifier.id,
        total_amount: amount,
        ...(buildManualAllocations(draft) ? { manual_allocations: buildManualAllocations(draft) } : {}),
      });
      setItemState(itemId, (item) => ({
        ...item,
        preview,
        previewError: null,
        isPreviewing: false,
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Request failed.";
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
      setToast({ type: "error", message: "Create at least one working ledger before previewing ticket lines." });
      return;
    }

    for (const item of items) {
      await previewItem(item.id);
    }
  }

  async function handleSubmit() {
    if (!hasWorkingLedgers) {
      setToast({ type: "error", message: "Create at least one working ledger before creating tickets." });
      return;
    }

    const payloadItems: Array<{
      identifier: number;
      amount: string;
      allow_overflow: boolean;
      manual_allocations?: Array<{ ledger: number; amount: string }>;
    }> = [];

    for (const item of items) {
      const identifier = identifierMap.get(normalizeIdentifierNumber(item.identifierNumber));
      if (!identifier) {
        setToast({ type: "error", message: "Every ticket line needs a valid identifier." });
        return;
      }

      const amount = item.amount.trim();
      if (!amount || Number(amount) <= 0) {
        setToast({ type: "error", message: "Every ticket line needs an amount greater than zero." });
        return;
      }

      const manualAllocations = buildManualAllocations(item);
      payloadItems.push({
        identifier: identifier.id,
        amount,
        allow_overflow: item.allowOverflow,
        ...(manualAllocations ? { manual_allocations: manualAllocations } : {}),
      });
    }

    setIsSubmitting(true);
    try {
      const response = await createTicket({
        customer_name: customerName.trim(),
        notes: notes.trim(),
        items: payloadItems,
      });
      setSubmission(response);
      if (response.errors?.length) {
        setToast({ type: "error", message: `Ticket ${response.ticket_number || "draft"} saved with line issues.` });
      } else {
        setToast({ type: "success", message: `Ticket ${response.ticket?.ticket_number || response.ticket_number} created.` });
        setCustomerName("");
        setNotes("");
        setItems([createDraftItem()]);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Request failed.";
      setToast({ type: "error", message });
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isPeriodLoading) {
    return (
      <WorkspaceShell>
        <div className="mx-auto flex min-h-[60vh] w-full max-w-[1600px] items-center justify-center px-4 py-10 sm:px-6 lg:px-8">
          <div className="inline-flex items-center gap-3 rounded-full border border-stone-900/8 bg-white px-5 py-3 text-sm font-medium text-stone-600">
            <FontAwesomeIcon icon={faCircleNotch} className="h-4 w-4 animate-spin text-stone-400" />
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
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-stone-400">Ticket entry</p>
            <h1 className="mt-3 text-4xl font-semibold tracking-[-0.02em] text-stone-950 sm:text-5xl">Create tickets is locked</h1>
            <p className="mt-4 max-w-3xl text-base leading-7 text-stone-500 sm:text-lg">
              {periodError || "Create an active period first. Ticket creation stays locked until a period is in place."}
            </p>
          </section>
        </div>
      </WorkspaceShell>
    );
  }

  return (
    <WorkspaceShell>
      <div className="mx-auto w-full max-w-[1800px] px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
        {toast ? <AdminActionToast message={toast.message} type={toast.type} onClose={() => setToast(null)} /> : null}

        <section className="rounded-[28px] border border-stone-900/8 bg-white px-5 py-6 shadow-[0_8px_24px_rgba(28,24,20,0.04)] sm:px-8 sm:py-8">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <p className="text-sm font-medium uppercase tracking-[0.2em] text-stone-400">Ticket entry</p>
              <h1 className="mt-3 text-4xl font-semibold tracking-[-0.02em] text-stone-950 sm:text-5xl">Create tickets</h1>
              <p className="mt-4 max-w-3xl text-base leading-7 text-stone-500 sm:text-lg">
                Build a ticket with multiple lines, preview how each entry will use your current ledgers, and decide whether any shortfall should continue as spill over.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3 xl:justify-end">
              <span className="inline-flex items-center gap-2 rounded-full border border-stone-900/8 bg-stone-50 px-4 py-2 text-sm font-medium text-stone-600">
                <FontAwesomeIcon icon={faTicket} className="h-4 w-4 text-stone-400" />
                Period active {activePeriod?.name}
              </span>
              <span className="inline-flex items-center gap-2 rounded-full border border-stone-900/8 bg-stone-50 px-4 py-2 text-sm font-medium text-stone-600">
                <FontAwesomeIcon icon={faArrowDownWideShort} className="h-4 w-4 text-stone-400" />
                Private ticket workspace
              </span>
            </div>
          </div>
        </section>

        <section className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(340px,0.85fr)]">
          <div className="space-y-5">
            <article className="rounded-[28px] border border-stone-900/8 bg-white p-5 shadow-[0_8px_24px_rgba(28,24,20,0.04)] sm:p-6">
              <div className="flex items-center gap-3">
                <span className="inline-flex h-12 w-12 items-center justify-center rounded-[18px] bg-stone-100 text-stone-700">
                  <FontAwesomeIcon icon={faReceipt} className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-stone-400">Ticket details</p>
                  <h2 className="mt-1 text-2xl font-semibold text-stone-950">Ticket header</h2>
                </div>
              </div>

              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <label className="space-y-2 md:col-span-1">
                  <span className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Customer name</span>
                  <Input value={customerName} onChange={(event) => setCustomerName(event.target.value)} placeholder="Customer or reference name" />
                </label>
                <label className="space-y-2 md:col-span-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Notes</span>
                  <textarea
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    placeholder="Add any note you want to keep with this ticket."
                    className="min-h-[120px] w-full rounded-[18px] border border-stone-900/10 bg-stone-50 px-4 py-3 text-base text-stone-950 outline-none transition placeholder:text-stone-400 focus:border-stone-950"
                  />
                </label>
              </div>
            </article>

            <article className="rounded-[28px] border border-stone-900/8 bg-[#f7f4ee] p-5 shadow-[0_8px_24px_rgba(28,24,20,0.03)] sm:p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-stone-400">Ticket lines</p>
                  <h2 className="mt-1 text-2xl font-semibold text-stone-950">Amounts and identifiers</h2>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="outline"
                    className="rounded-[18px]"
                    onClick={previewAllItems}
                    disabled={!hasWorkingLedgers || isLoading || items.some((item) => item.isPreviewing)}
                  >
                    <FontAwesomeIcon icon={faLayerGroup} className="h-3.5 w-3.5" />
                    Preview all
                  </Button>
                  <Button className="rounded-[18px]" onClick={() => addItem()}>
                    <FontAwesomeIcon icon={faPlus} className="h-3.5 w-3.5" />
                    Add line
                  </Button>
                </div>
              </div>

              {pageError ? (
                <div className="mt-5 rounded-[22px] border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-700">{pageError}</div>
              ) : null}

              {isLoading ? (
                <div className="mt-5 rounded-[22px] border border-stone-900/8 bg-white px-4 py-5 text-sm text-stone-500">
                  Loading identifiers and ledgers for this ticket workspace.
                </div>
              ) : !hasWorkingLedgers ? (
                <div className="mt-5 rounded-[22px] border border-dashed border-amber-300 bg-amber-50 px-4 py-5 text-sm text-amber-800">
                  No working ledgers are open for this account yet. The reserve helper does not unlock ticket entry on its own. Create at least one standard ledger first.
                </div>
              ) : identifiers.length === 0 ? (
                <div className="mt-5 rounded-[22px] border border-dashed border-stone-300 bg-white px-4 py-5 text-sm text-stone-500">
                  No identifiers are available yet. Create the first ledgers for this user and FlowBit will rebuild the working identifier list.
                </div>
              ) : (
                <div className="mt-5 space-y-4">
                  {resolvedItems.map((item, index) => (
                    <TicketItemRow
                      key={item.id}
                      item={item}
                      index={index}
                      identifier={item.matchedIdentifier}
                      activeLedgers={activeLedgers}
                      canRemove={resolvedItems.length > 1}
                      onFieldChange={handleFieldChange}
                      onAllowOverflowChange={handleAllowOverflowChange}
                      onManualModeChange={handleManualModeChange}
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
              <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-stone-400">Ready to submit</p>
              <h2 className="mt-1 text-2xl font-semibold text-stone-950">Ticket summary</h2>

              <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                <div className="rounded-[22px] border border-stone-900/8 bg-stone-50 px-4 py-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-400">Ticket lines</p>
                  <p className="mt-2 text-3xl font-semibold text-stone-950">{items.length}</p>
                </div>
                <div className="rounded-[22px] border border-stone-900/8 bg-stone-50 px-4 py-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-400">Previewed</p>
                  <p className="mt-2 text-3xl font-semibold text-stone-950">{previewedCount}</p>
                </div>
                <div className="rounded-[22px] border border-stone-900/8 bg-stone-50 px-4 py-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-400">Manual lines</p>
                  <p className="mt-2 text-3xl font-semibold text-stone-950">{manuallyDirectedCount}</p>
                </div>
                <div className="rounded-[22px] border border-stone-900/8 bg-stone-50 px-4 py-4 sm:col-span-2 xl:col-span-1">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-400">Draft amount</p>
                  <p className="mt-2 text-3xl font-semibold text-stone-950">{formatAmount(String(totalDraftAmount))}</p>
                </div>
              </div>

              <div className="mt-5 rounded-[22px] border border-stone-900/8 bg-[#f7f4ee] px-4 py-4 text-sm leading-6 text-stone-600">
                {!hasWorkingLedgers
                  ? "Ticket creation stays locked until this account has at least one working ledger. The reserve helper does not count as a working ledger."
                  : "Leave manual allocation off to let FlowBit fill ledgers by priority automatically. Turn it on for any line where you want to direct specific amounts into chosen ledgers first."}
              </div>

              <div className="mt-5 flex gap-3">
                <Button
                  className="flex-1 rounded-[18px]"
                  onClick={handleSubmit}
                  disabled={isSubmitting || isLoading || !hasWorkingLedgers || identifiers.length === 0}
                >
                  {isSubmitting ? (
                    <>
                      <FontAwesomeIcon icon={faCircleNotch} className="h-4 w-4 animate-spin" />
                      Saving ticket
                    </>
                  ) : (
                    <>
                      <FontAwesomeIcon icon={faFileInvoiceDollar} className="h-4 w-4" />
                      Create ticket
                    </>
                  )}
                </Button>
              </div>
            </article>

            <article className="rounded-[28px] border border-stone-900/8 bg-white p-5 shadow-[0_8px_24px_rgba(28,24,20,0.04)] sm:p-6">
              <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-stone-400">Latest result</p>
              <h2 className="mt-1 text-2xl font-semibold text-stone-950">Submission status</h2>

              {submission ? (
                <div className="mt-5 space-y-4 text-sm text-stone-600">
                  <div className="rounded-[22px] border border-stone-900/8 bg-stone-50 px-4 py-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-400">Ticket</p>
                    <p className="mt-2 text-lg font-semibold text-stone-950">{submission.ticket?.ticket_number || submission.ticket_number || "Pending"}</p>
                    <p className="mt-2 leading-6 text-stone-500">
                      {submission.errors?.length
                        ? `${submission.created?.length || 0} lines saved, ${submission.errors.length} line issues returned.`
                        : `${submission.ticket?.transaction_count || submission.transaction_count || 0} lines saved successfully.`}
                    </p>
                  </div>

                  {submission.errors?.length ? (
                    <div className="rounded-[22px] border border-amber-200 bg-amber-50 px-4 py-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-700">Item issues</p>
                      <ul className="mt-3 space-y-2 leading-6 text-amber-800">
                        {submission.errors.map((error) => (
                          <li key={error}>{error}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="mt-5 rounded-[22px] border border-dashed border-stone-300 bg-stone-50 px-4 py-4 text-sm text-stone-500">
                  Once you submit a ticket, the saved ticket number and any line issues will appear here.
                </div>
              )}
            </article>
          </aside>
        </section>
      </div>
    </WorkspaceShell>
  );
}
