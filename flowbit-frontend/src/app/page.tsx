"use client";

import Link from "next/link";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowRight,
  faBoxArchive,
  faCalendarDays,
  faCircleCheck,
  faFileInvoice,
  faFolderOpen,
  faLayerGroup,
  faPlus,
  faShieldHalved,
  faTicket,
  faTriangleExclamation,
} from "@fortawesome/free-solid-svg-icons";
import { AppSectionPage } from "@/components/app/app-section-page";

const primaryActions = [
  {
    label: "Create ticket",
    href: "/tickets/create",
    icon: faPlus,
    tone: "bg-stone-950 text-white",
    helper: "Open the live ticket workspace",
  },
  {
    label: "Spill over",
    href: "/spill-over",
    icon: faTriangleExclamation,
    tone: "bg-amber-50 text-amber-900",
    helper: "Review pending, approved, and overkill queues",
  },
  {
    label: "Tickets",
    href: "/tickets",
    icon: faTicket,
    tone: "bg-sky-50 text-sky-900",
    helper: "Search and print current-period tickets",
  },
  {
    label: "Ledgers",
    href: "/ledgers",
    icon: faLayerGroup,
    tone: "bg-emerald-50 text-emerald-900",
    helper: "Check ledger status and capacity view",
  },
];

const workflowCards = [
  {
    title: "Ticket flow",
    body: "Create tickets, preview ledger fills, and confirm spill over before submit.",
    href: "/tickets/create",
    icon: faFileInvoice,
  },
  {
    title: "Spill-over control",
    body: "Approve, return, and export collaborator spill-over activity from one place.",
    href: "/spill-over",
    icon: faTriangleExclamation,
  },
  {
    title: "Archive review",
    body: "Open closed periods and inspect archived ledgers, tickets, and spill over safely.",
    href: "/archive",
    icon: faBoxArchive,
  },
  {
    title: "Exports",
    body: "Download ledger exports and print collaborator spill-over receipts.",
    href: "/export-ledger",
    icon: faFolderOpen,
  },
];

const operationsChecklist = [
  "Open an active period before creating operational data.",
  "Create working ledgers for each user before ticket entry starts.",
  "Approve pending spill over before end-of-period archive review.",
  "Use archive for closed-period inspection only; archive data stays read-only.",
];

const oversightItems = [
  { label: "Periods", href: "/periods", icon: faCalendarDays, helper: "Admin-only period controls" },
  { label: "Override codes", href: "/admin/override-codes", icon: faShieldHalved, helper: "Review or rotate admin override access" },
  { label: "Audit logs", href: "/admin/audit-logs", icon: faCircleCheck, helper: "Trace approvals, refunds, and archive actions" },
];

