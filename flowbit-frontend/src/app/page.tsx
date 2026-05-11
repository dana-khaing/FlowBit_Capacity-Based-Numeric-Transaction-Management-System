"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowRight,
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
import {
  fetchDashboardReport,
  fetchIdentifierCapacityReport,
  type FlowBitDashboardReport,
  type FlowBitIdentifierCapacityRow,
} from "@/lib/dashboard-client";
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

const oversightItems = [
  { label: "Periods", href: "/periods", icon: faCalendarDays, helper: "Admin-only period controls" },
  { label: "Override codes", href: "/admin/override-codes", icon: faShieldHalved, helper: "Review or rotate admin override access" },
  { label: "Audit logs", href: "/admin/audit-logs", icon: faCircleCheck, helper: "Trace approvals, refunds, and archive actions" },
];

const footerGroups = [
  {
    title: "Navigation",
    items: [
      { label: "Dashboard", href: "/" },
      { label: "Create Tickets", href: "/tickets/create" },
      { label: "Tickets", href: "/tickets" },
      { label: "Spill over", href: "/spill-over" },
    ],
  },
  {
    title: "Ledgers",
    items: [
      { label: "Ledgers", href: "/ledgers" },
      { label: "Export", href: "/export-ledger" },
      { label: "Archive", href: "/archive" },
      { label: "Periods", href: "/periods" },
    ],
  },
  {
    title: "Admin",
    items: [
      { label: "Users", href: "/admin/users" },
      { label: "Override codes", href: "/admin/override-codes" },
      { label: "Audit logs", href: "/admin/audit-logs" },
      { label: "Profile", href: "/profile" },
    ],
  },
  {
    title: "Support",
    items: [
      { label: "Contact support", href: "/contact-support" },
      { label: "Archive review", href: "/archive" },
      { label: "Export", href: "/export-ledger" },
      { label: "Profile", href: "/profile" },
    ],
  },
];

