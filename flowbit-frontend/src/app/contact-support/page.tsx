import { AppSectionPage } from "@/components/app/app-section-page";

export default function ContactSupportPage() {
  return (
    <AppSectionPage
      eyebrow="Support"
      title="Contact support"
      description="Reach the right team when you need help with account access, ticket entry issues, ledger questions, or overflow decisions."
    >
      <div className="space-y-4 text-sm leading-6 text-stone-500">
        <p>This page will hold your support contact options, escalation guidance, and quick links for common issues.</p>
        <p>It is wired into the drawer now so users can reach help from anywhere in the workspace.</p>
      </div>
    </AppSectionPage>
  );
}
