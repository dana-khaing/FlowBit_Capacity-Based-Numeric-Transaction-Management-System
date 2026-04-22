import { PeriodRequiredPage } from "@/components/period/period-required-page";

export default function SpillOverPage() {
  return (
    <PeriodRequiredPage
      eyebrow="Spill over"
      title="Spill-over review"
      description="Follow pending TCSO and approved CSO items, collaborate on approval amounts, and move quickly into refund or release actions."
    >
      <div className="space-y-4 text-sm leading-6 text-stone-500">
        <p>This page will become the queue for overflow decisions and collaborator-backed approvals.</p>
        <p>The route is ready now so the side drawer can take users directly into that workflow.</p>
      </div>
    </PeriodRequiredPage>
  );
}