function formatAmount(value: string | number) {
  const amount = Number(value);
  if (Number.isNaN(amount)) {
    return String(value);
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

function barWidth(progress: number) {
  return `${Math.max(0, Math.min(progress, 100))}%`;
}

export default function Home() {
  const [report, setReport] = useState<FlowBitDashboardReport | null>(null);
  const [identifierRows, setIdentifierRows] = useState<FlowBitIdentifierCapacityRow[]>([]);
  const [recentTickets, setRecentTickets] = useState<FlowBitTicketListItem[]>([]);
  const [activeLedgers, setActiveLedgers] = useState<FlowBitLedger[]>([]);
  const [pendingOverflows, setPendingOverflows] = useState<FlowBitOverflow[]>([]);
  const [approvedOverflows, setApprovedOverflows] = useState<FlowBitOverflow[]>([]);
  const [archivedPeriodCount, setArchivedPeriodCount] = useState(0);
  const [closedPeriodNames, setClosedPeriodNames] = useState<string[]>([]);
  const [dashboardError, setDashboardError] = useState<string | null>(null);
  const [isDashboardLoading, setIsDashboardLoading] = useState(true);

  const { activePeriod, hasActivePeriod, isLoading: isPeriodLoading, error: periodError } = usePeriodState();

  useEffect(() => {
    if (isPeriodLoading) {
      return;
    }

    if (!hasActivePeriod || !activePeriod) {
      setReport(null);
      setIdentifierRows([]);
      setRecentTickets([]);
      setActiveLedgers([]);
      setPendingOverflows([]);
      setApprovedOverflows([]);
      setArchivedPeriodCount(0);
      setClosedPeriodNames([]);
      setIsDashboardLoading(false);
      return;
    }

    let isMounted = true;
    setIsDashboardLoading(true);

    Promise.all([
      fetchDashboardReport(activePeriod.id),
      fetchIdentifierCapacityReport(activePeriod.id),
      fetchTickets({ periodId: activePeriod.id, limit: 6 }),
      fetchLedgers({ period_id: activePeriod.id }),
      fetchPendingOverflowPage({ periodId: activePeriod.id, page: 1, pageSize: 4 }),
      fetchApprovedOverflowPage({ periodId: activePeriod.id, page: 1, pageSize: 4 }),
      fetchPeriods(),
    ])
      .then(([nextReport, nextIdentifierReport, nextTickets, nextLedgers, nextPending, nextApproved, periods]) => {
        if (!isMounted) {
          return;
        }
        setReport(nextReport);
        setIdentifierRows(nextIdentifierReport.results);
        setRecentTickets(nextTickets);
        setActiveLedgers(nextLedgers.filter((ledger) => ledger.is_active && !ledger.is_capacity_reserve));
        setPendingOverflows(nextPending.results);
        setApprovedOverflows(nextApproved.results);
        const closedPeriods = periods.filter((period) => !period.is_open);
        setArchivedPeriodCount(closedPeriods.length);
        setClosedPeriodNames(closedPeriods.map((period) => period.name));
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
        label: "Total tickets",
        value: String(report.ticket_count),
        meta: `${report.transaction_count} entries`,
      },
      {
        label: "Capacity used",
        value: formatAmount(report.total_allocated_amount),
        meta: `${report.identifier_count} identifiers active`,
      },
      {
        label: "Overflow pending",
        value: String(report.pending_overflow_count),
        meta: formatAmount(report.pending_overflow_amount),
      },
      {
        label: "Active ledgers",
        value: String(report.active_ledger_count),
        meta: `${report.ledger_count} total ledgers`,
      },
    ];
  }, [report]);

  const hotNumbers = useMemo(() => {
    return identifierRows
      .map((row) => {
        const used = Number(row.normal_usage || "0") + Number(row.reserve_used || "0");
        const total = Number(row.total_capacity || "0") + Number(row.reserve_granted || "0");
        return {
          identifier: row.number,
          amount: used,
          progress: total > 0 ? (used / total) * 100 : 0,
        };
      })
      .filter((row) => row.amount > 0)
      .sort((left, right) => right.amount - left.amount)
      .slice(0, 10);
  }, [identifierRows]);

  const almostFull = useMemo(() => {
    return identifierRows
      .map((row) => {
        const total = Number(row.total_capacity || "0") + Number(row.reserve_granted || "0");
        const remaining = Number(row.remaining_capacity || "0");
        const used = total - remaining;
        return {
          identifier: row.number,
          remaining,
          progress: total > 0 ? (used / total) * 100 : 0,
          tone: remaining <= 100 ? "critical" : "warning",
        };
      })
      .filter((row) => row.progress > 0)
      .sort((left, right) => left.remaining - right.remaining)
      .slice(0, 6);
  }, [identifierRows]);

  const periodEndLabel = useMemo(() => {
    if (!activePeriod?.end_date) {
      return "No active draw";
    }
    const parsed = new Date(activePeriod.end_date);
    if (Number.isNaN(parsed.getTime())) {
      return activePeriod.end_date;
    }
    return parsed.toLocaleString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }, [activePeriod?.end_date]);

  const nextDrawCountdown = useMemo(() => {
    if (!activePeriod?.end_date) {
      return "No countdown";
    }
    const target = new Date(activePeriod.end_date).getTime();
    if (Number.isNaN(target)) {
      return "No countdown";
    }
    const diff = Math.max(0, target - Date.now());
    const totalHours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(totalHours / 24);
    const hours = totalHours % 24;
    if (diff === 0) {
      return "Draw due now";
    }
    return `Draw in ${days}d ${hours}h`;
  }, [activePeriod?.end_date]);

  const latestClosedPeriod = closedPeriodNames[0] ?? "-";

  return (
    <AppSectionPage
      eyebrow="Dashboard"
      title="Dashboard"
      description=""
      workspaceLabel="Dashboard"
      showDefaultAside={false}
      workspaceClassName="border-0 bg-transparent p-0 shadow-none"
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
        <div className="space-y-7">
          <section className="rounded-[28px] border border-stone-900/8 bg-white px-6 py-7 shadow-[0_8px_24px_rgba(28,24,20,0.04)] sm:px-8">
            <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
              <div>
                <p className="text-[13px] font-medium uppercase tracking-[0.18em] text-stone-400">
                  Next draw
                </p>
                <div className="mt-4 flex items-center gap-4 text-[54px] font-light tracking-[0.18em] text-stone-950 sm:text-[72px]">
                  <span>000</span>
                  <span className="text-stone-400">—</span>
                  <span>000</span>
                </div>
                <p className="mt-4 text-lg text-stone-500">{periodEndLabel}</p>
              </div>

              <div className="flex flex-col items-start gap-3 xl:items-end">
                <span className="rounded-full bg-amber-100 px-4 py-2 text-lg font-medium text-amber-900">
                  {nextDrawCountdown}
                </span>
                <p className="text-lg text-stone-400">
                  Previous: {latestClosedPeriod} · Archived periods {archivedPeriodCount}
                </p>
              </div>
            </div>
          </section>

          <section className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-4">
            {summaryCards.map((card) => (
              <article
                key={card.label}
                className="rounded-[24px] border border-stone-900/5 bg-[#f6f3ed] px-6 py-6 shadow-[0_4px_14px_rgba(28,24,20,0.03)]"
              >
                <p className="text-[15px] font-medium text-stone-500">
                  {card.label}
                </p>
                <p className="mt-4 text-5xl font-light tracking-[-0.04em] text-stone-950">{card.value}</p>
                <p className={`mt-3 text-lg ${card.label === "Overflow pending" ? "text-rose-700" : "text-stone-400"}`}>{card.meta}</p>
              </article>
            ))}
          </section>

          <section className="grid gap-5 xl:grid-cols-3">
            <article className="rounded-[28px] border border-stone-900/8 bg-white p-5 shadow-[0_8px_24px_rgba(28,24,20,0.04)] sm:p-6">
              <div className="flex items-center gap-3">
                <span className="h-3 w-3 rounded-full bg-lime-600" />
                <div>
                  <h2 className="text-[17px] font-medium uppercase tracking-[0.08em] text-stone-600">Hot numbers</h2>
                  <p className="mt-1 text-[15px] text-stone-400">Most used identifiers this period</p>
                </div>
              </div>

              <div className="mt-6 space-y-5">
                {hotNumbers.length ? hotNumbers.map((item) => (
                  <div key={item.identifier} className="grid items-center gap-3 sm:grid-cols-[64px_minmax(0,1fr)_110px]">
                    <div className="text-2xl font-medium text-stone-900">{item.identifier}</div>
                    <div className="h-3 rounded-full bg-stone-100">
                      <div className="h-full rounded-full bg-lime-600" style={{ width: barWidth(item.progress) }} />
                    </div>
                    <div className="text-right text-[15px] text-stone-400">{formatAmount(item.amount)}</div>
                  </div>
                )) : (
                  <p className="text-sm text-stone-500">No identifier usage yet.</p>
                )}
              </div>
            </article>

            <article className="rounded-[28px] border border-stone-900/8 bg-white p-5 shadow-[0_8px_24px_rgba(28,24,20,0.04)] sm:p-6">
              <div className="flex items-center gap-3">
                <span className="h-3 w-3 rounded-full bg-red-700" />
                <div>
                  <h2 className="text-[17px] font-medium uppercase tracking-[0.08em] text-stone-600">Almost Full</h2>
                  <p className="mt-1 text-[15px] text-stone-400">Least remaining capacity</p>
                </div>
              </div>

              <div className="mt-6 space-y-4">
                {almostFull.length ? almostFull.map((item) => (
                  <div
                    key={item.identifier}
                    className={`rounded-[22px] border px-4 py-4 ${item.tone === "critical" ? "border-red-200 bg-red-50" : "border-amber-200 bg-amber-50"}`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-2xl font-medium text-stone-900">{item.identifier}</div>
                      <div className="text-xl font-medium text-stone-700">{formatAmount(item.remaining)} left</div>
                    </div>
                    <div className="mt-3 h-2.5 rounded-full bg-white/60">
                      <div
                        className={`h-full rounded-full ${item.tone === "critical" ? "bg-red-700" : "bg-amber-700"}`}
                        style={{ width: barWidth(item.progress) }}
                      />
                    </div>
                  </div>
                )) : (
                  <p className="text-sm text-stone-500">No near-full identifiers yet.</p>
                )}
              </div>
            </article>

            <article className="rounded-[28px] border border-stone-900/8 bg-white p-5 shadow-[0_8px_24px_rgba(28,24,20,0.04)] sm:p-6">
              <div className="flex items-center gap-3">
                <span className="h-3 w-3 rounded-full bg-amber-700" />
                <div>
                  <h2 className="text-[17px] font-medium uppercase tracking-[0.08em] text-stone-600">My Recent Entries</h2>
                  <p className="mt-1 text-[15px] text-stone-400">Latest created tickets</p>
                </div>
              </div>

              <div className="mt-6 divide-y divide-stone-900/8">
                {recentTickets.length ? recentTickets.map((ticket) => (
                  <Link key={ticket.id} href="/tickets" className="grid gap-3 py-4 sm:grid-cols-[1fr_auto] sm:items-center">
                    <div>
                      <p className="text-lg font-medium text-stone-900">{ticket.ticket_number}</p>
                      <p className="mt-1 text-[15px] text-stone-400">{getCustomerName(ticket.customer_name)}</p>
                    </div>
                    <div className="text-left sm:text-right">
                      <p className="text-xl font-light text-stone-700">Amount - {formatAmount(ticket.total_amount)}</p>
                      <p className="mt-1 text-[15px] text-stone-400">{formatDateTime(ticket.created_at)}</p>
                    </div>
                  </Link>
                )) : (
                  <p className="py-4 text-sm text-stone-500">No recent entries yet.</p>
                )}
              </div>
            </article>
          </section>

          <section className="grid gap-5 xl:grid-cols-2">
            <article className="rounded-[28px] border border-stone-900/8 bg-white p-5 shadow-[0_8px_24px_rgba(28,24,20,0.04)] sm:p-6">
              <div className="flex items-center gap-3">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-stone-100 text-stone-700">
                  <FontAwesomeIcon icon={faLayerGroup} className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-stone-400">
                    Live queues
                  </p>
                  <h2 className="mt-1 text-xl font-semibold text-stone-950">Ledgers and spill over</h2>
                </div>
              </div>

              <div className="mt-5 grid gap-4 sm:grid-cols-2">
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
                        <p className="mt-1 text-sm text-stone-500">Capacity {formatAmount(ledger.limit_per_identifier)}</p>
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
              </div>
            </article>

            <article className="rounded-[28px] border border-stone-900/8 bg-white p-5 shadow-[0_8px_24px_rgba(28,24,20,0.04)] sm:p-6">
              <div className="flex items-center gap-3">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-stone-100 text-stone-700">
                  <FontAwesomeIcon icon={faFolderOpen} className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-stone-400">
                    Sections
                  </p>
                  <h2 className="mt-1 text-xl font-semibold text-stone-950">Dashboard groups</h2>
                </div>
              </div>

              <div className="mt-5 grid gap-8 border-t border-stone-900/8 pt-6 md:grid-cols-2 xl:grid-cols-4">
                {footerGroups.map((group) => (
                  <div key={group.title}>
                    <h3 className="text-[15px] font-semibold uppercase tracking-[0.14em] text-stone-500">
                      {group.title}
                    </h3>
                    <div className="mt-4 space-y-3">
                      {group.items.map((item) => (
                        <Link
                          key={item.label}
                          href={item.href}
                          className="block text-sm text-stone-600 transition hover:text-stone-950"
                        >
                          {item.label}
                        </Link>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </article>
          </section>
        </div>
      )}
    </AppSectionPage>
  );
}
