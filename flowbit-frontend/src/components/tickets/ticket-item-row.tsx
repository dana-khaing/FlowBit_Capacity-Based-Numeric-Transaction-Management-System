import { useEffect, useRef } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowRotateRight,
  faCircleCheck,
  faCircleExclamation,
  faPlus,
  faSnowflake,
  faTrashCan,
} from "@fortawesome/free-solid-svg-icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TicketManualAllocationPanel } from "@/components/tickets/ticket-manual-allocation-panel";
import { TicketPreviewCard } from "@/components/tickets/ticket-preview-card";
import type { FlowBitLedger } from "@/lib/ledger-client";
import type { AllocationPreview, FlowBitIdentifierOption } from "@/lib/ticket-client";

export type TicketDraftItem = {
  id: string;
  identifierNumber: string;
  amount: string;
  amountUsesAllocationBasis: boolean;
  permutationIdentifiers: string[] | null;
  manualMode: boolean;
  manualAllocations: Record<number, string>;
  preview: AllocationPreview | null;
  previewPermutationDetails: Array<{
    identifier: string;
    overflowAmount: string;
    hasOverflow: boolean;
  }> | null;
  previewError: string | null;
  isPreviewing: boolean;
  isTakingAll: boolean;
};

type TicketItemRowProps = {
  item: TicketDraftItem;
  index: number;
  identifier: FlowBitIdentifierOption | null;
  remainingCapacity?: string | null;
  isFrozenAllLedgers?: boolean;
  identifierError?: string | null;
  amountError?: string | null;
  activeLedgers: FlowBitLedger[];
  allocationBasisAmount: string;
  autoFocusField?: "identifier" | "amount" | null;
  canRemove: boolean;
  onFieldChange: (itemId: string, field: "identifierNumber" | "amount", value: string) => void;
  onAllocationModeChange: (itemId: string, mode: "default" | "manual") => void;
  onManualAmountChange: (itemId: string, ledgerId: number, value: string) => void;
  onAutoFocusHandled: () => void;
  onToggleAmountMode: (itemId: string) => void;
  onTogglePermutations: (itemId: string) => void;
  onTakeAll: (itemId: string) => void;
  onRequestNextRow: (itemId: string) => void;
  onRemove: (itemId: string) => void;
  onPreview: (itemId: string) => void;
  onDuplicate: (itemId: string) => void;
  identifierOptions: string[];
};

