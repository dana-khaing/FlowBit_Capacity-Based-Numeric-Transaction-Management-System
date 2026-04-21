import { AppSectionPage } from "@/components/app/app-section-page";

export default function TicketsPage() {
  return (
    <AppSectionPage
      eyebrow="Tickets"
      title="Ticket history"
      description="Review submitted tickets, trace their linked transactions, and move into correction or export flows without leaving the workspace."
    >
      <div className="space-y-4 text-sm leading-6 text-stone-500">
        <p>This page will become the searchable ticket list with ticket number, customer details, total amount, and refund status.</p>
        <p>The drawer link is live now so the navigation structure is ready before the ticket table is wired to the backend.</p>
      </div>
    </AppSectionPage>
  );
}
