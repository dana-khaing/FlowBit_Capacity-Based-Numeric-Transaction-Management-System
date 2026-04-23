import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowRotateRight,
  faCircleCheck,
  faCircleExclamation,
  faPlus,
  faTrashCan,
} from "@fortawesome/free-solid-svg-icons";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TicketManualAllocationPanel } from "@/components/tickets/ticket-manual-allocation-panel";
import { TicketPreviewCard } from "@/components/tickets/ticket-preview-card";
import type { FlowBitLedger } from "@/lib/ledger-client";
import type { AllocationPreview, FlowBitIdentifier } from "@/lib/ticket-client";

export type TicketDraftItem = {
  id: string;
  identifierNumber: string;
  amount: string;
  allowOverflow: boolean;
  manualMode: boolean;
  manualAllocations: Record<number, string>;
  preview: AllocationPreview | null;
  previewError: string | null;
  isPreviewing: boolean;
};

type TicketItemRowProps = {
  item: TicketDraftItem;
  index: number;
  identifier: FlowBitIdentifier | null;
  activeLedgers: FlowBitLedger[];
  canRemove: boolean;
  onFieldChange: (itemId: string, field: "identifierNumber" | "amount", value: string) => void;
  onAllowOverflowChange: (itemId: string, checked: boolean) => void;
  onManualModeChange: (itemId: string, checked: boolean) => void;
  onManualAmountChange: (itemId: string, ledgerId: number, value: string) => void;
  onRemove: (itemId: string) => void;
  onPreview: (itemId: string) => void;
  onDuplicate: (itemId: string) => void;
  identifierOptions: string[];
};

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

export function TicketItemRow({
  item,
  index,
  identifier,
  activeLedgers,
  canRemove,
  onFieldChange,
  onAllowOverflowChange,
  onManualModeChange,
  onManualAmountChange,
  onRemove,
  onPreview,
  onDuplicate,
  identifierOptions,
}: TicketItemRowProps) {
  const datalistId = `ticket-identifiers-${item.id}`;

  return (
    <div className="rounded-[26px] border border-stone-900/8 bg-white p-4 shadow-[0_8px_24px_rgba(28,24,20,0.04)] sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-stone-400">Entry {index + 1}</p>
          <h3 className="mt-1 text-xl font-semibold text-stone-950">Ticket line</h3>
        </div>
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

      <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,0.8fr)_auto]">
        <label className="space-y-2">
          <span className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Identifier</span>
          <Input
            list={datalistId}
            value={item.identifierNumber}
            onChange={(event) => onFieldChange(item.id, "identifierNumber", event.target.value)}
            placeholder="Enter identifier"
          />
          <datalist id={datalistId}>
            {identifierOptions.map((option) => (
              <option key={option} value={option} />
            ))}
          </datalist>
        </label>

        <label className="space-y-2">
          <span className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Amount</span>
          <Input
            inputMode="decimal"
            value={item.amount}
            onChange={(event) => onFieldChange(item.id, "amount", event.target.value)}
            placeholder="0.00"
          />
        </label>

        <div className="space-y-2">
          <span className="block text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Preview</span>
          <Button className="h-12 rounded-[18px]" variant="outline" onClick={() => onPreview(item.id)} disabled={item.isPreviewing}>
            <FontAwesomeIcon icon={faArrowRotateRight} className={`h-3.5 w-3.5 ${item.isPreviewing ? "animate-spin" : ""}`} />
            {item.isPreviewing ? "Checking" : "Preview"}
          </Button>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3 rounded-[20px] border border-stone-900/8 bg-stone-50 px-4 py-3">
        <label className="flex items-center gap-3 text-sm font-medium text-stone-700">
          <Checkbox checked={item.allowOverflow} onCheckedChange={(checked) => onAllowOverflowChange(item.id, checked === true)} />
          Allow spill over if current ledgers are full
        </label>

        <div className="ml-auto flex flex-wrap items-center gap-2 text-sm text-stone-500">
          {identifier ? (
            <>
              <span className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1">
                <FontAwesomeIcon icon={faCircleCheck} className="h-3 w-3 text-emerald-600" />
                Identifier {identifier.number}
              </span>
              <span className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1">
                Remaining {formatAmount(identifier.remaining_capacity)}
              </span>
            </>
          ) : item.identifierNumber.trim() ? (
            <span className="inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1 text-amber-800">
              <FontAwesomeIcon icon={faCircleExclamation} className="h-3 w-3" />
              Identifier not found
            </span>
          ) : null}
        </div>
      </div>

      <div className="mt-4">
        <TicketManualAllocationPanel
          enabled={item.manualMode}
          ledgers={activeLedgers}
          values={item.manualAllocations}
          onToggle={(checked) => onManualModeChange(item.id, checked)}
          onAmountChange={(ledgerId, value) => onManualAmountChange(item.id, ledgerId, value)}
        />
      </div>

      <div className="mt-4">
        <TicketPreviewCard preview={item.preview} loading={item.isPreviewing} error={item.previewError} />
      </div>
    </div>
  );
}
