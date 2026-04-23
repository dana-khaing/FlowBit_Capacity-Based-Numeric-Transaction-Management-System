import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowDownWideShort, faLock, faSliders } from "@fortawesome/free-solid-svg-icons";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import type { FlowBitLedger } from "@/lib/ledger-client";

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

type TicketManualAllocationPanelProps = {
  enabled: boolean;
  ledgers: FlowBitLedger[];
  values: Record<number, string>;
  onToggle: (checked: boolean) => void;
  onAmountChange: (ledgerId: number, value: string) => void;
};

export function TicketManualAllocationPanel({
  enabled,
  ledgers,
  values,
  onToggle,
  onAmountChange,
}: TicketManualAllocationPanelProps) {
  return (
    <div className="rounded-[22px] border border-stone-900/8 bg-[#f7f4ee] px-4 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-400">Ledger fill mode</p>
          <h4 className="mt-1 text-lg font-semibold text-stone-950">Manual allocation</h4>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-500">
            Leave this off to let FlowBit fill ledgers by priority from high to low. Turn it on only when you want this line to use chosen ledgers first.
          </p>
        </div>
        <label className="flex items-center gap-3 rounded-full border border-stone-900/8 bg-white px-4 py-2 text-sm font-medium text-stone-700">
          <Checkbox checked={enabled} onCheckedChange={(checked) => onToggle(checked === true)} />
          Choose ledgers manually
        </label>
      </div>

      {enabled ? (
        <div className="mt-4 space-y-3">
          {ledgers.map((ledger) => (
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
                <p className="mt-2 text-sm text-stone-500">Capacity per identifier {formatAmount(ledger.limit_per_identifier)}</p>
              </div>

              <span className="inline-flex items-center gap-2 rounded-full bg-stone-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
                <FontAwesomeIcon icon={faSliders} className="h-3 w-3" />
                Manual target
              </span>

              <label className="space-y-2 lg:justify-self-end">
                <span className="block text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Amount</span>
                <Input
                  inputMode="decimal"
                  value={values[ledger.id] || ""}
                  onChange={(event) => onAmountChange(ledger.id, event.target.value)}
                  placeholder="Leave blank"
                  className="h-11 rounded-[16px] bg-stone-50 lg:w-[180px]"
                />
              </label>
            </div>
          ))}
          <div className="rounded-[18px] border border-stone-900/8 bg-white px-4 py-3 text-sm leading-6 text-stone-500">
            Only the ledgers with entered amounts will be used for this line. Any remaining amount will continue into reserve capacity and then spill over.
          </div>
        </div>
      ) : (
        <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm text-stone-500">
          <FontAwesomeIcon icon={faLock} className="h-3.5 w-3.5 text-stone-400" />
          Default priority fill stays active for this line.
        </div>
      )}
    </div>
  );
}
