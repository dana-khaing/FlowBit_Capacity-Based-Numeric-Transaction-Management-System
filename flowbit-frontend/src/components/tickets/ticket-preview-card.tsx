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
  permutationDetails?: Array<{
    identifier: string;
    overflowAmount: string;
    hasOverflow: boolean;
  }> | null;
  loading: boolean;
  error: string | null;
  compactMode?: boolean;
};

export function TicketPreviewCard({
  preview,
  permutationDetails,
  loading,
  error,
  compactMode = false,
}: TicketPreviewCardProps) {
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

  const permutationSummary =
    permutationDetails && permutationDetails.length > 1 ? permutationDetails : null;
  const permutationOverflowAmount = permutationSummary
    ? permutationSummary.reduce(
        (sum, detail) => sum + (detail.hasOverflow ? Number(detail.overflowAmount) || 0 : 0),
        0,
      )
    : 0;
  const permutationHasOverflow = permutationSummary
    ? permutationSummary.some((detail) => detail.hasOverflow)
    : preview.has_overflow;
  const visibleLedgerAllocations = preview.ledger_allocations.filter((allocation) => {
    const availableAmount = Number(allocation.available_amount) || 0;
    const allocatedAmount = Number(allocation.allocated_amount) || 0;
    return availableAmount > 0 || allocatedAmount > 0;
  });
  const shouldShowReserveFill =
    !permutationSummary &&
    Number(preview.reserve_allocated) > 0 &&
    visibleLedgerAllocations.length === 0;
  const visiblePermutationOverflowRows = permutationSummary
    ? permutationSummary.filter((detail) => detail.hasOverflow)
    : [];

  if (compactMode) {
    if (!permutationHasOverflow) {
      return null;
    }

    return (
      <div className="rounded-[22px] border border-amber-200 bg-amber-50 px-4 py-4">
        {permutationSummary ? (
          <div className="space-y-3">
            {visiblePermutationOverflowRows.map((detail) => (
              <div
                key={detail.identifier}
                className="flex flex-wrap items-center justify-between gap-3 rounded-[18px] border border-amber-200 bg-white px-4 py-3 text-sm"
              >
                <p className="font-semibold text-stone-900">{detail.identifier}</p>
                <p className="font-semibold uppercase tracking-[0.14em] text-amber-800">
                  Spill over {formatAmount(detail.overflowAmount)}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <div className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-2 text-sm font-semibold uppercase tracking-[0.14em] text-amber-800">
            <FontAwesomeIcon icon={faCircleExclamation} className="h-3.5 w-3.5" />
            Spill over {formatAmount(
              permutationSummary
                ? String(permutationOverflowAmount)
                : preview.overflow_amount,
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-[22px] border border-stone-900/8 bg-stone-50 px-4 py-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
          <FontAwesomeIcon icon={faLayerGroup} className="h-3 w-3 text-stone-400" />
          {permutationSummary ? `${permutationSummary.length} shuffled entries` : `${preview.ledger_allocations.length} ledger fills`}
        </span>
        <span className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
          <FontAwesomeIcon icon={faVault} className="h-3 w-3 text-stone-400" />
          Reserve {formatAmount(preview.reserve_available)}
        </span>
        <span
          className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] ${
            permutationHasOverflow ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-700"
          }`}
        >
          <FontAwesomeIcon icon={permutationHasOverflow ? faCircleExclamation : faArrowTrendUp} className="h-3 w-3" />
          {permutationHasOverflow
            ? `Spill over ${formatAmount(
                permutationSummary
                  ? String(permutationOverflowAmount)
                  : preview.overflow_amount,
              )}`
            : "Fits current capacity"}
        </span>
      </div>

      {permutationSummary ? (
        <div className="mt-4 space-y-3">
          {permutationSummary.map((detail) => (
            <div
              key={detail.identifier}
              className="rounded-[18px] border border-white bg-white px-4 py-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
                <p className="font-semibold text-stone-900">{detail.identifier}</p>
                <p
                  className={
                    detail.hasOverflow ? "font-medium text-amber-700" : "font-medium text-emerald-700"
                  }
                >
                  {detail.hasOverflow
                    ? `Spill over ${formatAmount(detail.overflowAmount)}`
                    : "Fits current capacity"}
                </p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {visibleLedgerAllocations.map((allocation) => (
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
          {shouldShowReserveFill ? (
            <div className="rounded-[18px] border border-white bg-white px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-stone-900">Reserve ledger</p>
                <p className="text-sm text-stone-500">
                  Available {formatAmount(preview.reserve_available)}
                </p>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-4 text-sm text-stone-600">
                <span>Allocated {formatAmount(preview.reserve_allocated)}</span>
              </div>
            </div>
          ) : null}
        </div>
      )}

      {Number(preview.reserve_allocated) > 0 ? (
        <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
          <FontAwesomeIcon icon={faDatabase} className="h-3 w-3 text-stone-400" />
          Reserve used {formatAmount(preview.reserve_allocated)}
        </div>
      ) : null}
    </div>
  );
}
