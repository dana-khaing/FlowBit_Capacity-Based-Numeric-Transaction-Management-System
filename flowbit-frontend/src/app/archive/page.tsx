import { AppSectionPage } from "@/components/app/app-section-page";

export default function ArchivePage() {
  return (
    <AppSectionPage
      eyebrow="Archive"
      title="Archive review"
      description="Browse closed periods, archived ledgers, and historical entries while keeping the same app navigation and account controls."
    >
      <div className="space-y-4 text-sm leading-6 text-stone-500">
        <p>This page will become the archive browser for past periods, exported documents, and closed ledger records.</p>
        <p>The drawer route is live now so the long-term navigation model stays consistent as more archive tools are added.</p>
      </div>
    </AppSectionPage>
  );
}
