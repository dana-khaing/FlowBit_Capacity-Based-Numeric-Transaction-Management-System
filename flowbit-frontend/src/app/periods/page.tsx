import { AppSectionPage } from "@/components/app/app-section-page";

export default function PeriodsPage() {
  return (
    <AppSectionPage
      eyebrow="Periods"
      title="Period control"
      description="Review active and archived periods, confirm close timing, and manage the date ranges that drive ticket entry, ledgers, and spill-over workflows."
    >
      <div className="space-y-4 text-sm leading-6 text-stone-500">
        <p>This page will become the period management workspace with active-period visibility, period history, and close controls.</p>
        <p>The drawer route is ready now so period navigation stays alongside ledgers, tickets, and archive views.</p>
      </div>
    </AppSectionPage>
  );
}
