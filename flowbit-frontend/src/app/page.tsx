"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowRight,
  faCircleNotch,
  faClockRotateLeft,
  faExpand,
  faFileInvoice,
  faLayerGroup,
  faPlus,
  faTicket,
  faTriangleExclamation,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import { AppSectionPage } from "@/components/app/app-section-page";
import { DASHBOARD_UPDATED_EVENT } from "@/components/app/workspace-events";
import { useCurrentUserState } from "@/components/auth/current-user-context";
import { usePeriodState } from "@/components/period/use-period-state";
import { FLOWBIT_NOTIFICATIONS_UPDATED_EVENT } from "@/lib/notification-client";
import {
  fetchDashboardAlmostFull,
  fetchDashboardHotNumbers,
  fetchDashboardReport,
  fetchDashboardFullNumbers,
  type FlowBitDashboardAlmostFullPage,
  type FlowBitDashboardHotNumberPage,
  type FlowBitDashboardReport,
  type FlowBitDashboardFullNumberPage,
} from "@/lib/dashboard-client";
import { fetchApprovedOverflowPage, fetchPendingOverflowPage, type FlowBitOverflow } from "@/lib/overflow-client";
import { fetchPeriodLuckyDrawWinners, type FlowBitLuckyDrawWinners } from "@/lib/period-client";
import { TicketReceiptCard } from "@/components/tickets/ticket-receipt-card";
import { fetchTicketDetail, fetchTickets, type FlowBitTicketDetail, type FlowBitTicketListItem } from "@/lib/ticket-client";
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
      { label: "Customer service", href: "/contact-support" },
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

type DashboardDrilldownKind = "hot" | "almost" | "full";

