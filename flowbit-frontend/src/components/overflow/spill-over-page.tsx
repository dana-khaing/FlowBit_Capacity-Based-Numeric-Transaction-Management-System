"use client";

import { useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowTrendUp,
  faCircleCheck,
  faClock,
  faReceipt,
  faRotateLeft,
  faTriangleExclamation,
} from "@fortawesome/free-solid-svg-icons";
import { AdminActionToast } from "@/components/admin/admin-action-toast";
import { notifyDashboardUpdated } from "@/components/app/workspace-events";
import { AdminConfirmModal } from "@/components/admin/admin-confirm-modal";
import { ActionLoadingModal } from "@/components/app/action-loading-modal";
import { useCurrentUserState } from "@/components/auth/current-user-context";
import { PeriodRequiredPage } from "@/components/period/period-required-page";
import { TicketReceiptCard } from "@/components/tickets/ticket-receipt-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fetchCurrentUser, getStoredUser, type AuthUser } from "@/lib/auth-client";
import {
  fetchIdentifierOptions,
  fetchTicketDetail,
  type FlowBitIdentifierOption,
  type FlowBitTicketDetail,
} from "@/lib/ticket-client";
import {
  approveOverflow,
  createCollaborator,
  createDirectOverkill,
  fetchApprovedOverflowPage,
  fetchCollaborators,
  fetchOverkillOverflowPage,
  fetchPendingOverflowPage,
  resolveOverflowAction,
  updateCollaborator,
  type FlowBitCollaborator,
  type FlowBitOverflow,
} from "@/lib/overflow-client";

type ToastState = {
  type: "success" | "error";
  message: string;
} | null;

type RefundAction = "refund_overflow_only" | "refund_transaction" | "refund_ticket";

type CollaboratorDraft = {
  username: string;
  full_name: string;
  email: string;
  phone_number: string;
};

