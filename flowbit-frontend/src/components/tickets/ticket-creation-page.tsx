"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowUpRightFromSquare,
  faArrowDownWideShort,
  faCircleNotch,
  faFileInvoiceDollar,
  faLayerGroup,
  faPlus,
  faTicket,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import { AdminConfirmModal } from "@/components/admin/admin-confirm-modal";
import { AdminActionToast } from "@/components/admin/admin-action-toast";
import { notifyTicketsUpdated } from "@/components/app/workspace-events";
import { WorkspaceShell } from "@/components/app/workspace-shell";
import { TicketReceiptCard } from "@/components/tickets/ticket-receipt-card";
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
  fetchIdentifierCapacity,
  fetchTicketDetail,
  fetchTickets,
  fetchIdentifierOptions,
  type FlowBitTicketDetail,
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
  overflowDetails: Array<{ identifier: string; amount: number }>;
};

type PendingFocusState = {
  itemId: string;
  field: "identifier" | "amount";
} | null;

function createDraftItem(partial?: Partial<TicketDraftItem>): TicketDraftItem {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    identifierNumber: "",
    amount: "",
    amountUsesAllocationBasis: false,
    permutationIdentifiers: null,
    manualMode: false,
    manualAllocations: {},
    preview: null,
    previewPermutationDetails: null,
    previewError: null,
    isPreviewing: false,
    isTakingAll: false,
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

function toTakeAllAmount(remainingCapacity: string) {
  const remaining = Number(remainingCapacity);
  if (Number.isNaN(remaining) || remaining <= 0) {
    return "0";
  }
  return String(Math.floor(remaining / 1.25));
}

function formatWholeAmount(value: string | number) {
  const amount = Number(value);
  if (Number.isNaN(amount)) {
    return typeof value === "string" ? value : "0";
  }

  return amount.toLocaleString("en-GB", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

function formatDecimalInput(value: number) {
  if (Number.isNaN(value) || value <= 0) {
    return "0.00";
  }
  return value.toFixed(2);
}

function getEffectiveTicketAmount(
  item: Pick<TicketDraftItem, "amount" | "amountUsesAllocationBasis">,
) {
  const amount = Number(item.amount);
  if (Number.isNaN(amount) || amount <= 0) {
    return "";
  }

  return item.amountUsesAllocationBasis
    ? formatDecimalInput(amount / 1.25)
    : item.amount.trim();
}

function getAllocationBasisAmount(
  item: Pick<TicketDraftItem, "amount" | "amountUsesAllocationBasis">,
) {
  const amount = Number(item.amount);
  if (Number.isNaN(amount) || amount <= 0) {
    return "";
  }

  return item.amountUsesAllocationBasis
    ? item.amount.trim()
    : formatDecimalInput(amount * 1.25);
}

function formatAmount(value: string) {
  return formatWholeAmount(value);
}

function buildOverflowDescription(pendingOverflowSubmission: PendingOverflowSubmission) {
  const overflowDetails = pendingOverflowSubmission.overflowDetails || [];
  const header = `${formatEntryCount(
    pendingOverflowSubmission.overflowEntryCount,
  )} will create spill over totaling ${formatAmount(
    String(pendingOverflowSubmission.overflowAmount),
  )}.`;

  const detailLines = overflowDetails
    .map(
      (detail) => `${detail.identifier} spill over ${formatAmount(String(detail.amount))}`,
    )
    .slice(0, 6);

  if (!detailLines.length) {
    return header;
  }

  const remainingCount = overflowDetails.length - detailLines.length;

  return `${header}\n\n${detailLines.join("\n")}${
    remainingCount > 0 ? `\n+ ${remainingCount} more` : ""
  }`;
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

function buildIdentifierPermutations(identifierNumber: string) {
  const digits = identifierNumber.replace(/\D/g, "");
  if (digits.length !== 3) {
    return [];
  }

  const permutations = new Set<string>();
  for (let i = 0; i < digits.length; i += 1) {
    for (let j = 0; j < digits.length; j += 1) {
      if (j === i) {
        continue;
      }
      for (let k = 0; k < digits.length; k += 1) {
        if (k === i || k === j) {
          continue;
        }
        permutations.add(`${digits[i]}${digits[j]}${digits[k]}`);
      }
    }
  }

  const ordered = Array.from(permutations);
  ordered.sort((left, right) => {
    if (left === digits) {
      return -1;
    }
    if (right === digits) {
      return 1;
    }
    return left.localeCompare(right);
  });
  return ordered;
}

function formatEntryCount(count: number) {
  return `${count} ${count === 1 ? "entry" : "entries"}`;
}

export function TicketCreationPage() {
  const [customerName, setCustomerName] = useState("");
  const [items, setItems] = useState<TicketDraftItem[]>([createDraftItem()]);
  const [identifiers, setIdentifiers] = useState<FlowBitIdentifierOption[]>([]);
  const [activeLedgers, setActiveLedgers] = useState<FlowBitLedger[]>([]);
  const [identifierCapacityMap, setIdentifierCapacityMap] = useState<
    Record<
      number,
      {
        remainingCapacity: string;
        isFrozenAllLedgers: boolean;
        freezeStatus: "none" | "partial" | "all";
        ledgerCapacityRows: Array<{
          ledgerId: number;
          ledgerName: string;
          priority: number;
          isCapacityReserve: boolean;
          totalCapacity: string;
          allocatedAmount: string;
          remainingCapacity: string;
          isFrozen: boolean;
          isFull: boolean;
        }>;
      }
    >
  >({});
  const [recentTickets, setRecentTickets] = useState<FlowBitTicketListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRecentTicketsLoading, setIsRecentTicketsLoading] = useState(true);
  const [isRecentTicketDetailLoading, setIsRecentTicketDetailLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState>(null);
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false);
  const [pendingFocus, setPendingFocus] = useState<PendingFocusState>(null);
  const [pendingOverflowSubmission, setPendingOverflowSubmission] =
    useState<PendingOverflowSubmission | null>(null);
  const [selectedRecentTicketNumber, setSelectedRecentTicketNumber] =
    useState<string | null>(null);
  const [selectedRecentTicket, setSelectedRecentTicket] =
    useState<FlowBitTicketDetail | null>(null);
  const [lastCreatedTicket, setLastCreatedTicket] = useState<{
    ticketNumber: string;
    customerName: string;
    entryCount: number;
    totalAmount: string;
  } | null>(null);
  const ticketFieldRefs = useRef<
    Record<string, { identifier: HTMLInputElement | null; amount: HTMLInputElement | null }>
  >({});

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
          hasAttemptedSubmit && !getEffectiveTicketAmount(item)
            ? "Enter an amount greater than zero."
            : null,
      })),
    [hasAttemptedSubmit, identifierMap, items],
  );
  const totalDraftAmount = useMemo(
    () =>
      items.reduce((sum, item) => {
        const amount = Number(getEffectiveTicketAmount(item));
        const multiplier = item.permutationIdentifiers?.length || 1;
        return sum + (Number.isNaN(amount) ? 0 : amount * multiplier);
      }, 0),
    [items],
  );
  const hasAtLeastOneFilledEntry = useMemo(
    () =>
      items.some((item) => {
        const normalizedIdentifier = normalizeIdentifierNumber(item.identifierNumber);
        const amount = Number(getEffectiveTicketAmount(item));
        return Boolean(identifierMap.get(normalizedIdentifier)) && amount > 0;
      }),
    [identifierMap, items],
  );
  const workingLedgers = useMemo(
    () =>
      activeLedgers
        .filter((ledger) => !ledger.is_capacity_reserve)
        .slice()
        .sort((left, right) => left.priority - right.priority),
    [activeLedgers],
  );
  const hasWorkingLedgers = workingLedgers.length > 0;

  useEffect(() => {
    if (!pendingFocus) {
      return;
    }

    let frameId = 0;

    const focusPendingField = () => {
      const targetInput =
        ticketFieldRefs.current[pendingFocus.itemId]?.[pendingFocus.field];
      if (!targetInput) {
        return;
      }

      targetInput.focus();
      targetInput.select();
      setPendingFocus(null);
    };

    frameId = window.requestAnimationFrame(focusPendingField);

    return () => window.cancelAnimationFrame(frameId);
  }, [items, pendingFocus]);

  function handleTicketFieldRefReady(
    itemId: string,
    field: "identifier" | "amount",
    element: HTMLInputElement | null,
  ) {
    if (!ticketFieldRefs.current[itemId]) {
      ticketFieldRefs.current[itemId] = { identifier: null, amount: null };
    }

    ticketFieldRefs.current[itemId][field] = element;
  }

  function getCustomerDisplayName(value: string | null | undefined) {
    const normalized = (value ?? "").trim();
    if (!normalized || normalized.startsWith("Walk-in ")) {
      return "-";
    }

    return normalized;
  }

  async function loadRecentTickets() {
    setIsRecentTicketsLoading(true);
    try {
      const tickets = await fetchTickets({ periodId: activePeriod?.id, limit: 5 });
      setRecentTickets(tickets);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Request failed.";
      setToast({ type: "error", message });
    } finally {
      setIsRecentTicketsLoading(false);
    }
  }

  async function openRecentTicket(ticketNumber: string) {
    setSelectedRecentTicketNumber(ticketNumber);
    setSelectedRecentTicket(null);
    setIsRecentTicketDetailLoading(true);
    try {
      const detail = await fetchTicketDetail(ticketNumber);
      setSelectedRecentTicket(detail);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Request failed.";
      setToast({ type: "error", message });
      setSelectedRecentTicketNumber(null);
    } finally {
      setIsRecentTicketDetailLoading(false);
    }
  }

  function closeRecentTicket() {
    setSelectedRecentTicketNumber(null);
    setSelectedRecentTicket(null);
    setIsRecentTicketDetailLoading(false);
  }

  useEffect(() => {
    if (!hasActivePeriod || !activePeriod) {
      setIsLoading(false);
      setIsRecentTicketsLoading(false);
      return;
    }

    let isMounted = true;
    setIsLoading(true);
    setIsRecentTicketsLoading(true);

    Promise.all([
      fetchIdentifierOptions(),
      fetchLedgers({ period_id: activePeriod.id }),
    ])
      .then(([nextIdentifiers, nextLedgers]) => {
        if (!isMounted) {
          return;
        }
        setIdentifiers(nextIdentifiers);
        setActiveLedgers(
          nextLedgers
            .filter((ledger) => ledger.is_active)
            .slice()
            .sort((left, right) => left.priority - right.priority),
        );
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
        }
      });

    fetchTickets({ periodId: activePeriod.id, limit: 5 })
      .then((tickets) => {
        if (!isMounted) {
          return;
        }
        setRecentTickets(tickets);
      })
      .catch((error) => {
        if (!isMounted) {
          return;
        }
        const message =
          error instanceof Error ? error.message : "Request failed.";
        setToast({ type: "error", message });
      })
      .finally(() => {
        if (isMounted) {
          setIsRecentTicketsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [hasActivePeriod, activePeriod?.id]);

  useEffect(() => {
    const matchedIdentifiers = resolvedItems
      .map((item) => item.matchedIdentifier)
      .filter((identifier): identifier is FlowBitIdentifierOption => identifier !== null);

    if (!matchedIdentifiers.length) {
      return;
    }

    let isMounted = true;
    const uniqueIdentifiers = Array.from(
      new Map(matchedIdentifiers.map((identifier) => [identifier.id, identifier])).values(),
    );

    Promise.all(
      uniqueIdentifiers.map(async (identifier) => {
        const capacity = await fetchIdentifierCapacity(identifier.id);
        return [
          identifier.id,
          {
            remainingCapacity: formatWholeAmount(capacity.remaining_capacity),
            isFrozenAllLedgers: capacity.is_frozen_all_ledgers,
            freezeStatus: capacity.freeze_status,
            ledgerCapacityRows: (capacity.ledger_capacity_rows || []).map((row) => ({
              ledgerId: row.ledger_id,
              ledgerName: row.ledger_name,
              priority: row.priority,
              isCapacityReserve: row.is_capacity_reserve,
              totalCapacity: formatWholeAmount(row.total_capacity),
              allocatedAmount: formatWholeAmount(row.allocated_amount),
              remainingCapacity: formatWholeAmount(row.remaining_capacity),
              isFrozen: row.is_frozen,
              isFull: row.is_full,
            })),
          },
        ] as const;
      }),
    )
      .then((results) => {
        if (!isMounted) {
          return;
        }

        setIdentifierCapacityMap((current) => ({
          ...current,
          ...Object.fromEntries(results),
        }));
      })
      .catch(() => {});

    return () => {
      isMounted = false;
    };
  }, [resolvedItems]);

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
      permutationIdentifiers:
        field === "identifierNumber" ? null : item.permutationIdentifiers,
      preview: null,
      previewPermutationDetails: null,
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
      previewPermutationDetails: null,
      previewError: null,
    }));
  }

  function handleToggleAmountMode(itemId: string) {
    setItemState(itemId, (item) => ({
      ...item,
      amountUsesAllocationBasis: !item.amountUsesAllocationBasis,
      preview: null,
      previewPermutationDetails: null,
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
      previewPermutationDetails: null,
      previewError: null,
    }));
  }

  async function handleTakeAll(itemId: string) {
    const draft = items.find((item) => item.id === itemId);
    if (!draft) {
      return;
    }

    const identifier = identifierMap.get(
      normalizeIdentifierNumber(draft.identifierNumber),
    );
    if (!identifier) {
      setToast({
        type: "error",
        message: "Choose a valid identifier before using Take all.",
      });
      return;
    }

    setItemState(itemId, (item) => ({
      ...item,
      isTakingAll: true,
      previewError: null,
    }));

    try {
      const capacity = await fetchIdentifierCapacity(identifier.id);
      const remainingCapacity = Number(capacity.remaining_capacity) || 0;
      if (capacity.is_frozen_all_ledgers && remainingCapacity <= 0) {
        setToast({
          type: "error",
          message: `Identifier ${identifier.number} is frozen across all ledgers and will spill over.`,
        });
        setItemState(itemId, (item) => ({
          ...item,
          isTakingAll: false,
          previewError: null,
        }));
        return;
      }
      const nextAmount = draft.amountUsesAllocationBasis
        ? String(Math.floor(remainingCapacity))
        : toTakeAllAmount(capacity.remaining_capacity);
      if (Number(nextAmount) <= 0) {
        setToast({
          type: "error",
          message: `Identifier ${identifier.number} has no remaining capacity.`,
        });
      }
      setItemState(itemId, (item) => ({
        ...item,
        amount: nextAmount,
        preview: null,
        previewPermutationDetails: null,
        previewError: null,
        isTakingAll: false,
      }));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Request failed.";
      setItemState(itemId, (item) => ({
        ...item,
        isTakingAll: false,
        previewError: message,
      }));
      setToast({ type: "error", message });
    }
  }

  function addItem(
    partial?: Partial<TicketDraftItem>,
    focusField: "identifier" | "amount" = "identifier",
  ) {
    let nextItemId = "";
    setItems((current) => {
      const lastItem = current[current.length - 1];
      const nextItem = createDraftItem({
        amountUsesAllocationBasis: lastItem?.amountUsesAllocationBasis ?? false,
        ...partial,
      });
      nextItemId = nextItem.id;
      return [...current, nextItem];
    });
    setPendingFocus({ itemId: nextItemId, field: focusField });
  }

  function duplicateItem(itemId: string) {
    const source = items.find((item) => item.id === itemId);
    if (!source) {
      return;
    }
    addItem({
      identifierNumber: source.identifierNumber,
      amount: source.amount,
      amountUsesAllocationBasis: source.amountUsesAllocationBasis,
      permutationIdentifiers: source.permutationIdentifiers ? [...source.permutationIdentifiers] : null,
      manualMode: source.manualMode,
      manualAllocations: { ...source.manualAllocations },
      preview: source.preview,
      previewPermutationDetails: source.previewPermutationDetails
        ? [...source.previewPermutationDetails]
        : null,
      previewError: source.previewError,
    });
  }

  function toggleIdentifierPermutations(itemId: string) {
    setItemState(itemId, (item) => {
      const permutations = buildIdentifierPermutations(item.identifierNumber);
      if (permutations.length <= 1) {
        return item;
      }

      return {
        ...item,
        permutationIdentifiers: item.permutationIdentifiers ? null : permutations,
        preview: null,
        previewPermutationDetails: null,
        previewError: null,
      };
    });
  }

  function removeItem(itemId: string) {
    setItems((current) =>
      current.length === 1
        ? current
        : current.filter((item) => item.id !== itemId),
    );
  }

  function handleRequestNextRow(itemId: string) {
    const currentIndex = items.findIndex((item) => item.id === itemId);
    if (currentIndex === -1) {
      return;
    }

    const nextItem = items[currentIndex + 1];
    if (nextItem) {
      setPendingFocus({ itemId: nextItem.id, field: "identifier" });
      return;
    }

    addItem(undefined, "identifier");
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
        previewPermutationDetails: null,
        previewError: "Choose a valid identifier before previewing this line.",
        isPreviewing: false,
      }));
      return;
    }

    const amount = getEffectiveTicketAmount(draft);
    if (!amount) {
      setItemState(itemId, (item) => ({
        ...item,
        preview: null,
        previewPermutationDetails: null,
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
      const manualAllocations = buildManualAllocations(draft);
      const targetIdentifierNumbers =
        draft.permutationIdentifiers && draft.permutationIdentifiers.length
          ? draft.permutationIdentifiers
          : [normalizeIdentifierNumber(draft.identifierNumber)];
      let primaryPreview: TicketDraftItem["preview"] = null;
      const permutationDetails: NonNullable<TicketDraftItem["previewPermutationDetails"]> = [];

      for (const targetIdentifierNumber of targetIdentifierNumbers) {
        const targetIdentifier = identifierMap.get(targetIdentifierNumber);
        if (!targetIdentifier) {
          throw new Error(`Identifier ${targetIdentifierNumber} is not available.`);
        }

        const preview = await previewTicketItemAllocation({
          identifier: targetIdentifier.id,
          total_amount: amount,
          ...(manualAllocations ? { manual_allocations: manualAllocations } : {}),
        });

        if (!primaryPreview) {
          primaryPreview = preview;
        }

        permutationDetails.push({
          identifier: targetIdentifier.number,
          overflowAmount: preview.overflow_amount,
          hasOverflow: preview.has_overflow,
        });
      }

      const totalOverflow = permutationDetails.reduce(
        (sum, detail) => sum + (detail.hasOverflow ? Number(detail.overflowAmount) || 0 : 0),
        0,
      );

      setItemState(itemId, (item) => ({
        ...item,
        preview: primaryPreview
          ? {
              ...primaryPreview,
              has_overflow: permutationDetails.some((detail) => detail.hasOverflow),
              overflow_amount: String(totalOverflow),
            }
          : null,
        previewPermutationDetails:
          permutationDetails.length > 1 ? permutationDetails : null,
        previewError: null,
        isPreviewing: false,
      }));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Request failed.";
      setItemState(itemId, (item) => ({
        ...item,
        preview: null,
        previewPermutationDetails: null,
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
      {
        preview: TicketDraftItem["preview"];
        previewPermutationDetails: TicketDraftItem["previewPermutationDetails"];
        previewError: string | null;
      }
    >();
    let overflowEntryCount = 0;
    let overflowAmount = 0;
    const overflowDetails: Array<{ identifier: string; amount: number }> = [];

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

      const amount = getEffectiveTicketAmount(item);
      if (!amount || Number(amount) <= 0) {
        setToast({
          type: "error",
          message: "Every ticket line needs an amount greater than zero.",
        });
        return null;
      }

      const manualAllocations = buildManualAllocations(item);
      const targetIdentifierNumbers =
        item.permutationIdentifiers && item.permutationIdentifiers.length
          ? item.permutationIdentifiers
          : [normalizeIdentifierNumber(item.identifierNumber)];
      try {
        let primaryPreview: TicketDraftItem["preview"] = null;
        const permutationDetails: NonNullable<TicketDraftItem["previewPermutationDetails"]> = [];

        for (const targetIdentifierNumber of targetIdentifierNumbers) {
          const targetIdentifier = identifierMap.get(targetIdentifierNumber);
          if (!targetIdentifier) {
            throw new Error(`Identifier ${targetIdentifierNumber} is not available.`);
          }

          const preview = await previewTicketItemAllocation({
            identifier: targetIdentifier.id,
            total_amount: amount,
            ...(manualAllocations ? { manual_allocations: manualAllocations } : {}),
          });

          if (!primaryPreview) {
            primaryPreview = preview;
          }

          permutationDetails.push({
            identifier: targetIdentifier.number,
            overflowAmount: preview.overflow_amount,
            hasOverflow: preview.has_overflow,
          });

          if (preview.has_overflow) {
            overflowEntryCount += 1;
            const overflowValue = Number(preview.overflow_amount) || 0;
            overflowAmount += overflowValue;
            overflowDetails.push({
              identifier: targetIdentifier.number,
              amount: overflowValue,
            });
          }

          payloadItems.push({
            identifier: targetIdentifier.id,
            amount,
            allow_overflow: true,
            ...(manualAllocations ? { manual_allocations: manualAllocations } : {}),
          });
        }

        const totalOverflow = permutationDetails.reduce(
          (sum, detail) => sum + (detail.hasOverflow ? Number(detail.overflowAmount) || 0 : 0),
          0,
        );

        nextPreviewState.set(item.id, {
          preview: primaryPreview
            ? {
                ...primaryPreview,
                has_overflow: permutationDetails.some((detail) => detail.hasOverflow),
                overflow_amount: String(totalOverflow),
              }
            : null,
          previewPermutationDetails:
            permutationDetails.length > 1 ? permutationDetails : null,
          previewError: null,
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Request failed.";
        nextPreviewState.set(item.id, {
          preview: null,
          previewPermutationDetails: null,
          previewError: message,
        });
        setItems((current) =>
          current.map((currentItem) => {
            const nextState = nextPreviewState.get(currentItem.id);
            return nextState
              ? {
                  ...currentItem,
                  preview: nextState.preview,
                  previewPermutationDetails: nextState.previewPermutationDetails,
                  previewError: nextState.previewError,
                  isPreviewing: false,
                }
              : currentItem;
          }),
        );
        setToast({ type: "error", message });
        return null;
      }

    }

    setItems((current) =>
      current.map((item) => {
            const nextState = nextPreviewState.get(item.id);
            return nextState
              ? {
                  ...item,
                  preview: nextState.preview,
                  previewPermutationDetails: nextState.previewPermutationDetails,
                  previewError: nextState.previewError,
                  isPreviewing: false,
                }
          : item;
      }),
    );

    return { items: payloadItems, overflowEntryCount, overflowAmount, overflowDetails };
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
        notifyTicketsUpdated();
        setLastCreatedTicket({
          ticketNumber: response.ticket?.ticket_number || response.ticket_number || "Pending",
          customerName: getCustomerDisplayName(
            response.ticket?.customer_name || customerName.trim(),
          ),
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
        <div className="mx-auto w-full max-w-[1600px] px-4 py-3 sm:px-6 lg:px-8 lg:py-5">
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
    <>
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
              ? buildOverflowDescription(pendingOverflowSubmission)
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
                      remainingCapacity={
                        item.matchedIdentifier
                          ? identifierCapacityMap[item.matchedIdentifier.id]
                              ?.remainingCapacity ?? null
                          : null
                      }
                      isFrozenAllLedgers={
                        item.matchedIdentifier
                          ? identifierCapacityMap[item.matchedIdentifier.id]
                              ?.isFrozenAllLedgers ?? false
                          : false
                      }
                      freezeStatus={
                        item.matchedIdentifier
                          ? identifierCapacityMap[item.matchedIdentifier.id]
                              ?.freezeStatus ?? "none"
                          : "none"
                      }
                      manualLedgers={
                        item.matchedIdentifier
                          ? identifierCapacityMap[item.matchedIdentifier.id]
                              ?.ledgerCapacityRows
                              ?.map((row) => {
                                const ledger = activeLedgers.find(
                                  (candidate) => candidate.id === row.ledgerId,
                                );
                                if (!ledger) {
                                  return null;
                                }

                                return {
                                  ...ledger,
                                  remainingCapacity: row.remainingCapacity,
                                  totalCapacity: row.totalCapacity,
                                  allocatedAmount: row.allocatedAmount,
                                  isFull: row.isFull,
                                  isFrozen: row.isFrozen,
                                };
                              })
                              .filter(
                                (
                                  ledger,
                                ): ledger is FlowBitLedger & {
                                  remainingCapacity: string;
                                  totalCapacity: string;
                                  allocatedAmount: string;
                                  isFull: boolean;
                                  isFrozen: boolean;
                                } => ledger !== null,
                              )
                          : undefined
                      }
                      identifierError={item.identifierError}
                      amountError={item.amountError}
                      allocationBasisAmount={getAllocationBasisAmount(item)}
                      autoFocusField={
                        pendingFocus?.itemId === item.id ? pendingFocus.field : null
                      }
                      canRemove={resolvedItems.length > 1}
                      onFieldRefReady={handleTicketFieldRefReady}
                      onFieldChange={handleFieldChange}
                      onAllocationModeChange={handleAllocationModeChange}
                      onManualAmountChange={handleManualAmountChange}
                      onToggleAmountMode={handleToggleAmountMode}
                      onTogglePermutations={toggleIdentifierPermutations}
                      onTakeAll={handleTakeAll}
                      onRequestNextRow={handleRequestNextRow}
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
                  <div className="mt-3 text-sm text-emerald-900">
                    <p className="text-lg font-semibold">{lastCreatedTicket.ticketNumber}</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-emerald-800">
                      <span className="font-medium text-emerald-900">
                        {getCustomerDisplayName(lastCreatedTicket.customerName)}
                      </span>
                      <span>{formatEntryCount(lastCreatedTicket.entryCount)}</span>
                      <span>Amount - {lastCreatedTicket.totalAmount}</span>
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
                Recent Tickets
              </p>
              {isRecentTicketsLoading ? (
                <div className="mt-5 space-y-2.5">
                  {[0, 1, 2].map((row) => (
                    <div
                      key={row}
                      className="animate-pulse rounded-[22px] border border-stone-900/8 bg-stone-50 px-4 py-3"
                    >
                      <div className="h-3 w-20 rounded-full bg-stone-200" />
                      <div className="mt-2.5 h-5 w-40 rounded-full bg-stone-200" />
                      <div className="mt-2 h-3 w-28 rounded-full bg-stone-200" />
                    </div>
                  ))}
                </div>
              ) : recentTickets.length ? (
                <div className="mt-5 space-y-2.5">
                  {recentTickets.map((ticket) => (
                    <button
                      type="button"
                      key={ticket.id}
                      className="w-full rounded-[22px] border border-stone-900/8 bg-stone-50 px-4 py-3 text-left transition hover:border-stone-900/14 hover:bg-stone-100/70"
                      onClick={() => openRecentTicket(ticket.ticket_number)}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-400">
                            Ticket
                          </p>
                          <p className="mt-1.5 text-base font-semibold text-stone-950">
                            {ticket.ticket_number}
                          </p>
                        </div>
                        <span className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
                          {formatEntryCount(ticket.transaction_count)}
                        </span>
                      </div>
                      <div className="mt-2 flex items-center justify-between gap-3">
                        <div className="min-w-0 flex-1 overflow-hidden">
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-stone-500">
                            <span className="truncate font-medium text-stone-700">
                              {getCustomerDisplayName(ticket.customer_name)}
                            </span>
                            <span>Amount - {formatAmount(ticket.total_amount)}</span>
                            <span className="text-xs">
                              {new Date(ticket.created_at).toLocaleString("en-GB", {
                                day: "2-digit",
                                month: "short",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                          </div>
                        </div>
                        <FontAwesomeIcon
                          icon={faArrowUpRightFromSquare}
                          className="h-3.5 w-3.5 flex-none text-stone-400"
                        />
                      </div>
                    </button>
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
      {selectedRecentTicketNumber ? (
        <div
          className="fixed inset-0 z-50 bg-stone-950/35 px-4 py-6 backdrop-blur-[2px] sm:px-6"
          onClick={closeRecentTicket}
        >
          <div className="mx-auto flex h-full max-w-3xl items-center justify-center">
            <div
              className="max-h-full w-full overflow-y-auto rounded-[30px] border border-stone-900/10 bg-white p-5 shadow-[0_24px_80px_rgba(28,24,20,0.22)] sm:p-6"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="mb-5 flex items-center justify-between gap-3">
                <div>
                  <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-stone-400">
                    Ticket view
                  </p>
                  <p className="mt-1.5 text-lg font-semibold text-stone-950">
                    {selectedRecentTicketNumber}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-[18px]"
                  onClick={closeRecentTicket}
                >
                  <FontAwesomeIcon icon={faXmark} className="h-4 w-4" />
                  Close
                </Button>
              </div>

              {isRecentTicketDetailLoading ? (
                <div className="animate-pulse space-y-3 rounded-[24px] border border-stone-900/8 bg-stone-50 p-5">
                  <div className="h-3 w-24 rounded-full bg-stone-200" />
                  <div className="h-7 w-40 rounded-full bg-stone-200" />
                  <div className="h-3 w-32 rounded-full bg-stone-200" />
                  <div className="mt-4 h-48 rounded-[22px] bg-white" />
                </div>
              ) : selectedRecentTicket ? (
                <TicketReceiptCard
                  ticket={selectedRecentTicket}
                  periodName={activePeriod?.name}
                  className="mx-auto max-w-[440px] rounded-[28px] border border-dashed border-stone-300 bg-stone-50 p-5 text-stone-900"
                />
              ) : (
                <div className="rounded-[24px] border border-dashed border-stone-300 bg-stone-50 px-5 py-5 text-sm text-stone-500">
                  Ticket view is not available right now.
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