export function TicketItemRow({
  item,
  index,
  identifier,
  remainingCapacity,
  isFrozenAllLedgers = false,
  identifierError,
  amountError,
  activeLedgers,
  allocationBasisAmount,
  autoFocusField,
  canRemove,
  onFieldChange,
  onAllocationModeChange,
  onManualAmountChange,
  onAutoFocusHandled,
  onToggleAmountMode,
  onTogglePermutations,
  onTakeAll,
  onRequestNextRow,
  onRemove,
  onPreview,
  onDuplicate,
  identifierOptions,
}: TicketItemRowProps) {
  const datalistId = `ticket-identifiers-${item.id}`;
  const identifierInputRef = useRef<HTMLInputElement | null>(null);
  const amountInputRef = useRef<HTMLInputElement | null>(null);
  const permutationCount = getPermutationCount(item.identifierNumber);
  const permutationsSelected = Boolean(item.permutationIdentifiers?.length);
  const hasLoadedCapacity = remainingCapacity !== null && remainingCapacity !== undefined;
  const remainingCapacityNumber = Number(remainingCapacity ?? "0");
  const hasRemainingCapacity =
    !Number.isNaN(remainingCapacityNumber) && remainingCapacityNumber > 0;
  const isReserveOnlyCapacity = isFrozenAllLedgers && hasRemainingCapacity;

  useEffect(() => {
    if (!autoFocusField) {
      return;
    }

    if (autoFocusField === "identifier") {
      identifierInputRef.current?.focus();
    } else {
      amountInputRef.current?.focus();
    }

    onAutoFocusHandled();
  }, [autoFocusField, onAutoFocusHandled]);

  return (
    <div className="rounded-[26px] border border-stone-900/8 bg-white p-4 shadow-[0_8px_24px_rgba(28,24,20,0.04)] sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-stone-400">Entry {index + 1}</p>
        <div className="flex items-center gap-2">
          <Button variant="outline" className="rounded-[18px]" onClick={() => onDuplicate(item.id)}>
            <FontAwesomeIcon icon={faPlus} className="h-3.5 w-3.5" />
            Duplicate
          </Button>
          {canRemove ? (
            <Button variant="ghost" className="rounded-[18px] text-rose-600 hover:bg-rose-50 hover:text-rose-700" onClick={() => onRemove(item.id)}>
              <FontAwesomeIcon icon={faTrashCan} className="h-3.5 w-3.5" />
              Remove
            </Button>
          ) : null}
        </div>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] xl:grid-cols-[minmax(0,0.95fr)_minmax(0,0.8fr)_auto]">
        <label className="space-y-2">
          <span className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">
            Identifier
          </span>
          <Input
            ref={identifierInputRef}
            list={datalistId}
            inputMode="numeric"
            pattern="[0-9]*"
            value={item.identifierNumber}
            onChange={(event) => onFieldChange(item.id, "identifierNumber", event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                amountInputRef.current?.focus();
              }
            }}
            placeholder="Enter identifier"
            className={identifierError ? "border-rose-300 bg-rose-50 focus:border-rose-500" : undefined}
          />
          <datalist id={datalistId}>
            {identifierOptions.map((option) => (
              <option key={option} value={option} />
            ))}
          </datalist>
          {identifierError ? (
            <p className="text-sm text-rose-600">{identifierError}</p>
          ) : null}
        </label>

        <div className="space-y-2">
          <span className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Amount</span>
          <div className="flex gap-2">
            <Input
              ref={amountInputRef}
              inputMode="numeric"
              pattern="[0-9]*"
              value={item.amount}
              onChange={(event) => onFieldChange(item.id, "amount", event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  onRequestNextRow(item.id);
                }
              }}
              placeholder="0.00"
              className={amountError ? "border-rose-300 bg-rose-50 focus:border-rose-500" : undefined}
            />
            {permutationCount > 1 ? (
              <Button
                type="button"
                variant={permutationsSelected ? "default" : "outline"}
                className="h-12 w-20 rounded-[18px] px-0 whitespace-nowrap"
                onClick={() => onTogglePermutations(item.id)}
              >
                x{permutationCount}
              </Button>
            ) : null}
            <Button
              type="button"
              variant={item.amountUsesAllocationBasis ? "default" : "outline"}
              className="h-12 w-20 rounded-[18px] px-0 whitespace-nowrap"
              onClick={() => onToggleAmountMode(item.id)}
            >
              %
            </Button>
          </div>
          {amountError ? (
            <p className="text-sm text-rose-600">{amountError}</p>
          ) : null}
        </div>

        <div className="space-y-2 md:col-span-2 xl:col-span-1">
          <span className="block text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Preview</span>
          <Button className="h-12 rounded-[18px]" variant="outline" onClick={() => onPreview(item.id)} disabled={item.isPreviewing}>
            <FontAwesomeIcon icon={faArrowRotateRight} className={`h-3.5 w-3.5 ${item.isPreviewing ? "animate-spin" : ""}`} />
            {item.isPreviewing ? "Checking" : "Preview"}
          </Button>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3 rounded-[20px] border border-stone-900/8 bg-stone-50 px-4 py-3">
        <div className="inline-flex rounded-[18px] border border-stone-900/8 bg-white p-1">
          <button
            type="button"
            onClick={() => onAllocationModeChange(item.id, "default")}
            className={`rounded-[14px] px-4 py-2 text-sm font-medium transition ${
              !item.manualMode ? "bg-stone-950 text-white" : "text-stone-600 hover:bg-stone-100"
            }`}
          >
            Default Allocation
          </button>
          <button
            type="button"
            onClick={() => onAllocationModeChange(item.id, "manual")}
            className={`rounded-[14px] px-4 py-2 text-sm font-medium transition ${
              item.manualMode ? "bg-stone-950 text-white" : "text-stone-600 hover:bg-stone-100"
            }`}
          >
            Manual Allocation
          </button>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2 text-sm text-stone-500">
          <button
            type="button"
            onClick={() => onTakeAll(item.id)}
            disabled={
              !identifier ||
              item.isTakingAll ||
              !hasLoadedCapacity ||
              (isFrozenAllLedgers && !hasRemainingCapacity)
            }
            className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] transition ${
              !identifier ||
              item.isTakingAll ||
              !hasLoadedCapacity ||
              (isFrozenAllLedgers && !hasRemainingCapacity)
                ? "cursor-not-allowed bg-stone-200 text-stone-400"
                : "bg-white text-stone-600 hover:bg-stone-100"
            }`}
          >
            {item.isTakingAll ? "Taking" : "Take all"}
          </button>
          {identifier && isFrozenAllLedgers && !hasLoadedCapacity ? (
            <span className="inline-flex items-center gap-2 rounded-full bg-stone-100 px-3 py-1 text-stone-600">
              <FontAwesomeIcon icon={faSnowflake} className="h-3 w-3" />
              Checking capacity...
            </span>
          ) : identifier && isReserveOnlyCapacity ? (
            <span className="inline-flex items-center gap-2 rounded-full bg-sky-100 px-3 py-1 text-sky-800">
              <FontAwesomeIcon icon={faSnowflake} className="h-3 w-3" />
              Reserve only · Left {remainingCapacity ?? "0"}
            </span>
          ) : identifier && isFrozenAllLedgers ? (
            <span className="inline-flex items-center gap-2 rounded-full bg-sky-100 px-3 py-1 text-sky-800">
              <FontAwesomeIcon icon={faSnowflake} className="h-3 w-3" />
              Frozen · will overflow
            </span>
          ) : identifier ? (
            <span className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1">
              <FontAwesomeIcon icon={faCircleCheck} className="h-3 w-3 text-emerald-600" />
              Left {remainingCapacity ?? "Loading..."}
            </span>
          ) : item.identifierNumber.trim() ? (
            <span className="inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1 text-amber-800">
              <FontAwesomeIcon icon={faCircleExclamation} className="h-3 w-3" />
              Identifier not found
            </span>
          ) : null}
        </div>
      </div>

      {item.manualMode ? (
        <div className="mt-4">
          <TicketManualAllocationPanel
            ledgers={activeLedgers}
            lineAmount={allocationBasisAmount}
            values={item.manualAllocations}
            onAmountChange={(ledgerId, value) => onManualAmountChange(item.id, ledgerId, value)}
          />
        </div>
      ) : null}

      <div className="mt-4">
        <TicketPreviewCard
          preview={item.preview}
          permutationDetails={item.previewPermutationDetails}
          loading={item.isPreviewing}
          error={item.previewError}
        />
      </div>
    </div>
  );
}

function getPermutationCount(identifierNumber: string) {
  const digits = identifierNumber.replace(/\D/g, "");
  if (digits.length !== 3) {
    return 0;
  }

  return buildIdentifierPermutations(digits).length;
}

function buildIdentifierPermutations(identifierNumber: string) {
  const digits = identifierNumber.split("");
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

  return Array.from(permutations);
}
