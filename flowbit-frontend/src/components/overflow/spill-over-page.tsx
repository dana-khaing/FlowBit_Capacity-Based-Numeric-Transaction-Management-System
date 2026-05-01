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
import { AdminConfirmModal } from "@/components/admin/admin-confirm-modal";
import { ActionLoadingModal } from "@/components/app/action-loading-modal";
import { PeriodRequiredPage } from "@/components/period/period-required-page";
import { TicketReceiptCard } from "@/components/tickets/ticket-receipt-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fetchCurrentUser, getStoredUser, type AuthUser } from "@/lib/auth-client";
import { fetchTicketDetail, type FlowBitTicketDetail } from "@/lib/ticket-client";
import {
  approveOverflow,
  createCollaborator,
  fetchApprovedOverflows,
  fetchCollaborators,
  fetchPendingOverflows,
  resolveOverflowAction,
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

function sanitizeWholeNumberInput(value: string) {
  return value.replace(/[^\d]/g, "");
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
  return "Refunded";
}

function getOverflowStatusTone(status: FlowBitOverflow["status"]) {
  if (status === "TCSO") {
    return "bg-amber-100 text-amber-800";
  }
  if (status === "CSO") {
    return "bg-emerald-100 text-emerald-700";
  }
  return "bg-stone-200 text-stone-700";
}

export function SpillOverPage() {
  const [user, setUser] = useState<AuthUser | null>(getStoredUser());
  const [pendingOverflows, setPendingOverflows] = useState<FlowBitOverflow[]>([]);
  const [approvedOverflows, setApprovedOverflows] = useState<FlowBitOverflow[]>([]);
  const [collaborators, setCollaborators] = useState<FlowBitCollaborator[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState>(null);
  const [activeTab, setActiveTab] = useState<"pending" | "approved">("pending");
  const [searchQuery, setSearchQuery] = useState("");
  const [approveTarget, setApproveTarget] = useState<FlowBitOverflow | null>(null);
  const [approveAmount, setApproveAmount] = useState("");
  const [selectedCollaboratorIds, setSelectedCollaboratorIds] = useState<number[]>([]);
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
  const [refundPickerTarget, setRefundPickerTarget] = useState<FlowBitOverflow | null>(null);
  const [overrideCode, setOverrideCode] = useState("");
  const [busyLabel, setBusyLabel] = useState<string | null>(null);
  const [selectedTicketDetail, setSelectedTicketDetail] = useState<FlowBitTicketDetail | null>(null);
  const [isTicketViewLoading, setIsTicketViewLoading] = useState(false);

  const requiresOverride = user?.role !== "admin";

  useEffect(() => {
    setUser(getStoredUser());
    fetchCurrentUser().then(setUser).catch(() => {
      // Session guard handles invalid sessions.
    });
  }, []);

  async function loadPageData() {
    setIsLoading(true);
    try {
      const [nextPending, nextApproved, nextCollaborators, nextUser] = await Promise.all([
        fetchPendingOverflows(),
        fetchApprovedOverflows(),
        fetchCollaborators(),
        fetchCurrentUser(),
      ]);
      setPendingOverflows(nextPending);
      setApprovedOverflows(nextApproved);
      setCollaborators(nextCollaborators);
      setUser(nextUser);
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
  }, []);

  const visibleOverflows = useMemo(() => {
    const source = activeTab === "pending" ? pendingOverflows : approvedOverflows;
    const query = searchQuery.trim().toLowerCase();
    if (!query) {
      return source;
    }
    return source.filter((overflow) =>
      [
        overflow.identifier_number,
        overflow.order_number,
        overflow.ticket_number || "",
        overflow.customer_name || "",
        overflow.helper_name || "",
        overflow.collaborator_names.join(" "),
      ]
        .join(" ")
        .toLowerCase()
        .includes(query),
    );
  }, [activeTab, approvedOverflows, pendingOverflows, searchQuery]);

  const pendingAmount = useMemo(
    () =>
      pendingOverflows.reduce(
        (sum, overflow) => sum + (Number(overflow.excess_amount) || 0),
        0,
      ),
    [pendingOverflows],
  );

  const approvedAmount = useMemo(
    () =>
      approvedOverflows.reduce(
        (sum, overflow) => sum + (Number(getOverflowApprovedAmount(overflow)) || 0),
        0,
      ),
    [approvedOverflows],
  );

  function openApproveModal(overflow: FlowBitOverflow) {
    setApproveTarget(overflow);
    setApproveAmount(formatWholeAmount(overflow.amount_to_approve || overflow.excess_amount || ""));
    const initialCollaboratorId = overflow.collaborators[0];
    setSelectedCollaboratorIds(initialCollaboratorId ? [initialCollaboratorId] : []);
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

  async function handleApproveOverflow() {
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
      await loadPageData();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Request failed.";
      setToast({ type: "error", message });
    } finally {
      setBusyLabel(null);
    }
  }

  async function handleCreateCollaborator() {
    setBusyLabel("Creating collaborator");
    try {
      const collaborator = await createCollaborator({
        username: collaboratorDraft.username.trim(),
        full_name: collaboratorDraft.full_name.trim(),
        email: collaboratorDraft.email.trim(),
        phone_number: collaboratorDraft.phone_number.trim(),
      });
      setCollaborators((current) => [...current, collaborator].sort((left, right) => left.username.localeCompare(right.username)));
      setSelectedCollaboratorIds([collaborator.id]);
      setCollaboratorDraft({
        username: "",
        full_name: "",
        email: "",
        phone_number: "",
      });
      setToast({ type: "success", message: `Collaborator '${collaborator.username}' created.` });
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
      });
      setToast({ type: "success", message: response.message });
      setRefundTarget(null);
      setOverrideCode("");
      await loadPageData();
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

  return (
    <>
      <PeriodRequiredPage
        eyebrow="Spill over"
        title="Spill-over review"
        description="Review pending TCSO items, confirm approved CSO items, and move quickly into refund actions."
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
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(300px,0.8fr)]">
            <div className="space-y-5">
              <div className="flex flex-wrap items-center gap-3 rounded-[22px] border border-stone-900/8 bg-stone-50 px-4 py-3">
                <div className="inline-flex rounded-[18px] border border-stone-900/8 bg-white p-1">
                  {[
                    { label: `Pending ${pendingOverflows.length}`, value: "pending" },
                    { label: `Approved ${approvedOverflows.length}`, value: "approved" },
                  ].map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setActiveTab(option.value as "pending" | "approved")}
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
                  placeholder="Search by identifier, ticket, order, customer, or helper"
                  className="min-w-[260px] flex-1"
                />
              </div>

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
                            Amount: <span className="text-stone-950">{formatAmount(overflow.excess_amount)}</span>
                          </p>
                          {overflow.ticket_number ? (
                            <Button
                              variant="outline"
                              className="h-11 min-w-[124px] rounded-[18px]"
                              onClick={() => openTicketView(overflow.ticket_number)}
                            >
                              <FontAwesomeIcon icon={faReceipt} className="h-3.5 w-3.5" />
                              Ticket
                            </Button>
                          ) : null}
                          {overflow.status === "TCSO" ? (
                            <Button className="h-11 min-w-[124px] rounded-[18px]" onClick={() => openApproveModal(overflow)}>
                              <FontAwesomeIcon icon={faCircleCheck} className="h-3.5 w-3.5" />
                              Approve
                            </Button>
                          ) : null}
                          <Button
                            variant="outline"
                            className="h-11 min-w-[124px] rounded-[18px]"
                            onClick={() => setRefundPickerTarget(overflow)}
                          >
                            <FontAwesomeIcon icon={faRotateLeft} className="h-3.5 w-3.5" />
                            Refund
                          </Button>
                        </div>
                      </div>

                      {overflow.status !== "TCSO" ? (
                        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                          <div className="rounded-[18px] bg-stone-50 px-4 py-3">
                            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-400">Approved</p>
                            <p className="mt-1 text-lg font-semibold text-stone-950">{formatAmount(getOverflowApprovedAmount(overflow))}</p>
                          </div>
                          <div className="rounded-[18px] bg-stone-50 px-4 py-3">
                            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-400">Helper</p>
                            <p className="mt-1 text-sm font-medium text-stone-900">{overflow.helper_name || "-"}</p>
                          </div>
                          <div className="rounded-[18px] bg-stone-50 px-4 py-3">
                            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-400">Collaborators</p>
                            <p className="mt-1 text-sm font-medium text-stone-900">
                              {overflow.collaborator_names.length ? overflow.collaborator_names.join(", ") : "-"}
                            </p>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <aside className="space-y-4 rounded-[28px] border border-stone-900/8 bg-[#f3f0ea] p-5 shadow-[0_8px_24px_rgba(28,24,20,0.03)] sm:p-6">
              <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-stone-400">Queue summary</p>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                <div className="rounded-[22px] bg-white px-4 py-4">
                  <div className="flex items-center gap-2 text-stone-500">
                    <FontAwesomeIcon icon={faTriangleExclamation} className="h-4 w-4 text-amber-600" />
                    <p className="text-sm">Pending</p>
                  </div>
                  <p className="mt-2 text-2xl font-semibold text-stone-950">{pendingOverflows.length}</p>
                  <p className="mt-1 text-sm text-stone-500">{formatAmount(String(pendingAmount))}</p>
                </div>
                <div className="rounded-[22px] bg-white px-4 py-4">
                  <div className="flex items-center gap-2 text-stone-500">
                    <FontAwesomeIcon icon={faArrowTrendUp} className="h-4 w-4 text-emerald-600" />
                    <p className="text-sm">Approved</p>
                  </div>
                  <p className="mt-2 text-2xl font-semibold text-stone-950">{approvedOverflows.length}</p>
                  <p className="mt-1 text-sm text-stone-500">{formatAmount(String(approvedAmount))}</p>
                </div>
              </div>
              <div className="rounded-[22px] bg-white px-4 py-4">
                <div className="flex items-center gap-2 text-stone-500">
                  <FontAwesomeIcon icon={faClock} className="h-4 w-4 text-stone-400" />
                  <p className="text-sm">Current view</p>
                </div>
                <p className="mt-2 text-lg font-semibold text-stone-950">
                  {activeTab === "pending" ? "Pending TCSO queue" : "Approved CSO queue"}
                </p>
                <p className="mt-2 text-sm leading-6 text-stone-500">
                  Approve pending spill-over with collaborator support, or refund overflow, transaction, and ticket records directly from this page.
                </p>
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
                      <button
                        key={collaborator.id}
                        type="button"
                        onClick={() => selectCollaborator(collaborator.id)}
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
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="mt-5 rounded-[22px] border border-stone-900/8 bg-stone-50 px-4 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-400">Create collaborator</p>
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
                  Create collaborator
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
        open={Boolean(refundTarget)}
        title="Confirm spill-over refund"
        description={
          refundTarget
            ? `${refundTarget.overflow.identifier_number} · ${refundTarget.overflow.order_number}\nRefund ${refundTarget.action.replaceAll("_", " ")} for ${formatAmount(
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
        }}
        onConfirm={handleRefundAction}
      />
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
              Choose how you want to refund this spill-over record.
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
