import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowDownWideShort, faCircleExclamation, faXmark } from "@fortawesome/free-solid-svg-icons";
import { Input } from "@/components/ui/input";
import type { FlowBitLedger } from "@/lib/ledger-client";

function formatAmount(value: string) {
  const amount = Number(value);
  if (Number.isNaN(amount)) {
    return value;
  }

  return amount.toLocaleString("en-GB", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

type TicketManualAllocationPanelProps = {
  ledgers: Array<
    FlowBitLedger & {
      remainingCapacity: string;
      totalCapacity: string;
      allocatedAmount: string;
      isFull: boolean;
      isFrozen: boolean;
    }
  >;
  lineAmount: string;
  values: Record<number, string>;
  onAmountChange: (ledgerId: number, value: string) => void;
};

export function TicketManualAllocationPanel({
  ledgers,
  lineAmount,
  values,
  onAmountChange,
}: TicketManualAllocationPanelProps) {
  const visibleLedgers = ledgers.filter((ledger) => !ledger.isFull);
  const manualTotal = Object.values(values).reduce((sum, value) => {
    const amount = Number(value);
    return sum + (Number.isNaN(amount) ? 0 : amount);
  }, 0);
  const lineAmountValue = Number(lineAmount);
  const exceedsLineAmount =
    !Number.isNaN(lineAmountValue) && lineAmountValue > 0 && manualTotal > lineAmountValue;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[18px] border border-dashed border-stone-300 bg-stone-50 px-4 py-3 text-sm text-stone-500">
        <span>Manual total</span>
        <span className="font-semibold text-stone-900">{formatAmount(String(manualTotal))}</span>
      </div>
      {exceedsLineAmount ? (
        <div className="flex items-start gap-2 rounded-[18px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <FontAwesomeIcon icon={faCircleExclamation} className="mt-0.5 h-4 w-4 flex-none" />
          <span>
            Manual amounts are greater than the entry amount. The extra portion will not fit this entry as typed.
          </span>
        </div>
      ) : null}
      {visibleLedgers.map((ledger) => (
        <div
          key={ledger.id}
          className="grid gap-3 rounded-[18px] border border-white bg-white px-4 py-3 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,180px)] lg:items-center"
        >
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold text-stone-900">{ledger.name}</p>
              <span className="inline-flex items-center gap-1 rounded-full bg-stone-100 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500">
                <FontAwesomeIcon icon={faArrowDownWideShort} className="h-3 w-3" />
                Priority {ledger.priority}
              </span>
            </div>
            <div className="mt-2">
              <span className="inline-flex items-center gap-2 rounded-full bg-emerald-100 px-3 py-1.5 text-sm font-semibold text-emerald-800">
                Left {formatAmount(ledger.remainingCapacity)}
              </span>
            </div>
          </div>
          <label className="space-y-2 lg:justify-self-end">
            <span className="block text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Amount</span>
            <div className="relative">
              <Input
                inputMode="numeric"
                pattern="[0-9]*"
                value={values[ledger.id] || ""}
                onChange={(event) => onAmountChange(ledger.id, event.target.value)}
                placeholder="Leave blank"
                className="h-11 rounded-[16px] bg-stone-50 pr-10 lg:w-[180px]"
              />
              {values[ledger.id] ? (
                <button
                  type="button"
                  onClick={() => onAmountChange(ledger.id, "")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 transition hover:text-stone-700"
                  aria-label={`Clear ${ledger.name} manual amount`}
                >
                  <FontAwesomeIcon icon={faXmark} className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </div>
          </label>
        </div>
      ))}
    </div>
  );
}
