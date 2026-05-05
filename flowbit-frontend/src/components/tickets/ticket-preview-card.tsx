import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCircleExclamation,
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
};

export function TicketPreviewCard({
  preview,
  permutationDetails,
  loading,
  error,
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
  const visiblePermutationOverflowRows = permutationSummary
    ? permutationSummary.filter((detail) => detail.hasOverflow)
    : [];

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
