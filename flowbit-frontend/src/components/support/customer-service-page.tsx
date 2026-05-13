"use client";

import { useEffect, useMemo, useState } from "react";
import { AppSectionPage } from "@/components/app/app-section-page";
import { getStoredUser } from "@/lib/auth-client";
import {
  closeSupportCase,
  createSupportCase,
  fetchSupportCase,
  fetchSupportCases,
  type FlowBitSupportCase,
  type FlowBitSupportCaseDetail,
  reopenSupportCase,
  replyToSupportCase,
} from "@/lib/support-client";

type StatusFilter = "ALL" | "OPEN" | "CLOSED";

function normalizeSupportCaseDetail(
  caseDetail: FlowBitSupportCaseDetail | (FlowBitSupportCase & { messages?: FlowBitSupportCaseDetail["messages"] }),
) {
  return {
    ...caseDetail,
    messages: caseDetail.messages ?? [],
  };
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "-";
  }
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function statusTone(status: "OPEN" | "CLOSED") {
  return status === "OPEN"
    ? "bg-emerald-100 text-emerald-700"
    : "bg-stone-200 text-stone-600";
}

export function CustomerServicePage() {
  const currentUser = getStoredUser();
  const isAdmin = currentUser?.role === "admin";

  const [cases, setCases] = useState<FlowBitSupportCase[]>([]);
  const [selectedCaseId, setSelectedCaseId] = useState<number | null>(null);
  const [selectedCase, setSelectedCase] = useState<FlowBitSupportCaseDetail | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [search, setSearch] = useState("");
  const [replyDraft, setReplyDraft] = useState("");
  const [newCaseOpen, setNewCaseOpen] = useState(false);
  const [newCaseSubject, setNewCaseSubject] = useState("");
  const [newCaseMessage, setNewCaseMessage] = useState("");
  const [isLoadingCases, setIsLoadingCases] = useState(true);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  async function loadCases(preferredCaseId?: number | null) {
    setIsLoadingCases(true);
    setErrorMessage("");
    try {
      const nextCases = await fetchSupportCases();
      setCases(nextCases);
      const nextSelectedId =
        preferredCaseId ??
        (nextCases.some((item) => item.id === selectedCaseId) ? selectedCaseId : nextCases[0]?.id ?? null);
      setSelectedCaseId(nextSelectedId);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to load customer service cases.");
    } finally {
      setIsLoadingCases(false);
    }
  }

  useEffect(() => {
    loadCases();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedCaseId) {
      setSelectedCase(null);
      return;
    }

    let active = true;
    setIsLoadingDetail(true);
    setErrorMessage("");
    fetchSupportCase(selectedCaseId)
      .then((detail) => {
        if (active) {
          setSelectedCase(normalizeSupportCaseDetail(detail));
        }
      })
      .catch((error) => {
        if (active) {
          setErrorMessage(error instanceof Error ? error.message : "Failed to load case detail.");
        }
      })
      .finally(() => {
        if (active) {
          setIsLoadingDetail(false);
        }
      });

    return () => {
      active = false;
    };
  }, [selectedCaseId]);

  const filteredCases = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return cases.filter((item) => {
      if (statusFilter !== "ALL" && item.status !== statusFilter) {
        return false;
      }
      if (!normalizedSearch) {
        return true;
      }
      return [
        item.subject,
        item.created_by_username,
        item.created_by_full_name,
        item.last_message_preview,
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalizedSearch);
    });
  }, [cases, search, statusFilter]);

  const openCount = cases.filter((item) => item.status === "OPEN").length;
  const closedCount = cases.filter((item) => item.status === "CLOSED").length;
  const selectedMessages = selectedCase?.messages ?? [];

  async function handleCreateCase() {
    setIsSaving(true);
    setErrorMessage("");
    try {
      const created = await createSupportCase({
        subject: newCaseSubject,
        message: newCaseMessage,
      });
      setNewCaseOpen(false);
      setNewCaseSubject("");
      setNewCaseMessage("");
      await loadCases(created.id);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to create case.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleReply() {
    if (!selectedCaseId || !replyDraft.trim()) {
      return;
    }

    setIsSaving(true);
    setErrorMessage("");
    try {
      await replyToSupportCase(selectedCaseId, replyDraft);
      setReplyDraft("");
      const refreshedCase = await fetchSupportCase(selectedCaseId);
      setSelectedCase(normalizeSupportCaseDetail(refreshedCase));
      await loadCases(selectedCaseId);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to send reply.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleToggleCaseStatus() {
    if (!selectedCaseId || !selectedCase) {
      return;
    }

    setIsSaving(true);
    setErrorMessage("");
    try {
      await (
        selectedCase.status === "OPEN"
          ? await closeSupportCase(selectedCaseId)
          : await reopenSupportCase(selectedCaseId)
      );
      const refreshedCase = await fetchSupportCase(selectedCaseId);
      setSelectedCase(normalizeSupportCaseDetail(refreshedCase));
      await loadCases(selectedCaseId);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to update case status.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <AppSectionPage
      eyebrow="Support"
      title="Customer service"
      description=""
      workspaceLabel="Customer service"
      showDefaultAside={false}
      workspaceClassName="p-0"
    >
      <div className="space-y-5 p-5 sm:p-6">
        <div className="flex flex-col gap-4 rounded-[26px] border border-stone-900/8 bg-[#f5f2eb] p-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-2">
            <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-stone-400">Case inbox</p>
            <h1 className="text-2xl font-semibold text-stone-900">Customer service cases</h1>
            <p className="max-w-2xl text-sm leading-6 text-stone-500">
              Create a case, keep the thread in one place, and close or reopen it from either side when the issue changes.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setNewCaseOpen(true)}
            className="inline-flex items-center justify-center rounded-[18px] bg-stone-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-stone-800"
          >
            New case
          </button>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-[22px] border border-stone-900/8 bg-white px-4 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-400">Open cases</p>
            <p className="mt-2 text-2xl font-semibold text-stone-900">{openCount}</p>
          </div>
          <div className="rounded-[22px] border border-stone-900/8 bg-white px-4 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-400">Closed cases</p>
            <p className="mt-2 text-2xl font-semibold text-stone-900">{closedCount}</p>
          </div>
          <div className="rounded-[22px] border border-stone-900/8 bg-white px-4 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-400">
              {isAdmin ? "Customers" : "My cases"}
            </p>
            <p className="mt-2 text-2xl font-semibold text-stone-900">
              {isAdmin ? new Set(cases.map((item) => item.created_by)).size : cases.length}
            </p>
          </div>
        </div>

        {errorMessage ? (
          <div className="rounded-[20px] border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            {errorMessage}
          </div>
        ) : null}

        <div className="grid gap-5 xl:grid-cols-[minmax(340px,0.9fr)_minmax(0,1.4fr)]">
          <section className="rounded-[26px] border border-stone-900/8 bg-white p-4 shadow-[0_8px_24px_rgba(28,24,20,0.04)]">
            <div className="flex flex-col gap-3 border-b border-stone-900/8 pb-4 sm:flex-row sm:items-center">
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search subject or customer"
                className="h-11 flex-1 rounded-2xl border border-stone-900/10 bg-[#f8f6f2] px-4 text-sm text-stone-900 outline-none transition focus:border-stone-400"
              />
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
                className="h-11 rounded-2xl border border-stone-900/10 bg-[#f8f6f2] px-4 text-sm text-stone-900 outline-none transition focus:border-stone-400"
              >
                <option value="ALL">All cases</option>
                <option value="OPEN">Open</option>
                <option value="CLOSED">Closed</option>
              </select>
            </div>

            <div className="mt-4 max-h-[68vh] space-y-3 overflow-y-auto pr-1 thin-scrollbar">
              {isLoadingCases ? (
                <div className="rounded-[20px] border border-dashed border-stone-300 bg-stone-50 px-4 py-8 text-center text-sm text-stone-500">
                  Loading cases...
                </div>
              ) : filteredCases.length ? (
                filteredCases.map((item) => {
                  const isSelected = item.id === selectedCaseId;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setSelectedCaseId(item.id)}
                      className={`w-full rounded-[22px] border px-4 py-4 text-left transition ${
                        isSelected
                          ? "border-stone-950 bg-stone-950 text-white shadow-[0_12px_30px_rgba(28,24,20,0.18)]"
                          : "border-stone-900/8 bg-white hover:border-stone-300 hover:bg-stone-50"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 space-y-1">
                          <p className="truncate text-base font-semibold">{item.subject}</p>
                          <p className={`text-sm ${isSelected ? "text-stone-200" : "text-stone-500"}`}>
                            {isAdmin ? item.created_by_full_name : "My case"}
                          </p>
                        </div>
                        <span className={`rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${isSelected ? "bg-white/15 text-white" : statusTone(item.status)}`}>
                          {item.status}
                        </span>
                      </div>
                      <p className={`mt-3 line-clamp-2 text-sm leading-6 ${isSelected ? "text-stone-200" : "text-stone-500"}`}>
                        {item.last_message_preview || "No messages yet."}
                      </p>
                      <div className={`mt-3 flex flex-wrap items-center gap-3 text-xs font-semibold uppercase tracking-[0.14em] ${isSelected ? "text-stone-300" : "text-stone-400"}`}>
                        <span>{item.message_count} message{item.message_count === 1 ? "" : "s"}</span>
                        <span>{formatDateTime(item.last_message_at || item.created_at)}</span>
                      </div>
                    </button>
                  );
                })
              ) : (
                <div className="rounded-[20px] border border-dashed border-stone-300 bg-stone-50 px-4 py-8 text-center text-sm text-stone-500">
                  No cases match the current filter.
                </div>
              )}
            </div>
          </section>

          <section className="rounded-[26px] border border-stone-900/8 bg-white p-4 shadow-[0_8px_24px_rgba(28,24,20,0.04)] xl:h-[72vh] xl:min-h-[720px]">
            {selectedCase ? (
              <div className="flex h-full min-h-[520px] flex-col">
                <div className="flex flex-col gap-4 border-b border-stone-900/8 pb-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-xl font-semibold text-stone-900">{selectedCase.subject}</p>
                      <span className={`rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${statusTone(selectedCase.status)}`}>
                        {selectedCase.status}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-sm text-stone-500">
                      <span>{selectedCase.created_by_full_name}</span>
                      <span>{formatDateTime(selectedCase.created_at)}</span>
                      {selectedCase.closed_at ? <span>Closed {formatDateTime(selectedCase.closed_at)}</span> : null}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleToggleCaseStatus}
                    disabled={isSaving}
                    className="inline-flex items-center justify-center rounded-[16px] border border-stone-900/10 bg-[#f8f6f2] px-4 py-2.5 text-sm font-semibold text-stone-700 transition hover:border-stone-300 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {selectedCase.status === "OPEN" ? "Close case" : "Reopen case"}
                  </button>
                </div>

                <div className="mt-4 min-h-0 flex-1 space-y-4 overflow-y-auto pr-1 thin-scrollbar">
                  {isLoadingDetail ? (
                    <div className="rounded-[20px] border border-dashed border-stone-300 bg-stone-50 px-4 py-8 text-center text-sm text-stone-500">
                      Loading case detail...
                    </div>
                  ) : selectedMessages.length ? (
                    selectedMessages.map((message) => {
                      const isMine = message.sender === currentUser?.id;
                      return (
                        <div
                          key={message.id}
                          className={`flex ${isMine ? "justify-end" : "justify-start"}`}
                        >
                          <div
                            className={`min-w-0 max-w-[88%] overflow-hidden rounded-[22px] px-4 py-4 ${
                              isMine
                                ? "bg-stone-950 text-white"
                                : message.is_admin_sender
                                  ? "bg-emerald-50 text-stone-900"
                                  : "bg-[#f5f2eb] text-stone-900"
                            }`}
                          >
                            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em]">
                              <span>{message.sender_full_name}</span>
                              {message.is_admin_sender ? <span className="rounded-full bg-white/70 px-2 py-1 text-[10px] text-emerald-700">Admin</span> : null}
                              <span className={isMine ? "text-stone-300" : "text-stone-400"}>{formatDateTime(message.created_at)}</span>
                            </div>
                            <p className={`mt-3 whitespace-pre-wrap break-words text-sm leading-6 ${isMine ? "text-stone-100" : "text-stone-700"}`}>
                              {message.body}
                            </p>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="rounded-[20px] border border-dashed border-stone-300 bg-stone-50 px-4 py-8 text-center text-sm text-stone-500">
                      No messages in this case yet.
                    </div>
                  )}
                </div>

                <div className="mt-4 border-t border-stone-900/8 pt-4">
                  <div className="space-y-3">
                    <textarea
                      value={replyDraft}
                      onChange={(event) => setReplyDraft(event.target.value)}
                      placeholder="Write your reply"
                      rows={1}
                      disabled={selectedCase.status === "CLOSED"}
                      className="h-20 w-full resize-none rounded-[18px] border border-stone-900/10 bg-[#f8f6f2] px-4 py-2.5 text-sm leading-5 text-stone-900 outline-none transition focus:border-stone-400 disabled:cursor-not-allowed disabled:opacity-60"
                    />
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={handleReply}
                        disabled={isSaving || selectedCase.status === "CLOSED" || !replyDraft.trim()}
                        className="inline-flex items-center justify-center rounded-[18px] bg-stone-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Send reply
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex min-h-[520px] items-center justify-center rounded-[22px] border border-dashed border-stone-300 bg-stone-50 px-4 py-8 text-center text-sm text-stone-500">
                Select a case to read the thread and reply.
              </div>
            )}
          </section>
        </div>
      </div>

      {newCaseOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/35 px-4 py-8" onClick={() => !isSaving && setNewCaseOpen(false)}>
          <div
            className="w-full max-w-2xl rounded-[28px] border border-stone-900/8 bg-white p-6 shadow-[0_24px_80px_rgba(28,24,20,0.18)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-stone-400">New case</p>
                <h2 className="mt-2 text-2xl font-semibold text-stone-900">Open a customer service case</h2>
              </div>
              <button
                type="button"
                onClick={() => setNewCaseOpen(false)}
                className="rounded-full bg-stone-100 px-3 py-2 text-sm font-semibold text-stone-600"
              >
                Close
              </button>
            </div>

            <div className="mt-6 space-y-4">
              <label className="flex flex-col gap-2">
                <span className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Subject</span>
                <input
                  value={newCaseSubject}
                  onChange={(event) => setNewCaseSubject(event.target.value)}
                  placeholder="Short issue summary"
                  className="h-12 rounded-2xl border border-stone-900/10 bg-[#f8f6f2] px-4 text-sm text-stone-900 outline-none transition focus:border-stone-400"
                />
              </label>
              <label className="flex flex-col gap-2">
                <span className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Message</span>
                <textarea
                  value={newCaseMessage}
                  onChange={(event) => setNewCaseMessage(event.target.value)}
                  placeholder="Describe the problem, what happened, and what you already tried."
                  rows={6}
                  className="rounded-[20px] border border-stone-900/10 bg-[#f8f6f2] px-4 py-3 text-sm text-stone-900 outline-none transition focus:border-stone-400"
                />
              </label>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setNewCaseOpen(false)}
                className="rounded-[16px] border border-stone-900/10 bg-white px-4 py-3 text-sm font-semibold text-stone-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreateCase}
                disabled={isSaving || !newCaseSubject.trim() || !newCaseMessage.trim()}
                className="rounded-[16px] bg-stone-950 px-5 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                Create case
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </AppSectionPage>
  );
}