export default function Home() {
  return (
    <AppSectionPage
      eyebrow="Dashboard"
      title="Dashboard"
      description=""
      workspaceLabel="Dashboard"
      aside={
        <aside className="space-y-5">
          <section className="rounded-[28px] border border-stone-900/8 bg-[#f3f0ea] p-5 shadow-[0_8px_24px_rgba(28,24,20,0.03)] sm:p-6">
            <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-stone-400">
              Operations
            </p>
            <div className="mt-4 space-y-3">
              {oversightItems.map((item) => (
                <Link
                  key={item.label}
                  href={item.href}
                  className="block rounded-[22px] border border-stone-900/8 bg-white px-4 py-4 transition hover:border-stone-900/16 hover:bg-stone-50"
                >
                  <div className="flex items-center gap-3">
                    <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-stone-100 text-stone-700">
                      <FontAwesomeIcon icon={item.icon} className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-stone-900">{item.label}</p>
                      <p className="mt-1 text-sm text-stone-500">{item.helper}</p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </section>

          <section className="rounded-[28px] border border-stone-900/8 bg-[#f3f0ea] p-5 shadow-[0_8px_24px_rgba(28,24,20,0.03)] sm:p-6">
            <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-stone-400">
              Daily check
            </p>
            <div className="mt-4 space-y-3">
              {operationsChecklist.map((item) => (
                <div
                  key={item}
                  className="flex items-start gap-3 rounded-[20px] bg-white px-4 py-4"
                >
                  <span className="mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                    <FontAwesomeIcon icon={faCircleCheck} className="h-3 w-3" />
                  </span>
                  <p className="text-sm leading-6 text-stone-600">{item}</p>
                </div>
              ))}
            </div>
          </section>
        </aside>
      }
    >
      <div className="space-y-6">
        <section className="rounded-[24px] border border-stone-900/8 bg-[#f7f4ef] px-5 py-5 shadow-[0_8px_24px_rgba(28,24,20,0.04)] sm:px-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-stone-400">
                FlowBit workspace
              </p>
              <h1 className="mt-3 text-3xl font-semibold text-stone-950 sm:text-4xl">
                Run ticket entry, spill-over control, exports, and archive review from one dashboard.
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-stone-600 sm:text-base">
                This dashboard is your jump point for the active period. Use it to move quickly between live
                ticket work, ledger checks, spill-over approvals, exports, and closed-period archive review.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {primaryActions.slice(0, 2).map((action) => (
                <Link
                  key={action.label}
                  href={action.href}
                  className={`rounded-[22px] px-5 py-5 shadow-[0_6px_18px_rgba(28,24,20,0.04)] transition hover:translate-y-[-1px] ${action.tone}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/20">
                      <FontAwesomeIcon icon={action.icon} className="h-4 w-4" />
                    </span>
                    <FontAwesomeIcon icon={faArrowRight} className="h-4 w-4" />
                  </div>
                  <p className="mt-4 text-lg font-semibold">{action.label}</p>
                  <p className="mt-1 text-sm opacity-80">{action.helper}</p>
                </Link>
              ))}
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {primaryActions.map((action) => (
            <Link
              key={action.label}
              href={action.href}
              className="rounded-[24px] border border-stone-900/8 bg-white px-5 py-5 shadow-[0_8px_24px_rgba(28,24,20,0.04)] transition hover:border-stone-900/16 hover:bg-stone-50"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-stone-100 text-stone-700">
                  <FontAwesomeIcon icon={action.icon} className="h-4 w-4" />
                </span>
                <FontAwesomeIcon icon={faArrowRight} className="h-4 w-4 text-stone-400" />
              </div>
              <p className="mt-4 text-lg font-semibold text-stone-950">{action.label}</p>
              <p className="mt-2 text-sm leading-6 text-stone-500">{action.helper}</p>
            </Link>
          ))}
        </section>

        <section className="grid gap-5 xl:grid-cols-2">
          <article className="rounded-[28px] border border-stone-900/8 bg-white p-5 shadow-[0_8px_24px_rgba(28,24,20,0.04)] sm:p-6">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-stone-100 text-stone-700">
                <FontAwesomeIcon icon={faTicket} className="h-4 w-4" />
              </span>
              <div>
                <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-stone-400">
                  Workflows
                </p>
                <h2 className="mt-1 text-xl font-semibold text-stone-950">Core sections</h2>
              </div>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              {workflowCards.map((card) => (
                <Link
                  key={card.title}
                  href={card.href}
                  className="rounded-[24px] border border-stone-900/8 bg-stone-50 px-5 py-5 transition hover:border-stone-900/16 hover:bg-white"
                >
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white text-stone-700 shadow-[0_4px_12px_rgba(28,24,20,0.05)]">
                    <FontAwesomeIcon icon={card.icon} className="h-4 w-4" />
                  </span>
                  <p className="mt-4 text-base font-semibold text-stone-950">{card.title}</p>
                  <p className="mt-2 text-sm leading-6 text-stone-500">{card.body}</p>
                </Link>
              ))}
            </div>
          </article>

          <article className="rounded-[28px] border border-stone-900/8 bg-white p-5 shadow-[0_8px_24px_rgba(28,24,20,0.04)] sm:p-6">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-stone-100 text-stone-700">
                <FontAwesomeIcon icon={faCircleCheck} className="h-4 w-4" />
              </span>
              <div>
                <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-stone-400">
                  How to use
                </p>
                <h2 className="mt-1 text-xl font-semibold text-stone-950">Suggested daily flow</h2>
              </div>
            </div>

            <div className="mt-5 space-y-4">
              {[
                "Start in Create ticket for live entry and preview checks.",
                "Move to Spill over to approve, return, or review collaborator activity.",
                "Use Tickets for receipt lookup, print, refund, and audit tracing.",
                "Open Ledgers to inspect identifier usage and freeze controls.",
                "Use Export for ledger downloads and spill-over receipt printing.",
                "Finish in Archive when you need closed-period review only.",
              ].map((item, index) => (
                <div
                  key={item}
                  className="flex items-start gap-4 rounded-[22px] border border-stone-900/8 bg-stone-50 px-4 py-4"
                >
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-stone-950 text-sm font-semibold text-white">
                    {index + 1}
                  </span>
                  <p className="text-sm leading-6 text-stone-600">{item}</p>
                </div>
              ))}
            </div>
          </article>
        </section>
      </div>
    </AppSectionPage>
  );
}
