import { PeriodRequiredPage } from "@/components/period/period-required-page";

export default function LedgersPage() {
  return (
    <PeriodRequiredPage
      eyebrow="Ledgers"
      title="Ledger workspace"
      description="Track active ledgers, priority order, close times, and remaining capacity from one place."
    >
      <div className="space-y-4 text-sm leading-6 text-stone-500">
        <p>This section will hold the ledger list, period filters, close actions, and reorder controls.</p>
        <p>It is linked from the drawer now so the app layout already matches the main operations flow.</p>
      </div>
    </PeriodRequiredPage>
  );
}
