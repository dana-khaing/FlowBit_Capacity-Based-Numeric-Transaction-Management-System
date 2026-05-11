"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowRight,
  faClockRotateLeft,
  faExpand,
  faFileInvoice,
  faLayerGroup,
  faPlus,
  faTicket,
  faTriangleExclamation,
} from "@fortawesome/free-solid-svg-icons";
import { AppSectionPage } from "@/components/app/app-section-page";
import { TICKETS_UPDATED_EVENT } from "@/components/app/workspace-events";
import { usePeriodState } from "@/components/period/use-period-state";
import {
  fetchDashboardReport,
  fetchDashboardFullNumbers,
  type FlowBitDashboardReport,
  type FlowBitDashboardFullNumberPage,
} from "@/lib/dashboard-client";
import { fetchLedgers, type FlowBitLedger } from "@/lib/ledger-client";
import { fetchApprovedOverflowPage, fetchPendingOverflowPage, type FlowBitOverflow } from "@/lib/overflow-client";
import { fetchPeriods } from "@/lib/period-client";
import { fetchTickets, type FlowBitTicketListItem } from "@/lib/ticket-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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

function getRecentTicketCustomerName(value: string) {
  const trimmed = value.trim();
  if (!trimmed || /^Walk-in\s+TICKET-/i.test(trimmed)) {
    return "-";
  }
  return trimmed;
}

function barWidth(progress: number) {
  return `${Math.max(0, Math.min(progress, 100))}%`;
}

