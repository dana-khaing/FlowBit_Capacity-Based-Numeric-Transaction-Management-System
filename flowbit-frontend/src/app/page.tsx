"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowRight,
  faBoxArchive,
  faCalendarDays,
  faCircleCheck,
  faClockRotateLeft,
  faFileInvoice,
  faFolderOpen,
  faLayerGroup,
  faPlus,
  faShieldHalved,
  faTicket,
  faTriangleExclamation,
} from "@fortawesome/free-solid-svg-icons";
import { AppSectionPage } from "@/components/app/app-section-page";
import { usePeriodState } from "@/components/period/use-period-state";
import { fetchDashboardReport, type FlowBitDashboardReport } from "@/lib/dashboard-client";
import { fetchLedgers, type FlowBitLedger } from "@/lib/ledger-client";
import { fetchApprovedOverflowPage, fetchPendingOverflowPage, type FlowBitOverflow } from "@/lib/overflow-client";
import { fetchPeriods } from "@/lib/period-client";
import { fetchTickets, type FlowBitTicketListItem } from "@/lib/ticket-client";

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

const supportLinks = [
  { label: "Archive", href: "/archive", icon: faClockRotateLeft, helper: "Inspect closed periods safely" },
  { label: "Export", href: "/export-ledger", icon: faFolderOpen, helper: "Download ledger and spill-over output" },
  { label: "Contact support", href: "/contact-support", icon: faShieldHalved, helper: "Raise issues or get admin help" },
];

const oversightItems = [
  { label: "Periods", href: "/periods", icon: faCalendarDays, helper: "Admin-only period controls" },
  { label: "Override codes", href: "/admin/override-codes", icon: faShieldHalved, helper: "Review or rotate admin override access" },
  { label: "Audit logs", href: "/admin/audit-logs", icon: faCircleCheck, helper: "Trace approvals, refunds, and archive actions" },
];

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

