import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowTrendUp,
  faCircleExclamation,
  faDatabase,
  faLayerGroup,
  faVault,
} from "@fortawesome/free-solid-svg-icons";
import type { AllocationPreview } from "@/lib/ticket-client";

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

type TicketPreviewCardProps = {
  preview: AllocationPreview | null;
  loading: boolean;
  error: string | null;
};

export function TicketPreviewCard({ preview, loading, error }: TicketPreviewCardProps) {
  if (loading) {
    return (
      <div className="rounded-[22px] border border-stone-900/8 bg-stone-50 px-4 py-4 text-sm text-stone-500">
        Checking available capacity for this entry.
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-[22px] border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-700">
        {error}
      </div>
    );
  }

  if (!preview) {
    return null;
  }

  return (
    <div className="rounded-[22px] border border-stone-900/8 bg-stone-50 px-4 py-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
          <FontAwesomeIcon icon={faLayerGroup} className="h-3 w-3 text-stone-400" />
          {preview.ledger_allocations.length} ledger fills
        </span>
        <span className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
          <FontAwesomeIcon icon={faVault} className="h-3 w-3 text-stone-400" />
          Reserve {formatAmount(preview.reserve_available)}
        </span>
        <span
          className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] ${
            preview.has_overflow ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-700"
          }`}
        >
          <FontAwesomeIcon icon={preview.has_overflow ? faCircleExclamation : faArrowTrendUp} className="h-3 w-3" />
          {preview.has_overflow ? `Spill over ${formatAmount(preview.overflow_amount)}` : "Fits current capacity"}
        </span>
      </div>

      <div className="mt-4 space-y-3">
        {preview.ledger_allocations.map((allocation) => (
          <div
            key={`${allocation.ledger_id}-${allocation.requested_amount}`}
            className="rounded-[18px] border border-white bg-white px-4 py-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-stone-900">{allocation.ledger_name}</p>
              <p className="text-sm text-stone-500">
                Available {formatAmount(allocation.available_amount)}
              </p>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-4 text-sm text-stone-600">
              <span>Requested {formatAmount(allocation.requested_amount)}</span>
              <span>Allocated {formatAmount(allocation.allocated_amount)}</span>
              {Number(allocation.overflow_amount) > 0 ? (
                <span className="text-amber-700">Spill over {formatAmount(allocation.overflow_amount)}</span>
              ) : null}
            </div>
          </div>
        ))}
      </div>

      {Number(preview.reserve_allocated) > 0 ? (
        <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
          <FontAwesomeIcon icon={faDatabase} className="h-3 w-3 text-stone-400" />
          Reserve used {formatAmount(preview.reserve_allocated)}
        </div>
      ) : null}
    </div>
  );
}