export default function Home() {
  const [report, setReport] = useState<FlowBitDashboardReport | null>(null);
  const [activeLedgers, setActiveLedgers] = useState<FlowBitLedger[]>([]);
  const [pendingOverflows, setPendingOverflows] = useState<FlowBitOverflow[]>([]);
  const [approvedOverflows, setApprovedOverflows] = useState<FlowBitOverflow[]>([]);
  const [recentTickets, setRecentTickets] = useState<FlowBitTicketListItem[]>([]);
  const [archivedPeriodCount, setArchivedPeriodCount] = useState(0);
  const [closedPeriodNames, setClosedPeriodNames] = useState<string[]>([]);
  const [dashboardError, setDashboardError] = useState<string | null>(null);
  const [isDashboardLoading, setIsDashboardLoading] = useState(true);
  const [isFullNumberModalOpen, setIsFullNumberModalOpen] = useState(false);
  const [fullNumberSearch, setFullNumberSearch] = useState("");
  const [fullNumberPage, setFullNumberPage] = useState(1);
  const [fullNumberModalData, setFullNumberModalData] = useState<FlowBitDashboardFullNumberPage | null>(null);
  const [isFullNumberModalLoading, setIsFullNumberModalLoading] = useState(false);
  const [fullNumberModalError, setFullNumberModalError] = useState<string | null>(null);

  const { activePeriod, hasActivePeriod, isLoading: isPeriodLoading, error: periodError } = usePeriodState();

  const refreshDashboard = useCallback(async (background = false) => {
    if (isPeriodLoading) {
      return;
    }

    if (!hasActivePeriod || !activePeriod) {
      setReport(null);
      setActiveLedgers([]);
      setPendingOverflows([]);
      setApprovedOverflows([]);
      setRecentTickets([]);
      setArchivedPeriodCount(0);
      setClosedPeriodNames([]);
      setIsDashboardLoading(false);
      return;
    }

    let isMounted = true;
    if (!background) {
      setIsDashboardLoading(true);
    }

    try {
      const [nextReport, nextLedgers, nextPending, nextApproved, nextRecentTickets, periods] = await Promise.all([
        fetchDashboardReport(activePeriod.id),
        fetchLedgers({ period_id: activePeriod.id }),
        fetchPendingOverflowPage({ periodId: activePeriod.id, page: 1, pageSize: 4 }),
        fetchApprovedOverflowPage({ periodId: activePeriod.id, page: 1, pageSize: 4 }),
        fetchTickets({ periodId: activePeriod.id, limit: 6 }),
        fetchPeriods(),
      ]);
      if (!isMounted) {
        return;
      }
      setReport(nextReport);
      setActiveLedgers(nextLedgers.filter((ledger) => ledger.is_active && !ledger.is_capacity_reserve));
      setPendingOverflows(nextPending.results);
      setApprovedOverflows(nextApproved.results);
      setRecentTickets(nextRecentTickets);
      const closedPeriods = periods.filter((period) => !period.is_open);
      setArchivedPeriodCount(closedPeriods.length);
      setClosedPeriodNames(closedPeriods.map((period) => period.name));
      setDashboardError(null);
    } catch (error) {
      if (!isMounted) {
        return;
      }
      setDashboardError(error instanceof Error ? error.message : "Request failed.");
    } finally {
      if (isMounted) {
        setIsDashboardLoading(false);
      }
    }

    return () => {
      isMounted = false;
    };
  }, [activePeriod, hasActivePeriod, isPeriodLoading]);

  useEffect(() => {
    let cleanup: (() => void) | undefined;

    refreshDashboard().then((nextCleanup) => {
      cleanup = nextCleanup;
    });

    return () => {
      cleanup?.();
    };
  }, [refreshDashboard]);

  useEffect(() => {
    function handleTicketUpdate() {
      void refreshDashboard(true);
    }

    function handleFocus() {
      void refreshDashboard(true);
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        void refreshDashboard(true);
      }
    }

    window.addEventListener(TICKETS_UPDATED_EVENT, handleTicketUpdate);
    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener(TICKETS_UPDATED_EVENT, handleTicketUpdate);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [refreshDashboard]);

  const summaryCards = useMemo(() => {
    if (!report) {
      return [];
    }
    const allocatedTotal = Number(report.standard_total_allocated_amount || "0");
    const availableTotal = Number(report.standard_total_capacity || "0");
    const capacityPercent = availableTotal > 0 ? Math.round((allocatedTotal / availableTotal) * 100) : 0;
    const activeLedgerNames = activeLedgers.map((ledger) => ledger.name).slice(0, 2);

    return [
      {
        label: "Total entries today",
        value: String(report.today_ticket_count),
        meta: `${report.ticket_count} tickets in current period`,
        href: "/tickets",
      },
      {
        label: "Capacity used",
        value: `${capacityPercent}%`,
        meta: `${formatAmount(allocatedTotal)} / ${formatAmount(availableTotal)}`,
        href: "/ledgers",
      },
      {
        label: "Overflow pending",
        value: String(report.pending_overflow_count),
        meta: pendingOverflows.length ? "Needs approval" : "Queue clear",
        href: "/spill-over",
      },
      {
        label: "Active ledgers",
        value: String(report.active_ledger_count),
        meta: activeLedgerNames.length ? activeLedgerNames.join(" · ") : `${report.ledger_count} total ledgers`,
        href: "/ledgers",
      },
    ];
  }, [activeLedgers, pendingOverflows.length, report]);

  const hotNumbers = useMemo(() => {
    return report?.hot_numbers.map((row) => ({
      identifier: row.identifier,
      amount: Number(row.amount || "0"),
      progress: row.progress,
    })) ?? [];
  }, [report]);

  const almostFull = useMemo(() => {
    return report?.almost_full.map((row) => ({
      identifier: row.identifier,
      remaining: Number(row.remaining || "0"),
      progress: row.progress,
      tone: row.tone,
    })) ?? [];
  }, [report]);

  const fullNumbers = useMemo(() => {
    return report?.full_numbers.map((row) => ({
      identifier: row.identifier,
      amount: Number(row.amount || "0"),
    })) ?? [];
  }, [report]);

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

  useEffect(() => {
    if (!isFullNumberModalOpen || !activePeriod) {
      return;
    }

    let isMounted = true;
    setIsFullNumberModalLoading(true);

    fetchDashboardFullNumbers({
      periodId: activePeriod.id,
      page: fullNumberPage,
      identifier: fullNumberSearch,
    })
      .then((response) => {
        if (!isMounted) {
          return;
        }
        setFullNumberModalData(response);
        setFullNumberModalError(null);
      })
      .catch((error) => {
        if (!isMounted) {
          return;
        }
        setFullNumberModalError(error instanceof Error ? error.message : "Request failed.");
      })
      .finally(() => {
        if (isMounted) {
          setIsFullNumberModalLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [activePeriod, fullNumberPage, fullNumberSearch, isFullNumberModalOpen]);

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

          <section className="grid gap-4 lg:grid-cols-4">
            {summaryCards.map((card) => (
              <Link
                key={card.label}
                href={card.href}
                className="rounded-[24px] border border-stone-900/5 bg-[#f6f3ed] px-6 py-6 shadow-[0_4px_14px_rgba(28,24,20,0.03)] transition hover:border-stone-900/12 hover:bg-white"
              >
                <p className="text-[15px] font-medium text-stone-500">
                  {card.label}
                </p>
                <p className="mt-4 text-5xl font-light tracking-[-0.04em] text-stone-950">{card.value}</p>
                <p className={`mt-3 text-lg ${card.label === "Overflow pending" ? "text-rose-700" : "text-stone-400"}`}>{card.meta}</p>
              </Link>
            ))}
          </section>

          <section className="grid gap-5 xl:grid-cols-3">
            <article className="rounded-[28px] border border-stone-900/8 bg-white p-5 shadow-[0_8px_24px_rgba(28,24,20,0.04)] sm:p-6">
              <div className="flex items-center gap-3">
                <span className="h-3 w-3 rounded-full bg-lime-600" />
                <div>
                  <h2 className="text-[17px] font-medium uppercase tracking-[0.08em] text-stone-600">Hot numbers</h2>
                  <p className="mt-1 text-[15px] text-stone-400">Total entered · {activePeriod?.name ?? "Current period"}</p>
                </div>
              </div>

              <div className="thin-scrollbar mt-6 max-h-[440px] space-y-5 overflow-y-auto pr-1 sm:max-h-[540px] xl:max-h-[620px]">
                {hotNumbers.length ? hotNumbers.map((item) => (
                  <div key={item.identifier} className="grid items-center gap-3 sm:grid-cols-[64px_minmax(0,1.2fr)_104px]">
                    <div className="text-[24px] font-medium text-stone-950">{item.identifier}</div>
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
                  <p className="mt-1 text-[15px] text-stone-400">Least remaining capacity · action needed</p>
                </div>
              </div>

              <div className="thin-scrollbar mt-6 max-h-[440px] space-y-4 overflow-y-auto pr-1 sm:max-h-[540px] xl:max-h-[620px]">
                {almostFull.length ? almostFull.map((item) => (
                  <div key={item.identifier} className="grid items-center gap-3 sm:grid-cols-[64px_minmax(0,1.2fr)_104px]">
                    <div className="text-[24px] font-medium text-stone-950">{item.identifier}</div>
                    <div className={`h-3 rounded-full ${item.tone === "critical" ? "bg-red-100" : "bg-amber-100"}`}>
                      <div
                        className={`h-full rounded-full ${item.tone === "critical" ? "bg-red-700" : "bg-amber-700"}`}
                        style={{ width: barWidth(item.progress) }}
                      />
                    </div>
                    <div className={`text-right text-[15px] ${item.tone === "critical" ? "text-red-700" : "text-amber-700"}`}>
                      {formatAmount(item.remaining)}
                    </div>
                  </div>
                )) : (
                  <p className="text-sm text-stone-500">No near-full identifiers yet.</p>
                )}
              </div>
            </article>

            <article className="rounded-[28px] border border-stone-900/8 bg-white p-5 shadow-[0_8px_24px_rgba(28,24,20,0.04)] sm:p-6">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="h-3 w-3 rounded-full bg-amber-700" />
                  <div>
                    <h2 className="text-[17px] font-medium uppercase tracking-[0.08em] text-stone-600">Full Number</h2>
                    <p className="mt-1 text-[15px] text-stone-400">Numbers already at full standard capacity</p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  className="h-10 rounded-[16px] px-3 text-stone-500"
                  onClick={() => {
                    setFullNumberPage(1);
                    setFullNumberSearch("");
                    setIsFullNumberModalOpen(true);
                  }}
                >
                  <FontAwesomeIcon icon={faExpand} className="h-4 w-4" />
                  Open
                </Button>
              </div>

              <div className="thin-scrollbar mt-6 max-h-[440px] space-y-4 overflow-y-auto pr-1 sm:max-h-[540px] xl:max-h-[620px]">
                {fullNumbers.length ? fullNumbers.map((item) => (
                  <div key={item.identifier} className="grid items-center gap-3 sm:grid-cols-[64px_minmax(0,1.2fr)_104px]">
                    <div className="text-[24px] font-medium text-stone-950">{item.identifier}</div>
                    <div className="h-3 rounded-full bg-stone-100">
                      <div className="h-full rounded-full bg-amber-700" style={{ width: "100%" }} />
                    </div>
                    <div className="text-right text-[15px] text-stone-400">{formatAmount(item.amount)}</div>
                  </div>
                )) : (
                  <p className="text-sm text-stone-500">No fully filled numbers yet.</p>
                )}
              </div>
            </article>
          </section>

          <section className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
            <article className="rounded-[28px] border border-stone-900/8 bg-white p-5 shadow-[0_8px_24px_rgba(28,24,20,0.04)] sm:p-6">
              <div className="flex items-center gap-3">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-stone-100 text-stone-700">
                  <FontAwesomeIcon icon={faFileInvoice} className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-stone-400">
                    Quick actions
                  </p>
                  <h2 className="mt-1 text-xl font-semibold text-stone-950">Live workflow shortcuts</h2>
                </div>
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-2">
                {primaryActions.map((action) => (
                  <Link
                    key={action.label}
                    href={action.href}
                    className="rounded-[24px] border border-stone-900/8 bg-[#f6f3ed] px-5 py-5 transition hover:border-stone-900/16 hover:bg-white"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-white text-stone-700 shadow-[0_4px_12px_rgba(28,24,20,0.05)]">
                        <FontAwesomeIcon icon={action.icon} className="h-4 w-4" />
                      </span>
                      <FontAwesomeIcon icon={faArrowRight} className="h-4 w-4 text-stone-400" />
                    </div>
                    <p className="mt-4 text-lg font-semibold text-stone-950">{action.label}</p>
                    <p className="mt-2 text-sm leading-6 text-stone-500">{action.helper}</p>
                  </Link>
                ))}
              </div>
            </article>

            <article className="rounded-[28px] border border-stone-900/8 bg-white p-5 shadow-[0_8px_24px_rgba(28,24,20,0.04)] sm:p-6">
              <div className="flex items-center gap-3">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-stone-100 text-stone-700">
                  <FontAwesomeIcon icon={faClockRotateLeft} className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-stone-400">
                    Recent tickets
                  </p>
                  <h2 className="mt-1 text-xl font-semibold text-stone-950">Latest created tickets</h2>
                </div>
              </div>

              <div className="thin-scrollbar mt-6 max-h-[280px] divide-y divide-stone-900/8 overflow-y-auto pr-1">
                {recentTickets.length ? recentTickets.map((ticket) => (
                  <Link
                    key={ticket.id}
                    href="/tickets"
                    className="grid gap-3 py-4 transition first:pt-0 hover:opacity-85 sm:grid-cols-[1fr_auto] sm:items-center"
                  >
                    <div>
                      <p className="text-lg font-semibold text-stone-950">{ticket.ticket_number}</p>
                      <p className="mt-1 text-[15px] text-stone-500">
                        {getRecentTicketCustomerName(ticket.customer_name)}
                      </p>
                    </div>
                    <div className="text-left sm:text-right">
                      <p className="text-[15px] font-medium text-stone-900">
                        Amount - {formatAmount(ticket.total_amount)}
                      </p>
                      <p className="mt-1 text-[14px] text-stone-400">{formatDateTime(ticket.created_at)}</p>
                    </div>
                  </Link>
                )) : (
                  <p className="text-sm text-stone-500">No recent tickets in this period yet.</p>
                )}
              </div>

            </article>
          </section>

          <section className="rounded-[28px] border border-stone-900/8 bg-white p-5 shadow-[0_8px_24px_rgba(28,24,20,0.04)] sm:p-6">
            <div className="grid gap-8 md:grid-cols-2 xl:grid-cols-4">
              {footerGroups.map((group) => (
                <div key={group.title}>
                  <h3 className="text-[15px] font-semibold uppercase tracking-[0.14em] text-stone-500">
                    {group.title}
                  </h3>
                  <div className="mt-5 space-y-3">
                    {group.items.map((item) => (
                      <Link
                        key={item.label}
                        href={item.href}
                        className="block text-[18px] text-stone-400 transition hover:text-stone-950"
                      >
                        {item.label}
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}

      {isFullNumberModalOpen ? (
        <div
          className="fixed inset-0 z-50 bg-stone-950/40 px-4 py-6 backdrop-blur-sm"
          onClick={() => setIsFullNumberModalOpen(false)}
        >
          <div
            className="mx-auto flex max-h-[92vh] w-full max-w-3xl flex-col rounded-[28px] border border-stone-900/10 bg-white p-5 shadow-[0_24px_80px_rgba(28,24,20,0.24)] sm:p-6"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-stone-400">
                  Full number
                </p>
                <h2 className="mt-2 text-2xl font-semibold text-stone-950">Full number list</h2>
                <p className="mt-2 text-sm text-stone-500">Search by identifier and browse 20 rows per page.</p>
              </div>
              <Button variant="ghost" className="h-10 rounded-[16px] px-3" onClick={() => setIsFullNumberModalOpen(false)}>
                Close
              </Button>
            </div>

            <div className="mt-5">
              <Input
                value={fullNumberSearch}
                onChange={(event) => {
                  setFullNumberSearch(event.target.value.replace(/\D/g, "").slice(0, 3));
                  setFullNumberPage(1);
                }}
                placeholder="Search identifier"
              />
            </div>

            <div className="thin-scrollbar mt-5 flex-1 space-y-4 overflow-y-auto pr-1">
              {isFullNumberModalLoading ? (
                <p className="text-sm text-stone-500">Loading full numbers.</p>
              ) : fullNumberModalError ? (
                <p className="text-sm text-rose-700">{fullNumberModalError}</p>
              ) : fullNumberModalData?.results.length ? (
                fullNumberModalData.results.map((item) => (
                  <div key={`${item.identifier}-${item.amount}`} className="grid items-center gap-3 sm:grid-cols-[64px_minmax(0,1.2fr)_104px]">
                    <div className="text-[24px] font-medium text-stone-950">{item.identifier}</div>
                    <div className="h-3 rounded-full bg-stone-100">
                      <div className="h-full rounded-full bg-amber-700" style={{ width: "100%" }} />
                    </div>
                    <div className="text-right text-[15px] text-stone-400">{formatAmount(item.amount)}</div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-stone-500">No full numbers match this search.</p>
              )}
            </div>

            <div className="mt-5 flex items-center justify-between gap-3 border-t border-stone-900/8 pt-4">
              <p className="text-sm text-stone-500">
                {fullNumberModalData ? `${fullNumberModalData.count} total` : "0 total"}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  className="rounded-[16px]"
                  disabled={!fullNumberModalData || fullNumberModalData.page <= 1}
                  onClick={() => setFullNumberPage((current) => Math.max(1, current - 1))}
                >
                  Previous
                </Button>
                <span className="min-w-[76px] text-center text-sm text-stone-500">
                  Page {fullNumberModalData?.page ?? 1} / {fullNumberModalData?.total_pages ?? 1}
                </span>
                <Button
                  variant="outline"
                  className="rounded-[16px]"
                  disabled={!fullNumberModalData || fullNumberModalData.page >= fullNumberModalData.total_pages}
                  onClick={() =>
                    setFullNumberPage((current) =>
                      fullNumberModalData ? Math.min(fullNumberModalData.total_pages, current + 1) : current,
                    )
                  }
                >
                  Next
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </AppSectionPage>
  );
}
