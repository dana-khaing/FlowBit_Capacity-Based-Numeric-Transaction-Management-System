import { AppSectionPage } from "@/components/app/app-section-page";

export default function CreateTicketsPage() {
  return (
    <AppSectionPage
      eyebrow="Ticket entry"
      title="Create tickets"
      description="Enter identifiers and amounts, preview capacity instantly, and decide whether remaining amounts should continue as spill-over."
    >
      <div className="space-y-4 text-sm leading-6 text-stone-500">
        <p>This screen is the entry point for the ticket creation flow we’re building next.</p>
        <p>It will host the multi-line ticket form, manual ledger allocation preview, and overflow confirmation handling.</p>
      </div>
    </AppSectionPage>
  );
}