function formatDateTime(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getCustomerName(value: string | null | undefined) {
  const normalized = value?.trim() || "";
  if (!normalized || normalized.startsWith("Walk-in ")) {
    return "-";
  }
  return normalized;
}

export default function Home() {
  const [report, setReport] = useState<FlowBitDashboardReport | null>(null);
  const [recentTickets, setRecentTickets] = useState<FlowBitTicketListItem[]>([]);
  const [activeLedgers, setActiveLedgers] = useState<FlowBitLedger[]>([]);
  const [pendingOverflows, setPendingOverflows] = useState<FlowBitOverflow[]>([]);
  const [approvedOverflows, setApprovedOverflows] = useState<FlowBitOverflow[]>([]);
  const [archivedPeriodCount, setArchivedPeriodCount] = useState(0);
  const [dashboardError, setDashboardError] = useState<string | null>(null);
  const [isDashboardLoading, setIsDashboardLoading] = useState(true);

  const { activePeriod, hasActivePeriod, isLoading: isPeriodLoading, error: periodError } = usePeriodState();

  useEffect(() => {
    if (isPeriodLoading) {
      return;
    }

    if (!hasActivePeriod || !activePeriod) {
      setReport(null);
      setRecentTickets([]);
      setActiveLedgers([]);
      setPendingOverflows([]);
      setApprovedOverflows([]);
      setArchivedPeriodCount(0);
      setIsDashboardLoading(false);
      return;
    }

    let isMounted = true;
    setIsDashboardLoading(true);

    Promise.all([
      fetchDashboardReport(activePeriod.id),
      fetchTickets({ periodId: activePeriod.id, limit: 5 }),
      fetchLedgers({ period_id: activePeriod.id }),
      fetchPendingOverflowPage({ periodId: activePeriod.id, page: 1, pageSize: 5 }),
      fetchApprovedOverflowPage({ periodId: activePeriod.id, page: 1, pageSize: 5 }),
      fetchPeriods(),
    ])
      .then(([nextReport, nextTickets, nextLedgers, nextPending, nextApproved, periods]) => {
        if (!isMounted) {
          return;
        }
        setReport(nextReport);
        setRecentTickets(nextTickets);
        setActiveLedgers(
          nextLedgers.filter((ledger) => ledger.is_active && !ledger.is_capacity_reserve),
        );
        setPendingOverflows(nextPending.results);
        setApprovedOverflows(nextApproved.results);
        setArchivedPeriodCount(periods.filter((period) => !period.is_open).length);
        setDashboardError(null);
      })
      .catch((error) => {
        if (!isMounted) {
          return;
        }
        setDashboardError(error instanceof Error ? error.message : "Request failed.");
      })
      .finally(() => {
        if (isMounted) {
          setIsDashboardLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [activePeriod?.id, hasActivePeriod, isPeriodLoading]);

  const summaryCards = useMemo(() => {
    if (!report) {
      return [];
    }
    return [
      {
        label: "Tickets",
        value: String(report.ticket_count),
        helper: `${report.transaction_count} entries`,
      },
      {
        label: "Active ledgers",
        value: String(report.active_ledger_count),
        helper: `${report.ledger_count} total ledgers`,
      },
      {
        label: "Pending spill over",
        value: String(report.pending_overflow_count),
        helper: formatAmount(report.pending_overflow_amount),
      },
      {
        label: "Reserve granted",
        value: formatAmount(report.reserve_capacity_granted),
        helper: `${report.identifier_count} identifiers used`,
      },
    ];
  }, [report]);

  const dailyFlow = [
    "Start in Create ticket for live entry and preview checks.",
    "Move to Spill over to approve, return, or review collaborator activity.",
    "Use Tickets for receipt lookup, print, refund, and audit tracing.",
    "Open Ledgers to inspect identifier usage and freeze controls.",
    "Use Export for ledger downloads and spill-over receipt printing.",
    "Finish in Archive when you need closed-period review only.",
  ];

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
              Current period
            </p>
            <div className="mt-4 space-y-3">
              <div className="rounded-[22px] bg-white px-4 py-4">
                <p className="text-sm text-stone-500">Active term</p>
                <p className="mt-1 text-lg font-semibold text-stone-900">
                  {activePeriod?.name ?? "No active period"}
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                <div className="rounded-[22px] bg-white px-4 py-4">
                  <p className="text-sm text-stone-500">Archive periods</p>
                  <p className="mt-1 text-lg font-semibold text-stone-900">{archivedPeriodCount}</p>
                </div>
                <div className="rounded-[22px] bg-white px-4 py-4">
                  <p className="text-sm text-stone-500">Allocated total</p>
                  <p className="mt-1 text-lg font-semibold text-stone-900">
                    {report ? formatAmount(report.total_allocated_amount) : "0"}
                  </p>
                </div>
              </div>
            </div>
          </section>
        </aside>
      }
    >
      {isPeriodLoading || isDashboardLoading ? (
        <div className="rounded-[24px] border border-dashed border-stone-300 bg-stone-50 px-5 py-10 text-sm text-stone-500">
          Loading dashboard.
        </div>
      ) : periodError ? (
        <div className="rounded-[24px] border border-rose-200 bg-rose-50 px-5 py-5 text-sm text-rose-700">
          {periodError}
        </div>
      ) : !hasActivePeriod ? (
        <div className="rounded-[24px] border border-dashed border-amber-300 bg-amber-50 px-5 py-5 text-sm text-amber-800">
          Open a period first before using the live dashboard.
        </div>
      ) : dashboardError ? (
        <div className="rounded-[24px] border border-rose-200 bg-rose-50 px-5 py-5 text-sm text-rose-700">
          {dashboardError}
        </div>
      ) : (
        <div className="space-y-6">
          <section className="rounded-[24px] border border-stone-900/8 bg-[#f7f4ef] px-5 py-5 shadow-[0_8px_24px_rgba(28,24,20,0.04)] sm:px-6">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-stone-400">
                  FlowBit workspace
                </p>
                <h1 className="mt-3 text-3xl font-semibold text-stone-950 sm:text-4xl">
                  {activePeriod?.name ?? "Current period"} is live.
                </h1>
                <p className="mt-3 max-w-3xl text-sm leading-7 text-stone-600 sm:text-base">
                  Use the live workspace numbers below to move between ticket entry, spill-over control, ledgers,
                  exports, and archive review without leaving the current period context.
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
            {summaryCards.map((card) => (
              <article
                key={card.label}
                className="rounded-[24px] border border-stone-900/8 bg-white px-5 py-5 shadow-[0_8px_24px_rgba(28,24,20,0.04)]"
              >
                <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-stone-400">
                  {card.label}
                </p>
                <p className="mt-3 text-3xl font-semibold text-stone-950">{card.value}</p>
                <p className="mt-2 text-sm text-stone-500">{card.helper}</p>
              </article>
            ))}
          </section>

          <section className="grid gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
            <article className="rounded-[28px] border border-stone-900/8 bg-white p-5 shadow-[0_8px_24px_rgba(28,24,20,0.04)] sm:p-6">
              <div className="flex items-center gap-3">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-stone-100 text-stone-700">
                  <FontAwesomeIcon icon={faTicket} className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-stone-400">
                    Live sections
                  </p>
                  <h2 className="mt-1 text-xl font-semibold text-stone-950">What needs attention now</h2>
                </div>
              </div>

              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <Link
                  href="/tickets"
                  className="rounded-[24px] border border-stone-900/8 bg-stone-50 px-5 py-5 transition hover:border-stone-900/16 hover:bg-white"
                >
                  <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-stone-400">Recent tickets</p>
                  <div className="mt-4 space-y-3">
                    {recentTickets.length ? recentTickets.map((ticket) => (
                      <div key={ticket.id} className="rounded-[18px] bg-white px-4 py-3">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-semibold text-stone-900">{ticket.ticket_number}</p>
                          <p className="text-sm font-medium text-stone-700">{formatAmount(ticket.total_amount)}</p>
                        </div>
                        <p className="mt-1 text-sm text-stone-500">{getCustomerName(ticket.customer_name)}</p>
                      </div>
                    )) : (
                      <p className="text-sm text-stone-500">No tickets in this period yet.</p>
                    )}
                  </div>
                </Link>

                <Link
                  href="/spill-over"
                  className="rounded-[24px] border border-stone-900/8 bg-stone-50 px-5 py-5 transition hover:border-stone-900/16 hover:bg-white"
                >
                  <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-stone-400">Pending spill over</p>
                  <div className="mt-4 space-y-3">
                    {pendingOverflows.length ? pendingOverflows.map((overflow) => (
                      <div key={overflow.id} className="rounded-[18px] bg-white px-4 py-3">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-lg font-semibold tracking-[0.12em] text-stone-900">{overflow.identifier_number}</p>
                          <p className="text-sm font-medium text-amber-800">{formatAmount(overflow.excess_amount)}</p>
                        </div>
                        <p className="mt-1 text-sm text-stone-500">{overflow.ticket_number || "No ticket"}</p>
                      </div>
                    )) : (
                      <p className="text-sm text-stone-500">No pending spill over right now.</p>
                    )}
                  </div>
                </Link>

                <Link
                  href="/ledgers"
                  className="rounded-[24px] border border-stone-900/8 bg-stone-50 px-5 py-5 transition hover:border-stone-900/16 hover:bg-white"
                >
                  <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-stone-400">Active ledgers</p>
                  <div className="mt-4 space-y-3">
                    {activeLedgers.length ? activeLedgers.map((ledger) => (
                      <div key={ledger.id} className="rounded-[18px] bg-white px-4 py-3">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-semibold text-stone-900">{ledger.name}</p>
                          <p className="text-sm text-stone-500">P{ledger.priority}</p>
                        </div>
                        <p className="mt-1 text-sm text-stone-500">
                          Capacity {formatAmount(ledger.limit_per_identifier)}
                        </p>
                      </div>
                    )) : (
                      <p className="text-sm text-stone-500">No active working ledgers.</p>
                    )}
                  </div>
                </Link>

                <Link
                  href="/spill-over"
                  className="rounded-[24px] border border-stone-900/8 bg-stone-50 px-5 py-5 transition hover:border-stone-900/16 hover:bg-white"
                >
                  <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-stone-400">Approved spill over</p>
                  <div className="mt-4 space-y-3">
                    {approvedOverflows.length ? approvedOverflows.map((overflow) => (
                      <div key={overflow.id} className="rounded-[18px] bg-white px-4 py-3">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-lg font-semibold tracking-[0.12em] text-stone-900">{overflow.identifier_number}</p>
                          <p className="text-sm font-medium text-emerald-700">
                            {formatAmount(overflow.amount_to_approve || overflow.excess_amount)}
                          </p>
                        </div>
                        <p className="mt-1 text-sm text-stone-500">
                          {overflow.approved_at ? formatDateTime(overflow.approved_at) : "Approved"}
                        </p>
                      </div>
                    )) : (
                      <p className="text-sm text-stone-500">No approved spill over right now.</p>
                    )}
                  </div>
                </Link>
              </div>
            </article>

            <div className="space-y-5">
              <article className="rounded-[28px] border border-stone-900/8 bg-white p-5 shadow-[0_8px_24px_rgba(28,24,20,0.04)] sm:p-6">
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-stone-100 text-stone-700">
                    <FontAwesomeIcon icon={faCircleCheck} className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-stone-400">
                      Daily flow
                    </p>
                    <h2 className="mt-1 text-xl font-semibold text-stone-950">Suggested order</h2>
                  </div>
                </div>

                <div className="mt-5 space-y-4">
                  {dailyFlow.map((item, index) => (
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

              <article className="rounded-[28px] border border-stone-900/8 bg-white p-5 shadow-[0_8px_24px_rgba(28,24,20,0.04)] sm:p-6">
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-stone-100 text-stone-700">
                    <FontAwesomeIcon icon={faFolderOpen} className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-stone-400">
                      Follow-up
                    </p>
                    <h2 className="mt-1 text-xl font-semibold text-stone-950">Other sections</h2>
                  </div>
                </div>

                <div className="mt-5 space-y-3">
                  {supportLinks.map((item) => (
                    <Link
                      key={item.label}
                      href={item.href}
                      className="block rounded-[22px] border border-stone-900/8 bg-stone-50 px-4 py-4 transition hover:border-stone-900/16 hover:bg-white"
                    >
                      <div className="flex items-center gap-3">
                        <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white text-stone-700 shadow-[0_4px_12px_rgba(28,24,20,0.05)]">
                          <FontAwesomeIcon icon={item.icon} className="h-4 w-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-stone-900">{item.label}</p>
                          <p className="mt-1 text-sm text-stone-500">{item.helper}</p>
                        </div>
                        <FontAwesomeIcon icon={faArrowRight} className="h-4 w-4 text-stone-400" />
                      </div>
                    </Link>
                  ))}
                </div>
              </article>
            </div>
          </section>
        </div>
      )}
    </AppSectionPage>
  );
}