function formatAmount(value: string | null | undefined) {
  const amount = Number(value || "0");
  if (Number.isNaN(amount)) {
    return value || "0";
  }
  return amount.toLocaleString("en-GB", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

function formatWholeAmount(value: string | null | undefined) {
  const amount = Number(value || "0");
  if (Number.isNaN(amount)) {
    return value || "0";
  }
  return Math.trunc(amount).toLocaleString("en-GB");
}

function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getCollaboratorDisplayName(collaborator: FlowBitCollaborator) {
  const fullName = collaborator.full_name.trim();
  return fullName || collaborator.username;
}

function sanitizeWholeNumberInput(value: string) {
  return value.replace(/[^\d]/g, "");
}

function normalizeIdentifierNumber(value: string) {
  const digits = value.replace(/\D/g, "");
  if (!digits) {
    return "";
  }
  return digits.slice(-3).padStart(3, "0");
}

function getOverflowApprovedAmount(overflow: FlowBitOverflow) {
  return overflow.amount_to_approve || overflow.excess_amount;
}

function getOverflowStatusLabel(status: FlowBitOverflow["status"]) {
  if (status === "TCSO") {
    return "Pending";
  }
  if (status === "CSO") {
    return "Approved";
  }
  if (status === "OVRK") {
    return "Overkill";
  }
  return "Refunded";
}

function getOverflowStatusTone(status: FlowBitOverflow["status"]) {
  if (status === "TCSO") {
    return "bg-amber-100 text-amber-800";
  }
  if (status === "CSO") {
    return "bg-emerald-100 text-emerald-700";
  }
  if (status === "OVRK") {
    return "bg-violet-100 text-violet-800";
  }
  return "bg-stone-200 text-stone-700";
}

function renderOverflowPager(
  page: number,
  totalPages: number,
  onPageChange: (page: number) => void,
) {
  if (totalPages <= 1) {
    return null;
  }

  return (
    <div className="mt-4 flex items-center justify-between gap-3 border-t border-stone-900/8 pt-3">
      <Button
        type="button"
        variant="outline"
        className="rounded-full"
        onClick={() => onPageChange(Math.max(1, page - 1))}
        disabled={page <= 1}
      >
        Previous
      </Button>
      <span className="text-sm font-medium text-stone-600">
        Page {page} of {totalPages}
      </span>
      <Button
        type="button"
        variant="outline"
        className="rounded-full"
        onClick={() => onPageChange(Math.min(totalPages, page + 1))}
        disabled={page >= totalPages}
      >
        Next
      </Button>
    </div>
  );
}

export function SpillOverPage() {
  const currentUserState = useCurrentUserState();
  const [user, setUser] = useState<AuthUser | null>(getStoredUser());
  const [pendingOverflows, setPendingOverflows] = useState<FlowBitOverflow[]>([]);
  const [approvedRowsState, setApprovedRowsState] = useState<FlowBitOverflow[]>([]);
  const [overkillRowsState, setOverkillRowsState] = useState<FlowBitOverflow[]>([]);
  const [pendingPage, setPendingPage] = useState(1);
  const [approvedPage, setApprovedPage] = useState(1);
  const [overkillPage, setOverkillPage] = useState(1);
  const [pendingTotalPages, setPendingTotalPages] = useState(1);
  const [approvedTotalPages, setApprovedTotalPages] = useState(1);
  const [overkillTotalPages, setOverkillTotalPages] = useState(1);
  const [pendingCount, setPendingCount] = useState(0);
  const [approvedCount, setApprovedCount] = useState(0);
  const [overkillCount, setOverkillCount] = useState(0);
  const [pendingAmountTotal, setPendingAmountTotal] = useState("0.00");
  const [approvedAmountTotal, setApprovedAmountTotal] = useState("0.00");
  const [overkillAmountTotal, setOverkillAmountTotal] = useState("0.00");
  const [collaborators, setCollaborators] = useState<FlowBitCollaborator[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState>(null);
  const [activeTab, setActiveTab] = useState<"pending" | "approved" | "overkill">("pending");
  const [searchQuery, setSearchQuery] = useState("");
  const [collaboratorFilter, setCollaboratorFilter] = useState("all");
  const [approveTarget, setApproveTarget] = useState<FlowBitOverflow | null>(null);
  const [approveAmount, setApproveAmount] = useState("");
  const [selectedCollaboratorIds, setSelectedCollaboratorIds] = useState<number[]>([]);
  const [editingCollaboratorId, setEditingCollaboratorId] = useState<number | null>(null);
  const [collaboratorDraft, setCollaboratorDraft] = useState<CollaboratorDraft>({
    username: "",
    full_name: "",
    email: "",
    phone_number: "",
  });
  const [refundTarget, setRefundTarget] = useState<{
    overflow: FlowBitOverflow;
    action: RefundAction;
  } | null>(null);
  const [pendingExtraApproval, setPendingExtraApproval] = useState<{
    overflowAmount: number;
    approveAmount: number;
    identifierNumber: string;
  } | null>(null);
  const [refundPickerTarget, setRefundPickerTarget] = useState<FlowBitOverflow | null>(null);
  const [overrideCode, setOverrideCode] = useState("");
  const [syncRepeatTicketRefund, setSyncRepeatTicketRefund] = useState(false);
  const [busyLabel, setBusyLabel] = useState<string | null>(null);
  const [selectedTicketDetail, setSelectedTicketDetail] = useState<FlowBitTicketDetail | null>(null);
  const [isTicketViewLoading, setIsTicketViewLoading] = useState(false);
  const [identifierOptions, setIdentifierOptions] = useState<FlowBitIdentifierOption[]>([]);
  const [overkillIdentifierNumber, setOverkillIdentifierNumber] = useState("");
  const [overkillDraftAmount, setOverkillDraftAmount] = useState("");
  const [overkillCollaboratorId, setOverkillCollaboratorId] = useState("");
  const [isOverkillFormOpen, setIsOverkillFormOpen] = useState(false);
  const [isCollaboratorModalOpen, setIsCollaboratorModalOpen] = useState(false);
  const [selectedCollaborator, setSelectedCollaborator] = useState<FlowBitCollaborator | null>(null);
  const [pendingOverkillConfirmation, setPendingOverkillConfirmation] = useState<{
    identifierNumber: string;
    amount: string;
    collaboratorName: string;
  } | null>(null);

  const effectiveUserRole = currentUserState?.user?.role ?? user?.role ?? "";
  const requiresOverride = true;

  useEffect(() => {
    setUser(getStoredUser());
    fetchCurrentUser().then(setUser).catch(() => {
      // Session guard handles invalid sessions.
    });
  }, []);

  async function loadPageData() {
    setIsLoading(true);
    try {
      const [nextPending, nextApproved, nextOverkill, nextCollaborators, nextUser, nextIdentifiers] = await Promise.all([
        fetchPendingOverflowPage({
          page: pendingPage,
          pageSize: 20,
          search: searchQuery.trim(),
        }),
        fetchApprovedOverflowPage({
          page: approvedPage,
          pageSize: 20,
          search: searchQuery.trim(),
          collaboratorName: collaboratorFilter === "all" ? "" : collaboratorFilter,
        }),
        fetchOverkillOverflowPage({
          page: overkillPage,
          pageSize: 20,
          search: searchQuery.trim(),
          collaboratorName: collaboratorFilter === "all" ? "" : collaboratorFilter,
        }),
        fetchCollaborators(),
        fetchCurrentUser(),
        fetchIdentifierOptions(),
      ]);
      setPendingOverflows(nextPending.results);
      setApprovedRowsState(nextApproved.results);
      setOverkillRowsState(nextOverkill.results);
      setPendingTotalPages(nextPending.total_pages);
      setApprovedTotalPages(nextApproved.total_pages);
      setOverkillTotalPages(nextOverkill.total_pages);
      setPendingCount(nextPending.count);
      setApprovedCount(nextApproved.count);
      setOverkillCount(nextOverkill.count);
      setPendingAmountTotal(nextPending.summary.total_amount);
      setApprovedAmountTotal(nextApproved.summary.total_amount);
      setOverkillAmountTotal(nextOverkill.summary.total_amount);
      setCollaborators(nextCollaborators);
      setUser(nextUser);
      setIdentifierOptions(nextIdentifiers);
      setPageError(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Request failed.";
      setPageError(message);
      setToast({ type: "error", message });
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadPageData();
  }, [approvedPage, collaboratorFilter, overkillPage, pendingPage, searchQuery]);

  const collaboratorFilterOptions = useMemo(() => {
    return collaborators
      .map((collaborator) => getCollaboratorDisplayName(collaborator).trim())
      .filter(Boolean)
      .sort((left, right) => left.localeCompare(right));
  }, [collaborators]);

  useEffect(() => {
    setPendingPage(1);
    setApprovedPage(1);
    setOverkillPage(1);
  }, [searchQuery, collaboratorFilter]);

  const approvedRows = approvedRowsState;
  const overkillRows = overkillRowsState;

  const visibleOverflows =
    activeTab === "pending"
      ? pendingOverflows
      : activeTab === "approved"
        ? approvedRows
        : overkillRows;

  const activePage = activeTab === "pending" ? pendingPage : activeTab === "approved" ? approvedPage : overkillPage;
  const activeTotalPages =
    activeTab === "pending" ? pendingTotalPages : activeTab === "approved" ? approvedTotalPages : overkillTotalPages;

  const identifierOptionsList = useMemo(
    () => identifierOptions.map((identifier) => identifier.number),
    [identifierOptions],
  );

  function openApproveModal(overflow: FlowBitOverflow) {
    setApproveTarget(overflow);
    setApproveAmount(formatWholeAmount(overflow.amount_to_approve || overflow.excess_amount || ""));
    const initialCollaboratorId = overflow.collaborators[0];
    setSelectedCollaboratorIds(initialCollaboratorId ? [initialCollaboratorId] : []);
    setEditingCollaboratorId(null);
    setCollaboratorDraft({
      username: "",
      full_name: "",
      email: "",
      phone_number: "",
    });
  }

  function selectCollaborator(collaboratorId: number) {
    setSelectedCollaboratorIds([collaboratorId]);
  }

  function openCollaboratorEditor(collaborator: FlowBitCollaborator) {
    setEditingCollaboratorId(collaborator.id);
    setCollaboratorDraft({
      username: collaborator.username,
      full_name: collaborator.full_name,
      email: collaborator.email,
      phone_number: collaborator.phone_number,
    });
  }

  function resetCollaboratorDraft() {
    setEditingCollaboratorId(null);
    setCollaboratorDraft({
      username: "",
      full_name: "",
      email: "",
      phone_number: "",
    });
  }

  async function handleApproveOverflow() {
    if (!approveTarget) {
      return;
    }

    const overflowAmount = Number(approveTarget.excess_amount || "0");
    const nextApproveAmount = Number(approveAmount.trim() || overflowAmount);
    if (nextApproveAmount > overflowAmount) {
      setPendingExtraApproval({
        overflowAmount,
        approveAmount: nextApproveAmount,
        identifierNumber: approveTarget.identifier_number,
      });
      return;
    }

    await submitApproveOverflow();
  }

  async function handleCreateOverkill() {
    const normalizedIdentifier = normalizeIdentifierNumber(overkillIdentifierNumber);
    const matchedIdentifier = identifierOptions.find(
      (identifier) => identifier.number === normalizedIdentifier,
    );
    if (!matchedIdentifier) {
      setToast({ type: "error", message: "Choose a valid identifier." });
      return;
    }

    if (!overkillDraftAmount.trim() || Number(overkillDraftAmount) <= 0) {
      setToast({ type: "error", message: "Enter an overkill amount greater than zero." });
      return;
    }

    const collaboratorId = Number(overkillCollaboratorId);
    if (!collaboratorId) {
      setToast({ type: "error", message: "Choose one collaborator." });
      return;
    }

    const collaborator = collaborators.find((item) => item.id === collaboratorId);
    setPendingOverkillConfirmation({
      identifierNumber: normalizedIdentifier,
      amount: overkillDraftAmount.trim(),
      collaboratorName: collaborator?.full_name || collaborator?.username || "-",
    });
  }

  function resetOverkillDraft() {
    setOverkillIdentifierNumber("");
    setOverkillDraftAmount("");
    setOverkillCollaboratorId("");
    setPendingOverkillConfirmation(null);
    setIsOverkillFormOpen(false);
  }

  async function submitCreateOverkill() {
    const normalizedIdentifier = normalizeIdentifierNumber(overkillIdentifierNumber);
    const matchedIdentifier = identifierOptions.find(
      (identifier) => identifier.number === normalizedIdentifier,
    );
    if (!matchedIdentifier) {
      setPendingOverkillConfirmation(null);
      setToast({ type: "error", message: "Choose a valid identifier." });
      return;
    }

    const collaboratorId = Number(overkillCollaboratorId);
    if (!collaboratorId) {
      setPendingOverkillConfirmation(null);
      setToast({ type: "error", message: "Choose one collaborator." });
      return;
    }

    setBusyLabel("Creating overkill");
    try {
      const response = await createDirectOverkill({
        identifier: matchedIdentifier.id,
        amount: overkillDraftAmount.trim(),
        collaboratorIds: [collaboratorId],
      });
      setToast({ type: "success", message: response.message });
      resetOverkillDraft();
      await loadPageData();
      notifyDashboardUpdated();
      setActiveTab("overkill");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Request failed.";
      setToast({ type: "error", message });
    } finally {
      setBusyLabel(null);
    }
  }

  async function submitApproveOverflow() {
    if (!approveTarget) {
      return;
    }

    setBusyLabel("Approving spill over");
    try {
      const response = await approveOverflow({
        overflowId: approveTarget.id,
        amountToApprove: approveAmount.trim() || undefined,
        collaboratorIds: selectedCollaboratorIds,
      });
      setToast({ type: "success", message: response.message });
      setApproveTarget(null);
      setPendingExtraApproval(null);
      await loadPageData();
      notifyDashboardUpdated();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Request failed.";
      setToast({ type: "error", message });
    } finally {
      setBusyLabel(null);
    }
  }

  async function handleCreateCollaborator() {
    setBusyLabel(editingCollaboratorId ? "Updating collaborator" : "Creating collaborator");
    try {
      const payload = {
        username: collaboratorDraft.username.trim(),
        full_name: collaboratorDraft.full_name.trim(),
        email: collaboratorDraft.email.trim(),
        phone_number: collaboratorDraft.phone_number.trim(),
      };
      const collaborator = editingCollaboratorId
        ? await updateCollaborator(editingCollaboratorId, payload)
        : await createCollaborator(payload);
      setCollaborators((current) =>
        (editingCollaboratorId
          ? current.map((item) => (item.id === collaborator.id ? collaborator : item))
          : [...current, collaborator]
        ).sort((left, right) => left.username.localeCompare(right.username)),
      );
      setSelectedCollaboratorIds([collaborator.id]);
      resetCollaboratorDraft();
      setToast({
        type: "success",
        message: editingCollaboratorId
          ? `Collaborator '${collaborator.username}' updated.`
          : `Collaborator '${collaborator.username}' created.`,
      });
      if (!approveTarget) {
        setIsCollaboratorModalOpen(false);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Request failed.";
      setToast({ type: "error", message });
    } finally {
      setBusyLabel(null);
    }
  }

  async function handleRefundAction() {
    if (!refundTarget) {
      return;
    }

    setBusyLabel("Processing refund");
    try {
      const response = await resolveOverflowAction({
        overflowId: refundTarget.overflow.id,
        action: refundTarget.action,
        adminOverrideCode: requiresOverride ? overrideCode : undefined,
        syncRepeatTicket: syncRepeatTicketRefund,
      });
      setToast({ type: "success", message: response.message });
      setRefundTarget(null);
      setOverrideCode("");
      setSyncRepeatTicketRefund(false);
      await loadPageData();
      notifyDashboardUpdated();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Request failed.";
      setToast({ type: "error", message });
    } finally {
      setBusyLabel(null);
    }
  }

  async function openTicketView(ticketNumber: string | null) {
    if (!ticketNumber) {
      return;
    }
    setIsTicketViewLoading(true);
    try {
      const detail = await fetchTicketDetail(ticketNumber);
      setSelectedTicketDetail(detail);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Request failed.";
      setToast({ type: "error", message });
    } finally {
      setIsTicketViewLoading(false);
    }
  }

  function openStandaloneCollaboratorModal() {
    resetCollaboratorDraft();
    setIsCollaboratorModalOpen(true);
  }

  function openCollaboratorDetail(collaborator: FlowBitCollaborator) {
    setSelectedCollaborator(collaborator);
  }

  function openCollaboratorEditModal(collaborator: FlowBitCollaborator) {
    openCollaboratorEditor(collaborator);
    setSelectedCollaborator(null);
    setIsCollaboratorModalOpen(true);
  }

  return (
    <>
      <PeriodRequiredPage
        eyebrow="Spill over"
        title="Spill-over review"
        description="Review pending, approved, and overkill spill-over items and move quickly into follow-up actions."
        showDefaultAside={false}
      >
        {isLoading ? (
          <div className="rounded-[24px] border border-dashed border-stone-300 bg-stone-50 px-5 py-10 text-sm text-stone-500">
            Loading spill-over queues.
          </div>
        ) : pageError ? (
          <div className="rounded-[24px] border border-rose-200 bg-rose-50 px-5 py-5 text-sm text-rose-700">
            {pageError}
          </div>
        ) : (
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px] xl:items-start">
            <div className="space-y-5 xl:flex xl:h-[calc(100vh-12rem)] xl:min-h-0 xl:flex-col xl:overflow-hidden">
              <div className="flex flex-wrap items-center gap-3 rounded-[22px] border border-stone-900/8 bg-stone-50 px-4 py-3">
                <div className="inline-flex rounded-[18px] border border-stone-900/8 bg-white p-1">
                  {[
                    { label: `Pending ${pendingCount}`, value: "pending" },
                    { label: `Approved ${approvedCount}`, value: "approved" },
                    { label: `Overkill ${overkillCount}`, value: "overkill" },
                  ].map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setActiveTab(option.value as "pending" | "approved" | "overkill")}
                      className={`rounded-[14px] px-4 py-2 text-sm font-medium transition ${
                        activeTab === option.value
                          ? "bg-stone-950 text-white"
                          : "text-stone-600 hover:bg-stone-100"
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                <Input
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search by identifier, ticket, order, customer, or collaborator"
                  className="min-w-[260px] flex-1"
                />
                {activeTab !== "pending" ? (
                  <select
                    value={collaboratorFilter}
                    onChange={(event) => setCollaboratorFilter(event.target.value)}
                    className="h-11 min-w-[220px] rounded-[18px] border border-stone-900/8 bg-white px-4 text-sm font-medium text-stone-700 outline-none transition focus:border-stone-950"
                  >
                    <option value="all">All collaborators</option>
                    {collaboratorFilterOptions.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                ) : null}
              </div>

              {activeTab === "overkill" ? (
                <div className="flex justify-end">
                  <Button
                    className="h-11 rounded-[18px] bg-stone-950 px-5 shadow-[0_10px_24px_rgba(24,24,24,0.14)] transition hover:-translate-y-0.5 hover:bg-stone-900"
                    onClick={() => setIsOverkillFormOpen(true)}
                  >
                    Add
                  </Button>
                </div>
              ) : null}

              <div className="xl:min-h-0 xl:flex-1 xl:overflow-y-auto xl:pr-1">
                {visibleOverflows.length === 0 ? (
                  <div className="rounded-[24px] border border-dashed border-stone-300 bg-stone-50 px-5 py-10 text-sm text-stone-500">
                    No spill-over items match this view.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {visibleOverflows.map((overflow) => (
                      <div
                        key={overflow.id}
                        className="rounded-[24px] border border-stone-900/8 bg-white px-5 py-4 shadow-[0_8px_24px_rgba(28,24,20,0.04)]"
                      >
                      <div className="flex flex-wrap items-center gap-3 xl:flex-nowrap">
                        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
                          <p className="text-xl font-semibold text-stone-950">
                            {overflow.identifier_number}
                          </p>
                          <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] ${getOverflowStatusTone(overflow.status)}`}>
                            {getOverflowStatusLabel(overflow.status)}
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-3 xl:justify-end">
                          <p className="mr-2 text-base font-semibold text-stone-700">
                            Amount:{" "}
                            <span className="text-stone-950">
                              {formatAmount(
                                overflow.status === "TCSO"
                                  ? overflow.excess_amount
                                  : getOverflowApprovedAmount(overflow),
                              )}
                            </span>
                          </p>
                          {overflow.ticket_number ? (
                            <Button
                              variant="outline"
                              className="h-11 min-w-[124px] rounded-[18px] border-stone-200 bg-white shadow-[0_8px_20px_rgba(24,24,24,0.06)] transition hover:-translate-y-0.5 hover:bg-stone-50"
                              onClick={() => openTicketView(overflow.ticket_number)}
                            >
                              <FontAwesomeIcon icon={faReceipt} className="h-3.5 w-3.5" />
                              Ticket
                            </Button>
                          ) : null}
                          {overflow.status === "TCSO" ? (
                            <Button
                              className="h-11 min-w-[124px] rounded-[18px] bg-stone-950 shadow-[0_10px_24px_rgba(24,24,24,0.14)] transition hover:-translate-y-0.5 hover:bg-stone-900"
                              onClick={() => openApproveModal(overflow)}
                            >
                              <FontAwesomeIcon icon={faCircleCheck} className="h-3.5 w-3.5" />
                              Approve
                            </Button>
                          ) : null}
                          <Button
                            variant="outline"
                            className="h-11 min-w-[124px] rounded-[18px] border-stone-200 bg-white shadow-[0_8px_20px_rgba(24,24,24,0.06)] transition hover:-translate-y-0.5 hover:bg-stone-50"
                            onClick={() => setRefundPickerTarget(overflow)}
                          >
                            <FontAwesomeIcon icon={faRotateLeft} className="h-3.5 w-3.5" />
                            Refund
                          </Button>
                        </div>
                      </div>

                      {overflow.status !== "TCSO" ? (
                        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-stone-900/8 pt-3 text-sm">
                          <p className="text-stone-500">
                            Approved at:{" "}
                            <span className="font-medium text-stone-900">
                              {formatDateTime(overflow.approved_at)}
                            </span>
                          </p>
                          <p className="text-stone-500">
                            Collaborators:{" "}
                            <span className="font-medium text-stone-900">
                              {overflow.collaborator_names.length ? overflow.collaborator_names.join(", ") : "-"}
                            </span>
                          </p>
                        </div>
                      ) : null}
                      </div>
                    ))}
                  </div>
                )}
                {renderOverflowPager(
                  activePage,
                  activeTotalPages,
                  activeTab === "pending"
                    ? setPendingPage
                    : activeTab === "approved"
                      ? setApprovedPage
                      : setOverkillPage,
                )}
              </div>
            </div>

            <aside className="space-y-3 rounded-[28px] border border-stone-900/8 bg-[#f3f0ea] p-4 shadow-[0_8px_24px_rgba(28,24,20,0.03)] sm:p-5 xl:sticky xl:top-24 xl:max-h-[calc(100vh-12rem)] xl:overflow-y-auto">
              <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-stone-400">Queue summary</p>
              <div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-1">
                <div className="rounded-[20px] bg-white px-3.5 py-3">
                  <div className="flex items-center gap-2 text-stone-500">
                    <FontAwesomeIcon icon={faTriangleExclamation} className="h-4 w-4 text-amber-600" />
                    <p className="text-xs font-semibold uppercase tracking-[0.14em]">Pending</p>
                  </div>
                  <div className="mt-2 flex items-end justify-between gap-3">
                    <p className="text-xl font-semibold text-stone-950">{pendingCount}</p>
                    <p className="text-sm text-stone-500">{formatAmount(pendingAmountTotal)}</p>
                  </div>
                </div>
                <div className="rounded-[20px] bg-white px-3.5 py-3">
                  <div className="flex items-center gap-2 text-stone-500">
                    <FontAwesomeIcon icon={faArrowTrendUp} className="h-4 w-4 text-emerald-600" />
                    <p className="text-xs font-semibold uppercase tracking-[0.14em]">Approved</p>
                  </div>
                  <div className="mt-2 flex items-end justify-between gap-3">
                    <p className="text-xl font-semibold text-stone-950">{approvedCount}</p>
                    <p className="text-sm text-stone-500">{formatAmount(approvedAmountTotal)}</p>
                  </div>
                </div>
                <div className="rounded-[20px] bg-white px-3.5 py-3">
                  <div className="flex items-center gap-2 text-stone-500">
                    <FontAwesomeIcon icon={faArrowTrendUp} className="h-4 w-4 text-violet-600" />
                    <p className="text-xs font-semibold uppercase tracking-[0.14em]">Overkill</p>
                  </div>
                  <div className="mt-2 flex items-end justify-between gap-3">
                    <p className="text-xl font-semibold text-stone-950">{overkillCount}</p>
                    <p className="text-sm text-stone-500">{formatAmount(overkillAmountTotal)}</p>
                  </div>
                </div>
              </div>
              <div className="rounded-[20px] bg-white px-3.5 py-3">
                <div className="flex items-center gap-2 text-stone-500">
                  <FontAwesomeIcon icon={faClock} className="h-4 w-4 text-stone-400" />
                  <p className="text-xs font-semibold uppercase tracking-[0.14em]">Current view</p>
                </div>
                <p className="mt-2 text-base font-semibold text-stone-950">
                  {activeTab === "pending"
                    ? "Pending TCSO queue"
                    : activeTab === "approved"
                      ? "Approved CSO queue"
                      : "Overkill queue"}
                </p>
              </div>
              <div className="rounded-[20px] bg-white px-3.5 py-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">Collaborators</p>
                  <Button
                    variant="outline"
                    className="h-9 rounded-[16px] border-stone-200 bg-stone-50 px-3 shadow-[0_8px_20px_rgba(24,24,24,0.04)] transition hover:-translate-y-0.5 hover:bg-white"
                    onClick={openStandaloneCollaboratorModal}
                  >
                    Add
                  </Button>
                </div>
                <div className="mt-3 space-y-2">
                  {collaborators.length ? (
                    collaborators.map((collaborator) => (
                      <button
                        type="button"
                        key={collaborator.id}
                        onClick={() => openCollaboratorDetail(collaborator)}
                        className="w-full rounded-[16px] border border-stone-900/8 bg-stone-50 px-3 py-2 text-left transition hover:border-stone-300 hover:bg-white"
                      >
                        <p className="text-sm font-semibold text-stone-900">
                          {getCollaboratorDisplayName(collaborator)}
                        </p>
                      </button>
                    ))
                  ) : (
                    <div className="rounded-[16px] border border-dashed border-stone-300 bg-stone-50 px-3 py-3 text-sm text-stone-500">
                      No collaborators yet.
                    </div>
                  )}
                </div>
              </div>
            </aside>
          </div>
        )}
      </PeriodRequiredPage>

      {approveTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/30 px-4" onClick={() => setApproveTarget(null)}>
          <div
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-[28px] border border-stone-900/8 bg-white p-5 shadow-[0_18px_48px_rgba(24,24,24,0.18)] sm:p-6"
            onClick={(event) => event.stopPropagation()}
          >
            <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-stone-500">Approve spill over</p>
            <h2 className="mt-2 text-2xl font-semibold text-stone-950">{approveTarget.identifier_number}</h2>
            <p className="mt-2 text-sm leading-6 text-stone-500">
              Confirm how much should be approved and choose the collaborator who will approve this spill-over.
            </p>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="space-y-2">
                <span className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Overflow amount</span>
                <Input value={formatWholeAmount(approveTarget.excess_amount)} disabled />
              </label>
              <label className="space-y-2">
                <span className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Amount to approve</span>
                <Input
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={approveAmount}
                  onChange={(event) => setApproveAmount(sanitizeWholeNumberInput(event.target.value))}
                  placeholder={formatAmount(approveTarget.excess_amount)}
                />
              </label>
            </div>

            <div className="mt-5 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-400">Approving collaborator</p>
              {collaborators.length === 0 ? (
                <div className="rounded-[22px] border border-dashed border-stone-300 bg-stone-50 px-4 py-4 text-sm text-stone-500">
                  No collaborators available yet.
                </div>
              ) : (
                <div className="space-y-3">
                  {collaborators.map((collaborator) => {
                    const label = collaborator.full_name.trim() || collaborator.username;
                    const isSelected = selectedCollaboratorIds.includes(collaborator.id);
                    return (
                      <div
                        key={collaborator.id}
                        onClick={() => selectCollaborator(collaborator.id)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            selectCollaborator(collaborator.id);
                          }
                        }}
                        role="button"
                        tabIndex={0}
                        className={`flex w-full items-start gap-3 rounded-[22px] border px-4 py-4 text-left transition ${
                          isSelected
                            ? "border-stone-950 bg-stone-100"
                            : "border-stone-900/8 bg-stone-50 hover:border-stone-300 hover:bg-white"
                        }`}
                      >
                        <span
                          className={`mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-full border transition ${
                            isSelected
                              ? "border-stone-950"
                              : "border-stone-300 bg-white"
                          }`}
                          aria-hidden="true"
                        >
                          <span
                            className={`h-2.5 w-2.5 rounded-full transition ${
                              isSelected ? "bg-stone-950" : "bg-transparent"
                            }`}
                          />
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-stone-900">{label}</p>
                          <p className="mt-1 text-sm text-stone-500">{collaborator.email || collaborator.phone_number || collaborator.username}</p>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          className="ml-auto h-9 rounded-[14px] px-3 text-sm"
                          onClick={(event) => {
                            event.stopPropagation();
                            openCollaboratorEditor(collaborator);
                          }}
                        >
                          Edit
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="mt-5 rounded-[22px] border border-stone-900/8 bg-stone-50 px-4 py-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-400">
                  {editingCollaboratorId ? "Edit collaborator" : "Create collaborator"}
                </p>
                {editingCollaboratorId ? (
                  <Button variant="ghost" className="h-8 rounded-[14px] px-3 text-xs" onClick={resetCollaboratorDraft}>
                    Cancel edit
                  </Button>
                ) : null}
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Input
                  value={collaboratorDraft.full_name}
                  onChange={(event) =>
                    setCollaboratorDraft((current) => ({ ...current, full_name: event.target.value }))
                  }
                  placeholder="Full name"
                />
                <Input
                  value={collaboratorDraft.username}
                  onChange={(event) =>
                    setCollaboratorDraft((current) => ({ ...current, username: event.target.value }))
                  }
                  placeholder="Username"
                />
                <Input
                  value={collaboratorDraft.email}
                  onChange={(event) =>
                    setCollaboratorDraft((current) => ({ ...current, email: event.target.value }))
                  }
                  placeholder="Email"
                />
                <Input
                  value={collaboratorDraft.phone_number}
                  onChange={(event) =>
                    setCollaboratorDraft((current) => ({ ...current, phone_number: event.target.value }))
                  }
                  placeholder="Phone number"
                />
              </div>
              <div className="mt-3 flex justify-end">
                <Button
                  variant="outline"
                  onClick={handleCreateCollaborator}
                  disabled={
                    Boolean(busyLabel) ||
                    !collaboratorDraft.username.trim() ||
                    !collaboratorDraft.full_name.trim() ||
                    !collaboratorDraft.email.trim() ||
                    !collaboratorDraft.phone_number.trim()
                  }
                >
                  {editingCollaboratorId ? "Save collaborator" : "Create collaborator"}
                </Button>
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-3">
              <Button variant="outline" onClick={() => setApproveTarget(null)} disabled={Boolean(busyLabel)}>
                Cancel
              </Button>
              <Button onClick={handleApproveOverflow} disabled={Boolean(busyLabel)}>
                Approve
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <AdminConfirmModal
        open={Boolean(pendingExtraApproval)}
        title="Confirm extra approval"
        description={
          pendingExtraApproval
            ? `${pendingExtraApproval.identifierNumber} overflow is ${formatWholeAmount(String(pendingExtraApproval.overflowAmount))}.\nYou are approving ${formatWholeAmount(String(pendingExtraApproval.approveAmount))}, so the extra ${formatWholeAmount(String(pendingExtraApproval.approveAmount - pendingExtraApproval.overflowAmount))} will become reserve capacity.`
            : ""
        }
        confirmLabel="Approve extra amount"
        showCodeInput={false}
        busy={Boolean(busyLabel)}
        onCodeChange={() => {}}
        onCancel={() => setPendingExtraApproval(null)}
        onConfirm={submitApproveOverflow}
      />

      <AdminConfirmModal
        open={Boolean(refundTarget)}
        title="Confirm spill-over refund"
        description={
          refundTarget
            ? `${refundTarget.overflow.identifier_number}${refundTarget.overflow.order_number ? ` · ${refundTarget.overflow.order_number}` : ""}\nRefund ${refundTarget.action.replaceAll("_", " ")} for ${formatAmount(
                refundTarget.action === "refund_overflow_only"
                  ? refundTarget.overflow.excess_amount
                  : refundTarget.overflow.amount_to_approve || refundTarget.overflow.excess_amount,
              )}.`
            : ""
        }
        confirmLabel="Confirm refund"
        codeValue={overrideCode}
        showCodeInput={requiresOverride}
        busy={Boolean(busyLabel)}
        onCodeChange={setOverrideCode}
        onCancel={() => {
          setRefundTarget(null);
          setOverrideCode("");
          setSyncRepeatTicketRefund(false);
        }}
        onConfirm={handleRefundAction}
      >
        {refundTarget?.overflow.repeat_ticket_id ? (
          <label className="mt-4 flex items-start gap-3 rounded-[20px] border border-stone-900/8 bg-stone-50 px-4 py-3 text-sm text-stone-600">
            <input
              type="checkbox"
              checked={syncRepeatTicketRefund}
              onChange={(event) => setSyncRepeatTicketRefund(event.target.checked)}
              disabled={Boolean(busyLabel)}
              className="mt-1 h-4 w-4 rounded border-stone-300"
            />
            <span>Also update the linked repeat ticket template.</span>
          </label>
        ) : null}
      </AdminConfirmModal>
      {selectedCollaborator ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/30 px-4"
          onClick={() => setSelectedCollaborator(null)}
        >
          <div
            className="w-full max-w-xl rounded-[28px] border border-stone-900/8 bg-white p-5 shadow-[0_18px_48px_rgba(24,24,24,0.18)] sm:p-6"
            onClick={(event) => event.stopPropagation()}
          >
            <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-stone-500">Collaborator detail</p>
            <h2 className="mt-2 text-2xl font-semibold text-stone-950">
              {getCollaboratorDisplayName(selectedCollaborator)}
            </h2>
            <div className="mt-5 space-y-3 rounded-[22px] border border-stone-900/8 bg-stone-50 px-4 py-4 text-sm">
              <p className="text-stone-500">
                Username: <span className="font-medium text-stone-900">{selectedCollaborator.username}</span>
              </p>
              <p className="text-stone-500">
                Email: <span className="font-medium text-stone-900">{selectedCollaborator.email}</span>
              </p>
              <p className="text-stone-500">
                Phone: <span className="font-medium text-stone-900">{selectedCollaborator.phone_number}</span>
              </p>
            </div>

            <div className="mt-5 flex justify-end gap-3">
              <Button variant="outline" onClick={() => setSelectedCollaborator(null)}>
                Close
              </Button>
              <Button onClick={() => openCollaboratorEditModal(selectedCollaborator)}>
                Edit
              </Button>
            </div>
          </div>
        </div>
      ) : null}
      {isCollaboratorModalOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/30 px-4"
          onClick={() => setIsCollaboratorModalOpen(false)}
        >
          <div
            className="w-full max-w-xl rounded-[28px] border border-stone-900/8 bg-white p-5 shadow-[0_18px_48px_rgba(24,24,24,0.18)] sm:p-6"
            onClick={(event) => event.stopPropagation()}
          >
            <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-stone-500">
              {editingCollaboratorId ? "Edit collaborator" : "Create collaborator"}
            </p>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <label className="space-y-2">
                <span className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Username</span>
                <Input
                  value={collaboratorDraft.username}
                  onChange={(event) =>
                    setCollaboratorDraft((current) => ({ ...current, username: event.target.value }))
                  }
                  placeholder="Username"
                />
              </label>
              <label className="space-y-2">
                <span className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Full name</span>
                <Input
                  value={collaboratorDraft.full_name}
                  onChange={(event) =>
                    setCollaboratorDraft((current) => ({ ...current, full_name: event.target.value }))
                  }
                  placeholder="Full name"
                />
              </label>
              <label className="space-y-2">
                <span className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Email</span>
                <Input
                  value={collaboratorDraft.email}
                  onChange={(event) =>
                    setCollaboratorDraft((current) => ({ ...current, email: event.target.value }))
                  }
                  placeholder="Email"
                />
              </label>
              <label className="space-y-2">
                <span className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Phone number</span>
                <Input
                  value={collaboratorDraft.phone_number}
                  onChange={(event) =>
                    setCollaboratorDraft((current) => ({ ...current, phone_number: event.target.value }))
                  }
                  placeholder="Phone number"
                />
              </label>
            </div>

            <div className="mt-5 flex justify-end gap-3">
              <Button variant="outline" onClick={() => setIsCollaboratorModalOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleCreateCollaborator}
                disabled={
                  Boolean(busyLabel) ||
                  !collaboratorDraft.username.trim() ||
                  !collaboratorDraft.full_name.trim() ||
                  !collaboratorDraft.email.trim() ||
                  !collaboratorDraft.phone_number.trim()
                }
              >
                {editingCollaboratorId ? "Save" : "Create"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
      <AdminConfirmModal
        open={Boolean(pendingOverkillConfirmation)}
        title="Confirm overkill"
        description={
          pendingOverkillConfirmation
            ? `${pendingOverkillConfirmation.identifierNumber}\nAmount ${formatWholeAmount(pendingOverkillConfirmation.amount)}\nCollaborator ${pendingOverkillConfirmation.collaboratorName}`
            : ""
        }
        confirmLabel="Create overkill"
        showCodeInput={false}
        busy={Boolean(busyLabel)}
        onCodeChange={() => {}}
        onCancel={() => setPendingOverkillConfirmation(null)}
        onConfirm={submitCreateOverkill}
      />
      {isOverkillFormOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/30 px-4"
          onClick={resetOverkillDraft}
        >
          <div
            className="w-full max-w-2xl rounded-[28px] border border-stone-900/8 bg-white p-5 shadow-[0_18px_48px_rgba(24,24,24,0.18)] sm:p-6"
            onClick={(event) => event.stopPropagation()}
          >
            <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-stone-500">Add overkill</p>
            <div className="mt-5 grid gap-4 sm:grid-cols-3">
              <label className="space-y-2">
                <span className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Identifier</span>
                <Input
                  list="overkill-identifier-options"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={overkillIdentifierNumber}
                  onChange={(event) => setOverkillIdentifierNumber(sanitizeWholeNumberInput(event.target.value).slice(0, 3))}
                  placeholder="000"
                />
                <datalist id="overkill-identifier-options">
                  {identifierOptionsList.map((identifierNumber) => (
                    <option key={identifierNumber} value={identifierNumber} />
                  ))}
                </datalist>
              </label>

              <label className="space-y-2">
                <span className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Amount</span>
                <Input
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={overkillDraftAmount}
                  onChange={(event) => setOverkillDraftAmount(sanitizeWholeNumberInput(event.target.value))}
                  placeholder="Enter amount"
                />
              </label>

              <label className="space-y-2">
                <span className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Collaborator</span>
                <select
                  value={overkillCollaboratorId}
                  onChange={(event) => setOverkillCollaboratorId(event.target.value)}
                  className="h-11 w-full rounded-[18px] border border-stone-900/8 bg-white px-4 text-sm font-medium text-stone-700 outline-none transition focus:border-stone-950"
                >
                  <option value="">Choose collaborator</option>
                  {collaborators.map((collaborator) => (
                    <option key={collaborator.id} value={String(collaborator.id)}>
                      {getCollaboratorDisplayName(collaborator)}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="mt-5 flex justify-end gap-3">
              <Button variant="outline" onClick={resetOverkillDraft}>
                Cancel
              </Button>
              <Button onClick={handleCreateOverkill}>
                Add
              </Button>
            </div>
          </div>
        </div>
      ) : null}
      {refundPickerTarget ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/30 px-4"
          onClick={() => setRefundPickerTarget(null)}
        >
          <div
            className="w-full max-w-xl rounded-[28px] border border-stone-900/8 bg-white p-5 shadow-[0_18px_48px_rgba(24,24,24,0.18)] sm:p-6"
            onClick={(event) => event.stopPropagation()}
          >
            <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-stone-500">Refund options</p>
            <h2 className="mt-2 text-2xl font-semibold text-stone-950">{refundPickerTarget.identifier_number}</h2>
            <p className="mt-2 text-sm leading-6 text-stone-500">
              {refundPickerTarget.status === "OVRK"
                ? "Return this overkill amount to remove it from reserve capacity."
                : "Choose how you want to refund this spill-over record."}
            </p>

            <div className="mt-5 space-y-3">
              <button
                type="button"
                className="flex w-full items-center justify-between rounded-[22px] border border-stone-900/8 bg-stone-50 px-4 py-4 text-left transition hover:border-stone-900/20"
                onClick={() => {
                  setRefundPickerTarget(null);
                  setRefundTarget({ overflow: refundPickerTarget, action: "refund_overflow_only" });
                }}
              >
                <div>
                  <p className="font-semibold text-stone-950">Refund overflow only</p>
                  <p className="mt-1 text-sm text-stone-500">
                    Refund just the spill-over amount of {formatAmount(refundPickerTarget.excess_amount)}.
                  </p>
                </div>
              </button>
              {refundPickerTarget.status !== "OVRK" ? (
                <>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between rounded-[22px] border border-stone-900/8 bg-stone-50 px-4 py-4 text-left transition hover:border-stone-900/20"
                    onClick={() => {
                      setRefundPickerTarget(null);
                      setRefundTarget({ overflow: refundPickerTarget, action: "refund_transaction" });
                    }}
                  >
                    <div>
                      <p className="font-semibold text-stone-950">Refund transaction</p>
                      <p className="mt-1 text-sm text-stone-500">
                        Refund the full transaction that created this spill over.
                      </p>
                    </div>
                  </button>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between rounded-[22px] border border-stone-900/8 bg-stone-50 px-4 py-4 text-left transition hover:border-stone-900/20"
                    onClick={() => {
                      setRefundPickerTarget(null);
                      setRefundTarget({ overflow: refundPickerTarget, action: "refund_ticket" });
                    }}
                  >
                    <div>
                      <p className="font-semibold text-stone-950">Refund ticket</p>
                      <p className="mt-1 text-sm text-stone-500">
                        Refund the full ticket linked to {refundPickerTarget.order_number}.
                      </p>
                    </div>
                  </button>
                </>
              ) : null}
            </div>

            <div className="mt-5 flex justify-end">
              <Button variant="outline" onClick={() => setRefundPickerTarget(null)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <ActionLoadingModal
        open={Boolean(busyLabel)}
        title={busyLabel || "Processing"}
        description="FlowBit is updating the spill-over queue. This will close automatically when the action finishes."
      />
      {selectedTicketDetail || isTicketViewLoading ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/30 px-4 py-6"
          onClick={() => {
            if (!isTicketViewLoading) {
              setSelectedTicketDetail(null);
            }
          }}
        >
          <div
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-[28px] border border-stone-900/8 bg-white p-5 shadow-[0_18px_48px_rgba(24,24,24,0.18)] sm:p-6"
            onClick={(event) => event.stopPropagation()}
          >
            {isTicketViewLoading || !selectedTicketDetail ? (
              <div className="rounded-[22px] border border-dashed border-stone-300 bg-stone-50 px-4 py-10 text-sm text-stone-500">
                Loading ticket receipt.
              </div>
            ) : (
              <TicketReceiptCard
                ticket={selectedTicketDetail}
                className="receipt-print-card mx-auto max-w-[440px] rounded-[28px] border border-dashed border-stone-300 bg-stone-50 p-5 text-stone-900"
              />
            )}
          </div>
        </div>
      ) : null}
      {toast ? <AdminActionToast message={toast.message} type={toast.type} onClose={() => setToast(null)} /> : null}
    </>
  );
}