export default function Home() {
  const currentUserState = useCurrentUserState();
  const [report, setReport] = useState<FlowBitDashboardReport | null>(null);
  const [pendingOverflows, setPendingOverflows] = useState<FlowBitOverflow[]>([]);
  const [approvedOverflows, setApprovedOverflows] = useState<FlowBitOverflow[]>([]);
  const [recentTickets, setRecentTickets] = useState<FlowBitTicketListItem[]>([]);
  const [dashboardError, setDashboardError] = useState<string | null>(null);
  const [isDashboardLoading, setIsDashboardLoading] = useState(true);
  const [dashboardDrilldownKind, setDashboardDrilldownKind] = useState<DashboardDrilldownKind | null>(null);
  const [dashboardDrilldownSearch, setDashboardDrilldownSearch] = useState("");
  const [dashboardDrilldownPage, setDashboardDrilldownPage] = useState(1);
  const [fullNumberModalData, setFullNumberModalData] = useState<FlowBitDashboardFullNumberPage | null>(null);
  const [hotNumberModalData, setHotNumberModalData] = useState<FlowBitDashboardHotNumberPage | null>(null);
  const [almostFullModalData, setAlmostFullModalData] = useState<FlowBitDashboardAlmostFullPage | null>(null);
  const [isDashboardDrilldownLoading, setIsDashboardDrilldownLoading] = useState(false);
  const [dashboardDrilldownError, setDashboardDrilldownError] = useState<string | null>(null);
  const [luckyDrawWinners, setLuckyDrawWinners] = useState<FlowBitLuckyDrawWinners | null>(null);
  const [selectedWinnerTicketNumber, setSelectedWinnerTicketNumber] = useState<string | null>(null);
  const [selectedWinnerTicket, setSelectedWinnerTicket] = useState<FlowBitTicketDetail | null>(null);
  const [isWinnerTicketLoading, setIsWinnerTicketLoading] = useState(false);

  const { activePeriod, hasActivePeriod, isLoading: isPeriodLoading, error: periodError } = usePeriodState();
  const currentUser = currentUserState?.user ?? null;

  const refreshDashboard = useCallback(async (background = false) => {
    if (isPeriodLoading) {
      return;
    }

    if (!hasActivePeriod || !activePeriod) {
      setReport(null);
      setPendingOverflows([]);
      setApprovedOverflows([]);
      setRecentTickets([]);
      setIsDashboardLoading(false);
      return;
    }

    let isMounted = true;
    if (!background) {
      setIsDashboardLoading(true);
    }

    try {
      const [nextReport, nextPending, nextApproved, nextRecentTickets, nextLuckyDrawWinners] = await Promise.all([
        fetchDashboardReport(activePeriod.id),
        fetchPendingOverflowPage({ periodId: activePeriod.id, page: 1, pageSize: 4 }),
        fetchApprovedOverflowPage({ periodId: activePeriod.id, page: 1, pageSize: 4 }),
        fetchTickets({ periodId: activePeriod.id, limit: 6 }),
        fetchPeriodLuckyDrawWinners(activePeriod.id),
      ]);
      if (!isMounted) {
        return;
      }
      setReport(nextReport);
      setPendingOverflows(nextPending.results);
      setApprovedOverflows(nextApproved.results);
      setRecentTickets(nextRecentTickets);
      setLuckyDrawWinners(nextLuckyDrawWinners);
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
    function handleDashboardUpdate() {
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

    window.addEventListener(DASHBOARD_UPDATED_EVENT, handleDashboardUpdate);
    window.addEventListener(FLOWBIT_NOTIFICATIONS_UPDATED_EVENT, handleDashboardUpdate);
    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener(DASHBOARD_UPDATED_EVENT, handleDashboardUpdate);
      window.removeEventListener(FLOWBIT_NOTIFICATIONS_UPDATED_EVENT, handleDashboardUpdate);
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
        label: "Total tickets",
        value: String(report.ticket_count),
        meta: "Current period ticket count",
        href: "/tickets",
      },
    ];
  }, [pendingOverflows.length, report]);

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

  const luckyDrawRevealLabel = useMemo(() => {
    if (!activePeriod?.lucky_draw_reveal_at) {
      return "No active draw";
    }
    const parsed = new Date(activePeriod.lucky_draw_reveal_at);
    if (Number.isNaN(parsed.getTime())) {
      return activePeriod.lucky_draw_reveal_at;
    }
    return parsed.toLocaleString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }, [activePeriod?.lucky_draw_reveal_at]);

  const nextDrawCountdown = useMemo(() => {
    if (!activePeriod?.lucky_draw_reveal_at || activePeriod?.lucky_draw_revealed) {
      return "No countdown";
    }
    const target = new Date(activePeriod.lucky_draw_reveal_at).getTime();
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
  }, [activePeriod?.lucky_draw_reveal_at, activePeriod?.lucky_draw_revealed]);

  const isCloseToPeriodEndWithPendingOverflow = useMemo(() => {
    if (!activePeriod?.end_date || !report?.pending_overflow_count) {
      return false;
    }
    const diff = new Date(activePeriod.end_date).getTime() - Date.now();
    return diff > 0 && diff <= 30 * 60 * 1000;
  }, [activePeriod?.end_date, report?.pending_overflow_count]);

  const luckyDrawDisplay = activePeriod?.lucky_draw_display || "***-***";
  const winningIdentifier = luckyDrawWinners?.lucky_draw.winning_identifiers[0] ?? null;
  const isPreClosed = Boolean(activePeriod?.pre_closed_at);

  async function openWinnerTicket(ticketNumber: string) {
    setSelectedWinnerTicketNumber(ticketNumber);
    setSelectedWinnerTicket(null);
    setIsWinnerTicketLoading(true);
    try {
      const detail = await fetchTicketDetail(ticketNumber);
      setSelectedWinnerTicket(detail);
    } catch {
      setSelectedWinnerTicket(null);
    } finally {
      setIsWinnerTicketLoading(false);
    }
  }

  function closeWinnerTicket() {
    if (isWinnerTicketLoading) {
      return;
    }
    setSelectedWinnerTicketNumber(null);
    setSelectedWinnerTicket(null);
  }

  function openDashboardDrilldown(kind: DashboardDrilldownKind) {
    setDashboardDrilldownKind(kind);
    setDashboardDrilldownPage(1);
    setDashboardDrilldownSearch("");
    setDashboardDrilldownError(null);
  }

  function closeDashboardDrilldown() {
    setDashboardDrilldownKind(null);
  }

  useEffect(() => {
    if (!dashboardDrilldownKind || !activePeriod) {
      return;
    }

    let isMounted = true;
    setIsDashboardDrilldownLoading(true);

    const request =
      dashboardDrilldownKind === "hot"
        ? fetchDashboardHotNumbers({
            periodId: activePeriod.id,
            page: dashboardDrilldownPage,
            identifier: dashboardDrilldownSearch,
          })
        : dashboardDrilldownKind === "almost"
          ? fetchDashboardAlmostFull({
              periodId: activePeriod.id,
              page: dashboardDrilldownPage,
              identifier: dashboardDrilldownSearch,
            })
          : fetchDashboardFullNumbers({
              periodId: activePeriod.id,
              page: dashboardDrilldownPage,
              identifier: dashboardDrilldownSearch,
            });

    request
      .then((response) => {
        if (!isMounted) {
          return;
        }
        if (dashboardDrilldownKind === "hot") {
          setHotNumberModalData(response as FlowBitDashboardHotNumberPage);
        } else if (dashboardDrilldownKind === "almost") {
          setAlmostFullModalData(response as FlowBitDashboardAlmostFullPage);
        } else {
          setFullNumberModalData(response as FlowBitDashboardFullNumberPage);
        }
        setDashboardDrilldownError(null);
      })
      .catch((error) => {
        if (!isMounted) {
          return;
        }
        setDashboardDrilldownError(error instanceof Error ? error.message : "Request failed.");
      })
      .finally(() => {
        if (isMounted) {
          setIsDashboardDrilldownLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [activePeriod, dashboardDrilldownKind, dashboardDrilldownPage, dashboardDrilldownSearch]);

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
          {currentUser?.role === "admin"
            ? "Open a period first before using the live dashboard."
            : "There is no active period right now. Please wait for admin to open the next period."}
        </div>
      ) : dashboardError ? (
        <div className="rounded-[24px] border border-rose-200 bg-rose-50 px-5 py-5 text-sm text-rose-700">
          {dashboardError}
        </div>
      ) : (
        <div className="space-y-7">
          <section className="rounded-[28px] border border-stone-900/8 bg-white px-6 py-5 shadow-[0_8px_24px_rgba(28,24,20,0.04)] sm:px-8">
            <div className="flex flex-col items-center gap-3 text-center">
              <div>
                <p className="text-[13px] font-medium uppercase tracking-[0.18em] text-stone-400">
                  {activePeriod?.lucky_draw_revealed ? "Lucky number" : "Next draw"}
                </p>
                <div className="mt-3 text-[48px] font-light tracking-[0.16em] text-stone-950 sm:text-[64px]">
                  <span>{luckyDrawDisplay}</span>
                </div>
                {!activePeriod?.lucky_draw_revealed ? (
                  <p className="mt-3 text-base text-stone-500 sm:text-lg">{luckyDrawRevealLabel}</p>
                ) : null}
              </div>

              {nextDrawCountdown !== "No countdown" ? (
                <div className="flex flex-col items-center gap-2">
                  <span className="rounded-full bg-amber-100 px-4 py-2 text-base font-medium text-amber-900 sm:text-lg">
                    {nextDrawCountdown}
                  </span>
                </div>
              ) : null}
            </div>
          </section>

          {isPreClosed ? (
            <section className="rounded-[24px] border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900">
              <p className="font-semibold uppercase tracking-[0.14em]">Pre-close active</p>
              <p className="mt-2">
                This period was pre-closed on {formatDateTime(activePeriod?.pre_closed_at ?? "")}. Active ledgers are closed and ticket operations are locked until lucky draw or a later pre-close update reopens the period.
              </p>
            </section>
          ) : null}

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

          {isCloseToPeriodEndWithPendingOverflow ? (
            <Link
              href="/spill-over"
              className="flex items-center justify-between gap-4 rounded-[24px] border border-amber-300 bg-amber-50 px-5 py-4 text-amber-900 shadow-[0_4px_14px_rgba(180,83,9,0.08)] transition hover:border-amber-400 hover:bg-amber-100"
            >
              <div>
                <p className="text-[12px] font-semibold uppercase tracking-[0.18em]">
                  Period closing soon
                </p>
                <p className="mt-1 text-sm">
                  {formatAmount(report?.pending_overflow_count ?? 0)} pending spill over still needs attention before close time.
                </p>
              </div>
              <span className="rounded-full bg-white px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-amber-800">
                Review queue
              </span>
            </Link>
          ) : null}

          {luckyDrawWinners?.lucky_draw.announced_at ? (
            <section className="relative overflow-hidden rounded-[28px] border border-emerald-200 bg-[linear-gradient(135deg,rgba(236,253,245,1),rgba(255,255,255,1))] px-6 py-6 shadow-[0_8px_24px_rgba(16,185,129,0.10)] sm:px-8">
              <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-emerald-200/50 blur-2xl" />
              <div className="pointer-events-none absolute -bottom-10 -left-10 h-32 w-32 rounded-full bg-lime-200/40 blur-2xl" />
              <div className="flex flex-col gap-4">
                <div className="text-center">
                  <p className="inline-flex self-center rounded-full bg-white/80 px-4 py-2 text-[12px] font-semibold uppercase tracking-[0.18em] text-emerald-700 shadow-[0_4px_12px_rgba(16,185,129,0.08)]">
                    Congratulations
                  </p>
                  <h2 className="mt-3 text-2xl font-semibold text-stone-950 sm:text-3xl">Lucky winner</h2>
                  <p className="mt-2 text-sm text-stone-600">
                    Winning identifier {winningIdentifier ?? "---"} · Announced {activePeriod?.lucky_draw_announced_at ? formatDateTime(activePeriod.lucky_draw_announced_at) : "-"}
                  </p>
                </div>

                <div className="grid gap-4 xl:grid-cols-3">
                  <div className="rounded-[22px] border border-stone-900/8 bg-white/80 px-4 py-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-400">Winner tickets</p>
                    <div className="thin-scrollbar mt-3 max-h-[320px] space-y-3 overflow-y-auto pr-1">
                      {luckyDrawWinners.tickets.length ? luckyDrawWinners.tickets.map((ticket) => (
                        <button
                          key={ticket.ticket_number}
                          type="button"
                          onClick={() => {
                            void openWinnerTicket(ticket.ticket_number);
                          }}
                          className="block w-full rounded-[18px] border border-stone-900/8 bg-stone-50 px-4 py-3 text-left transition hover:border-stone-300 hover:bg-white"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-base font-semibold text-stone-950">{ticket.ticket_number}</span>
                            <span className="text-sm text-stone-600">{formatAmount(ticket.total_amount)}</span>
                          </div>
                          <p className="mt-2 text-sm text-stone-500">
                            Customer {getRecentTicketCustomerName(ticket.customer_name)} · {ticket.matched_identifiers.join(", ")}
                          </p>
                        </button>
                      )) : (
                        <p className="text-sm text-stone-500">No winning tickets yet.</p>
                      )}
                    </div>
                  </div>

                  <div className="rounded-[22px] border border-stone-900/8 bg-white/80 px-4 py-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-400">Approved spill over</p>
                    <div className="thin-scrollbar mt-3 max-h-[320px] space-y-3 overflow-y-auto pr-1">
                      {luckyDrawWinners.approved_overflows.length ? luckyDrawWinners.approved_overflows.map((overflow) => (
                        <button
                          key={overflow.id}
                          type="button"
                          disabled={!overflow.ticket_number}
                          onClick={() => {
                            if (overflow.ticket_number) {
                              void openWinnerTicket(overflow.ticket_number);
                            }
                          }}
                          className="w-full rounded-[18px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-left disabled:cursor-default"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-base font-semibold text-stone-950">{overflow.identifier_number}</span>
                            <span className="text-sm text-stone-600">{formatAmount(overflow.amount)}</span>
                          </div>
                          <p className="mt-2 text-sm text-stone-500">
                            {overflow.collaborator_names.length ? overflow.collaborator_names.join(", ") : "Approved"}
                          </p>
                        </button>
                      )) : (
                        <p className="text-sm text-stone-500">No approved spill over winners.</p>
                      )}
                    </div>
                  </div>

                  <div className="rounded-[22px] border border-stone-900/8 bg-white/80 px-4 py-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-400">Overkill</p>
                    <div className="thin-scrollbar mt-3 max-h-[320px] space-y-3 overflow-y-auto pr-1">
                      {luckyDrawWinners.overkill_overflows.length ? luckyDrawWinners.overkill_overflows.map((overflow) => (
                        <div
                          key={overflow.id}
                          className="w-full rounded-[18px] border border-sky-200 bg-sky-50 px-4 py-3 text-left"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-base font-semibold text-stone-950">{overflow.identifier_number}</span>
                            <span className="text-sm text-stone-600">{formatAmount(overflow.amount)}</span>
                          </div>
                          <p className="mt-2 text-sm text-stone-500">
                            {overflow.collaborator_names.length ? overflow.collaborator_names.join(", ") : "Overkill"}
                          </p>
                        </div>
                      )) : (
                        <p className="text-sm text-stone-500">No overkill winners.</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </section>
          ) : null}

          <section className="grid gap-5 xl:grid-cols-3">
            <article className="rounded-[28px] border border-stone-900/8 bg-white p-5 shadow-[0_8px_24px_rgba(28,24,20,0.04)] sm:p-6">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="h-3 w-3 rounded-full bg-lime-600" />
                  <div>
                    <h2 className="text-[17px] font-medium uppercase tracking-[0.08em] text-stone-600">Hot numbers</h2>
                    <p className="mt-1 text-[15px] text-stone-400">Total entered · {activePeriod?.name ?? "Current period"}</p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  className="h-10 rounded-[16px] px-3 text-stone-500"
                  onClick={() => openDashboardDrilldown("hot")}
                >
                  <FontAwesomeIcon icon={faExpand} className="h-4 w-4" />
                  Open
                </Button>
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
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="h-3 w-3 rounded-full bg-red-700" />
                  <div>
                    <h2 className="text-[17px] font-medium uppercase tracking-[0.08em] text-stone-600">Almost Full</h2>
                    <p className="mt-1 text-[15px] text-stone-400">Least remaining capacity · action needed</p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  className="h-10 rounded-[16px] px-3 text-stone-500"
                  onClick={() => openDashboardDrilldown("almost")}
                >
                  <FontAwesomeIcon icon={faExpand} className="h-4 w-4" />
                  Open
                </Button>
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
                    openDashboardDrilldown("full");
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

      {selectedWinnerTicketNumber ? (
        <div
          className="fixed inset-0 z-50 bg-stone-950/55 px-4 py-8 backdrop-blur-sm"
          onClick={closeWinnerTicket}
        >
          <div
            className="mx-auto max-h-[90vh] w-full max-w-[760px] overflow-y-auto rounded-[28px] border border-stone-900/8 bg-white p-5 shadow-[0_20px_60px_rgba(28,24,20,0.24)] sm:p-6"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-stone-400">
                  Lucky winner ticket
                </p>
                <p className="mt-2 text-lg font-semibold text-stone-950">
                  {selectedWinnerTicketNumber}
                </p>
              </div>
              <Button
                variant="ghost"
                className="h-11 w-11 rounded-[16px] p-0"
                onClick={closeWinnerTicket}
                aria-label="Close winner ticket"
              >
                <FontAwesomeIcon icon={faXmark} className="h-4 w-4" />
              </Button>
            </div>

            {isWinnerTicketLoading ? (
              <div className="mt-6 inline-flex items-center gap-3 rounded-full border border-stone-900/8 bg-stone-50 px-4 py-3 text-sm text-stone-600">
                <FontAwesomeIcon
                  icon={faCircleNotch}
                  className="h-4 w-4 animate-spin text-stone-400"
                />
                Loading winner ticket.
              </div>
            ) : selectedWinnerTicket ? (
              <div className="mt-6">
                <TicketReceiptCard
                  ticket={selectedWinnerTicket}
                  periodName={activePeriod?.name}
                  className="mx-auto max-w-[440px] rounded-[28px] border border-dashed border-stone-300 bg-stone-50 p-5 text-stone-900"
                />
              </div>
            ) : (
              <div className="mt-6 rounded-[22px] border border-dashed border-stone-300 bg-stone-50 px-4 py-4 text-sm text-stone-500">
                Ticket view is not available right now.
              </div>
            )}
          </div>
        </div>
      ) : null}

      {dashboardDrilldownKind ? (
        <div
          className="fixed inset-0 z-50 bg-stone-950/40 px-4 py-6 backdrop-blur-sm"
          onClick={closeDashboardDrilldown}
        >
          <div
            className="mx-auto flex max-h-[92vh] w-full max-w-3xl flex-col rounded-[28px] border border-stone-900/10 bg-white p-5 shadow-[0_24px_80px_rgba(28,24,20,0.24)] sm:p-6"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-stone-400">
                  {dashboardDrilldownKind === "hot"
                    ? "Hot numbers"
                    : dashboardDrilldownKind === "almost"
                      ? "Almost full"
                      : "Full number"}
                </p>
                <h2 className="mt-2 text-2xl font-semibold text-stone-950">
                  {dashboardDrilldownKind === "hot"
                    ? "Hot number list"
                    : dashboardDrilldownKind === "almost"
                      ? "Almost full list"
                      : "Full number list"}
                </h2>
                <p className="mt-2 text-sm text-stone-500">Search by identifier and browse 20 rows per page.</p>
              </div>
              <Button variant="ghost" className="h-10 rounded-[16px] px-3" onClick={closeDashboardDrilldown}>
                Close
              </Button>
            </div>

            <div className="mt-5">
              <Input
                value={dashboardDrilldownSearch}
                onChange={(event) => {
                  setDashboardDrilldownSearch(event.target.value.replace(/\D/g, "").slice(0, 3));
                  setDashboardDrilldownPage(1);
                }}
                placeholder="Search identifier"
              />
            </div>

            <div className="thin-scrollbar mt-5 flex-1 space-y-4 overflow-y-auto pr-1">
              {isDashboardDrilldownLoading ? (
                <p className="text-sm text-stone-500">Loading dashboard list.</p>
              ) : dashboardDrilldownError ? (
                <p className="text-sm text-rose-700">{dashboardDrilldownError}</p>
              ) : dashboardDrilldownKind === "hot" && hotNumberModalData?.results.length ? (
                hotNumberModalData.results.map((item) => (
                  <div key={`${item.identifier}-${item.amount}`} className="grid items-center gap-3 sm:grid-cols-[64px_minmax(0,1.2fr)_104px]">
                    <div className="text-[24px] font-medium text-stone-950">{item.identifier}</div>
                    <div className="h-3 rounded-full bg-stone-100">
                      <div className="h-full rounded-full bg-lime-600" style={{ width: barWidth(item.progress) }} />
                    </div>
                    <div className="text-right text-[15px] text-stone-400">{formatAmount(item.amount)}</div>
                  </div>
                ))
              ) : dashboardDrilldownKind === "almost" && almostFullModalData?.results.length ? (
                almostFullModalData.results.map((item) => (
                  <div key={`${item.identifier}-${item.remaining}`} className="grid items-center gap-3 sm:grid-cols-[64px_minmax(0,1.2fr)_104px]">
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
                ))
              ) : dashboardDrilldownKind === "full" && fullNumberModalData?.results.length ? (
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
                <p className="text-sm text-stone-500">No numbers match this search.</p>
              )}
            </div>

            <div className="mt-5 flex items-center justify-between gap-3 border-t border-stone-900/8 pt-4">
              <p className="text-sm text-stone-500">
                {dashboardDrilldownKind === "hot"
                  ? hotNumberModalData
                    ? `${hotNumberModalData.count} total`
                    : "0 total"
                  : dashboardDrilldownKind === "almost"
                    ? almostFullModalData
                      ? `${almostFullModalData.count} total`
                      : "0 total"
                    : fullNumberModalData
                      ? `${fullNumberModalData.count} total`
                      : "0 total"}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  className="rounded-[16px]"
                  disabled={
                    dashboardDrilldownKind === "hot"
                      ? !hotNumberModalData || hotNumberModalData.page <= 1
                      : dashboardDrilldownKind === "almost"
                        ? !almostFullModalData || almostFullModalData.page <= 1
                        : !fullNumberModalData || fullNumberModalData.page <= 1
                  }
                  onClick={() => setDashboardDrilldownPage((current) => Math.max(1, current - 1))}
                >
                  Previous
                </Button>
                <span className="min-w-[76px] text-center text-sm text-stone-500">
                  Page {dashboardDrilldownKind === "hot"
                    ? hotNumberModalData?.page ?? 1
                    : dashboardDrilldownKind === "almost"
                      ? almostFullModalData?.page ?? 1
                      : fullNumberModalData?.page ?? 1} / {dashboardDrilldownKind === "hot"
                    ? hotNumberModalData?.total_pages ?? 1
                    : dashboardDrilldownKind === "almost"
                      ? almostFullModalData?.total_pages ?? 1
                      : fullNumberModalData?.total_pages ?? 1}
                </span>
                <Button
                  variant="outline"
                  className="rounded-[16px]"
                  disabled={
                    dashboardDrilldownKind === "hot"
                      ? !hotNumberModalData || hotNumberModalData.page >= hotNumberModalData.total_pages
                      : dashboardDrilldownKind === "almost"
                        ? !almostFullModalData || almostFullModalData.page >= almostFullModalData.total_pages
                        : !fullNumberModalData || fullNumberModalData.page >= fullNumberModalData.total_pages
                  }
                  onClick={() =>
                    setDashboardDrilldownPage((current) =>
                      dashboardDrilldownKind === "hot"
                        ? hotNumberModalData
                          ? Math.min(hotNumberModalData.total_pages, current + 1)
                          : current
                        : dashboardDrilldownKind === "almost"
                          ? almostFullModalData
                            ? Math.min(almostFullModalData.total_pages, current + 1)
                            : current
                          : fullNumberModalData
                            ? Math.min(fullNumberModalData.total_pages, current + 1)
                            : current,
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
