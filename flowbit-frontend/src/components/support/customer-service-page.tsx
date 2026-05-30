"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AppSectionPage } from "@/components/app/app-section-page";
import { useCurrentUserState } from "@/components/auth/current-user-context";
import { fetchCurrentUser, getStoredUser, type AuthUser } from "@/lib/auth-client";
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

function intakeTone(intakeType: "STANDARD" | "LOGIN_HELP") {
  return intakeType === "LOGIN_HELP"
    ? "bg-amber-100 text-amber-700"
    : "bg-stone-200 text-stone-600";
}

function looksLikeEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function CustomerServicePage() {
  const currentUserState = useCurrentUserState();
  const [user, setUser] = useState<AuthUser | null>(getStoredUser());
  const effectiveUser = currentUserState?.user ?? user;
  const isAdmin = effectiveUser?.role === "admin";

  const [cases, setCases] = useState<FlowBitSupportCase[]>([]);
  const [selectedCaseId, setSelectedCaseId] = useState<number | null>(null);
  const [selectedCase, setSelectedCase] = useState<FlowBitSupportCaseDetail | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [search, setSearch] = useState("");
  const [replyDraft, setReplyDraft] = useState("");
  const [loginHelpReplyEmail, setLoginHelpReplyEmail] = useState("");
  const [newCaseOpen, setNewCaseOpen] = useState(false);
  const [newCaseSubject, setNewCaseSubject] = useState("");
  const [newCaseMessage, setNewCaseMessage] = useState("");
  const [isLoadingCases, setIsLoadingCases] = useState(true);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const shouldForceScrollRef = useRef(false);

  function scrollMessagesToBottom(behavior: ScrollBehavior = "smooth") {
    const container = messagesContainerRef.current;
    if (!container) {
      return;
    }
    container.scrollTo({
      top: container.scrollHeight,
      behavior,
    });
  }

  function isNearBottom() {
    const container = messagesContainerRef.current;
    if (!container) {
      return true;
    }
    const threshold = 96;
    return container.scrollHeight - container.scrollTop - container.clientHeight <= threshold;
  }

  async function loadCases(preferredCaseId?: number | null, options?: { silent?: boolean }) {
    if (!options?.silent) {
      setIsLoadingCases(true);
    }
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
      if (!options?.silent) {
        setIsLoadingCases(false);
      }
    }
  }

  useEffect(() => {
    loadCases();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let active = true;
    if (!currentUserState?.user) {
      fetchCurrentUser()
        .then((nextUser) => {
          if (active) {
            setUser(nextUser);
          }
        })
        .catch(() => {});
    }

    return () => {
      active = false;
    };
  }, [currentUserState?.user]);

  useEffect(() => {
    if (currentUserState?.user) {
      setUser(currentUserState.user);
    }
  }, [currentUserState?.user]);

  async function refreshCasesAndSelectedCase(preferredCaseId?: number | null) {
    const nextSelectedId = preferredCaseId ?? selectedCaseId;
    const [nextCases, nextDetail] = await Promise.all([
      fetchSupportCases(),
      nextSelectedId ? fetchSupportCase(nextSelectedId) : Promise.resolve(null),
    ]);
    setCases(nextCases);
    const resolvedSelectedId =
      nextSelectedId && nextCases.some((item) => item.id === nextSelectedId)
        ? nextSelectedId
        : nextCases[0]?.id ?? null;
    setSelectedCaseId(resolvedSelectedId);
    if (resolvedSelectedId && nextDetail && resolvedSelectedId === nextSelectedId) {
      setSelectedCase(normalizeSupportCaseDetail(nextDetail));
    } else if (!resolvedSelectedId) {
      setSelectedCase(null);
    }
  }

  useEffect(() => {
    if (!selectedCaseId) {
      setSelectedCase(null);
      return;
    }

    let active = true;
    setIsLoadingDetail(true);
    shouldForceScrollRef.current = true;
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

  useEffect(() => {
    if (!selectedCase) {
      return;
    }

    if (shouldForceScrollRef.current) {
      shouldForceScrollRef.current = false;
      requestAnimationFrame(() => scrollMessagesToBottom("auto"));
      return;
    }

    if (isNearBottom()) {
      requestAnimationFrame(() => scrollMessagesToBottom("smooth"));
    }
  }, [selectedCase?.messages.length, selectedCase]);

  useEffect(() => {
    if (!selectedCase || selectedCase.intake_type !== "LOGIN_HELP") {
      setLoginHelpReplyEmail("");
      return;
    }
    setLoginHelpReplyEmail(
      selectedCase.requester_email ||
        (looksLikeEmail(selectedCase.requester_login_identifier) ? selectedCase.requester_login_identifier : ""),
    );
  }, [selectedCase?.id, selectedCase?.intake_type, selectedCase?.requester_email, selectedCase?.requester_login_identifier]);

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
        item.requester_login_identifier,
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
    const replyEmail = loginHelpReplyEmail.trim();
    if (isAdmin && selectedCase?.intake_type === "LOGIN_HELP" && !replyEmail) {
      setErrorMessage("Enter a requester email before sending this login-help reply.");
      return;
    }
    if (isAdmin && selectedCase?.intake_type === "LOGIN_HELP" && replyEmail && !looksLikeEmail(replyEmail)) {
      setErrorMessage("Enter a valid requester email before sending this login-help reply.");
      return;
    }

    setIsSaving(true);
    setErrorMessage("");
    try {
      await replyToSupportCase(
        selectedCaseId,
        replyDraft,
        isAdmin && selectedCase?.intake_type === "LOGIN_HELP" ? { requester_email: replyEmail } : undefined,
      );
      setReplyDraft("");
      shouldForceScrollRef.current = true;
      await refreshCasesAndSelectedCase(selectedCaseId);
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
      await refreshCasesAndSelectedCase(selectedCaseId);
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
              {isAdmin
                ? new Set(
                    cases.map((item) =>
                      item.intake_type === "LOGIN_HELP"
                        ? item.requester_login_identifier || `case-${item.id}`
                        : `user-${item.created_by}`,
                    ),
                  ).size
                : cases.length}
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
                        <div className="flex flex-col items-end gap-2">
                          <span className={`rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${isSelected ? "bg-white/15 text-white" : statusTone(item.status)}`}>
                            {item.status}
                          </span>
                          {item.intake_type === "LOGIN_HELP" ? (
                            <span className={`rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${isSelected ? "bg-white/15 text-white" : intakeTone(item.intake_type)}`}>
                              Login help
                            </span>
                          ) : null}
                        </div>
                      </div>
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
                      {selectedCase.intake_type === "LOGIN_HELP" ? (
                        <span className={`rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${intakeTone(selectedCase.intake_type)}`}>
                          Login help
                        </span>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-sm text-stone-500">
                      <span>{selectedCase.created_by_full_name}</span>
                      {selectedCase.intake_type === "LOGIN_HELP" ? (
                        <>
                          <span>Login: {selectedCase.requester_login_identifier}</span>
                          <span>Email: {selectedCase.requester_email || loginHelpReplyEmail || "Not set"}</span>
                        </>
                      ) : null}
                      <span>{formatDateTime(selectedCase.created_at)}</span>
                      {selectedCase.closed_at ? <span>Closed {formatDateTime(selectedCase.closed_at)}</span> : null}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleToggleCaseStatus}
                    disabled={isSaving}
                    className="inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-[16px] border border-stone-900/10 bg-[#f8f6f2] px-4 py-2.5 text-sm font-semibold text-stone-700 transition hover:border-stone-300 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {selectedCase.status === "OPEN" ? "Close case" : "Reopen case"}
                  </button>
                </div>

                <div
                  ref={messagesContainerRef}
                  className="mt-4 min-h-0 flex-1 overflow-y-auto rounded-[24px] border border-stone-900/8 bg-[#f6f3ee] px-3 py-4 thin-scrollbar sm:px-4"
                >
                  {isLoadingDetail ? (
                    <div className="rounded-[20px] border border-dashed border-stone-300 bg-stone-50 px-4 py-8 text-center text-sm text-stone-500">
                      Loading case detail...
                    </div>
                  ) : selectedMessages.length ? (
                    <div className="space-y-3">
                    {selectedMessages.map((message) => {
                      const isMine = isAdmin
                        ? message.is_admin_sender
                        : message.sender === effectiveUser?.id;
                      return (
                        <div
                          key={message.id}
                          className={`flex w-full ${isMine ? "justify-end" : "justify-start"}`}
                        >
                          <div
                            className={`min-w-0 max-w-[78%] overflow-hidden px-4 py-3 shadow-[0_8px_20px_rgba(28,24,20,0.05)] ${
                              isMine
                                ? "ml-auto rounded-[22px_22px_8px_22px] bg-stone-950 text-white"
                                : message.is_admin_sender
                                  ? "mr-auto rounded-[22px_22px_22px_8px] bg-[#e7f6ef] text-stone-900"
                                  : "mr-auto rounded-[22px_22px_22px_8px] bg-white text-stone-900"
                            }`}
                          >
                            <div className={`flex flex-wrap items-center gap-2 text-[11px] ${isMine ? "justify-end" : "justify-start"}`}>
                              <span className={`font-semibold ${isMine ? "text-stone-100" : "text-stone-700"}`}>
                                {message.sender_full_name}
                              </span>
                              {message.is_admin_sender ? (
                                <span className="rounded-full bg-white/75 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-emerald-700">
                                  Admin
                                </span>
                              ) : null}
                              <span className={isMine ? "text-stone-300" : "text-stone-400"}>
                                {formatDateTime(message.created_at)}
                              </span>
                            </div>
                            <p className={`mt-2 whitespace-pre-wrap break-words text-sm leading-6 ${isMine ? "text-right text-stone-100" : "text-left text-stone-700"}`}>
                              {message.body}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                    </div>
                  ) : (
                    <div className="rounded-[20px] border border-dashed border-stone-300 bg-stone-50 px-4 py-8 text-center text-sm text-stone-500">
                      No messages in this case yet.
                    </div>
                  )}
                </div>

                <div className="mt-4 rounded-[22px] border border-stone-900/8 bg-[#f8f6f2] p-3">
                  <div className="space-y-3">
                    {isAdmin && selectedCase.intake_type === "LOGIN_HELP" ? (
                      <label className="flex w-full flex-col gap-2">
                        <span className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">
                          Reply email
                        </span>
                        <input
                          type="email"
                          value={loginHelpReplyEmail}
                          onChange={(event) => setLoginHelpReplyEmail(event.target.value)}
                          placeholder="requester@example.com"
                          disabled={selectedCase.status === "CLOSED" || Boolean(selectedCase.requester_email)}
                          className="h-12 w-full rounded-2xl border border-stone-900/10 bg-white px-4 text-sm text-stone-900 outline-none transition placeholder:text-stone-400 focus:border-stone-400 disabled:cursor-not-allowed disabled:opacity-60"
                        />
                      </label>
                    ) : null}
                    <textarea
                      value={replyDraft}
                      onChange={(event) => setReplyDraft(event.target.value)}
                      placeholder="Write your reply"
                      rows={1}
                      disabled={selectedCase.status === "CLOSED"}
                      className="h-20 w-full resize-none rounded-[18px] border border-stone-900/10 bg-white px-4 py-2.5 text-sm leading-5 text-stone-900 outline-none transition focus:border-stone-400 disabled:cursor-not-allowed disabled:opacity-60"
                    />
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs text-stone-500">
                        {selectedCase.status === "CLOSED"
                          ? "Reopen the case to continue the conversation."
                          : selectedCase.intake_type === "LOGIN_HELP"
                            ? `Admin replies are emailed to ${loginHelpReplyEmail || "the requester email"}.`
                            : "Replies stay in this shared thread for both sides."}
                      </p>
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
