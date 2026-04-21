import { AppSectionPage } from "@/components/app/app-section-page";

export default function ExportLedgerPage() {
  return (
    <AppSectionPage
      eyebrow="Exports"
      title="Export ledger reports"
      description="Generate ledger exports for handover, reconciliation, and archive review without leaving the main workspace."
    >
      <div className="space-y-4 text-sm leading-6 text-stone-500">
        <p>This screen will host the export filters for CSV and PDF reports backed by the ledger export APIs.</p>
        <p>It is in the drawer now to keep report actions near the daily workflow instead of hiding them in a footer.</p>
      </div>
    </AppSectionPage>
  );
}
