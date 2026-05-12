"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBell, faBullhorn, faCheckDouble, faTriangleExclamation } from "@fortawesome/free-solid-svg-icons";
import { AppSectionPage } from "@/components/app/app-section-page";
import { AdminActionToast } from "@/components/admin/admin-action-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fetchCurrentUser, getStoredUser, type AuthUser } from "@/lib/auth-client";
import {
  broadcastNotification,
  fetchNotifications,
  markAllNotificationsRead,
  type FlowBitNotification,
} from "@/lib/notification-client";

type ToastState = {
  type: "success" | "error";
  message: string;
} | null;

function formatDateLabel(value: string) {
  return new Date(value).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function levelStyles(level: FlowBitNotification["level"]) {
  if (level === "IMPORTANT") {
    return "border-rose-200 bg-rose-50 text-rose-800";
  }
  if (level === "WARNING") {
    return "border-amber-200 bg-amber-50 text-amber-800";
  }
  return "border-sky-200 bg-sky-50 text-sky-800";
}

export function NotificationPage() {
  const [user, setUser] = useState<AuthUser | null>(getStoredUser());
  const [notifications, setNotifications] = useState<FlowBitNotification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);
  const [broadcastForm, setBroadcastForm] = useState({
    title: "",
    message: "",
    action_href: "",
    level: "INFO" as "INFO" | "WARNING" | "IMPORTANT",
  });

  async function loadNotifications(unreadOnly = showUnreadOnly) {
    setIsLoading(true);
    try {
      const [nextUser, nextNotifications] = await Promise.all([
        fetchCurrentUser(),
        fetchNotifications({ unreadOnly }),
      ]);
      setUser(nextUser);
      setNotifications(nextNotifications);
    } catch (error) {
      setToast({
        type: "error",
        message: error instanceof Error ? error.message : "Request failed.",
      });
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadNotifications();
  }, []);

  useEffect(() => {
    void loadNotifications(showUnreadOnly);
  }, [showUnreadOnly]);

  const groupedNotifications = useMemo(() => {
    return notifications.reduce<Array<{ date: string; items: FlowBitNotification[] }>>((groups, notification) => {
      const date = formatDateLabel(notification.created_at);
      const current = groups[groups.length - 1];
      if (!current || current.date !== date) {
        groups.push({ date, items: [notification] });
      } else {
        current.items.push(notification);
      }
      return groups;
    }, []);
  }, [notifications]);

  async function handleMarkAllRead() {
    setIsSubmitting(true);
    try {
      await markAllNotificationsRead();
      setToast({ type: "success", message: "Notifications marked as read." });
      await loadNotifications(showUnreadOnly);
    } catch (error) {
      setToast({
        type: "error",
        message: error instanceof Error ? error.message : "Request failed.",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleBroadcast(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!broadcastForm.title.trim() || !broadcastForm.message.trim()) {
      setToast({ type: "error", message: "Title and message are required." });
      return;
    }
    setIsSubmitting(true);
    try {
      await broadcastNotification({
        title: broadcastForm.title.trim(),
        message: broadcastForm.message.trim(),
        action_href: broadcastForm.action_href.trim(),
        level: broadcastForm.level,
      });
      setBroadcastForm({ title: "", message: "", action_href: "", level: "INFO" });
      setToast({ type: "success", message: "Announcement sent to all users." });
      await loadNotifications(showUnreadOnly);
    } catch (error) {
      setToast({
        type: "error",
        message: error instanceof Error ? error.message : "Request failed.",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  const isAdmin = user?.role === "admin";

  return (
    <>
      {toast ? <AdminActionToast message={toast.message} type={toast.type} onClose={() => setToast(null)} /> : null}
      <AppSectionPage
        eyebrow="Notifications"
        title="Notifications"
        description=""
        workspaceLabel="Notifications"
        showDefaultAside={false}
      >
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
          <article className="rounded-[28px] border border-stone-900/8 bg-white p-5 shadow-[0_8px_24px_rgba(28,24,20,0.04)] sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-stone-400">Inbox</p>
                <h2 className="mt-2 text-2xl font-semibold text-stone-950">All notifications</h2>
                <p className="mt-2 text-sm text-stone-500">System alerts and admin announcements are grouped by date for your account.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant={showUnreadOnly ? "default" : "outline"}
                  className="rounded-[18px]"
                  onClick={() => setShowUnreadOnly((current) => !current)}
                >
                  {showUnreadOnly ? "Showing unread" : "Unread only"}
                </Button>
                <Button variant="outline" className="rounded-[18px]" onClick={handleMarkAllRead} disabled={isSubmitting}>
                  <FontAwesomeIcon icon={faCheckDouble} className="h-4 w-4" />
                  Mark all read
                </Button>
              </div>
            </div>

            <div className="thin-scrollbar mt-6 max-h-[780px] space-y-6 overflow-y-auto pr-1">
              {isLoading ? (
                <div className="rounded-[22px] border border-dashed border-stone-300 bg-stone-50 px-4 py-4 text-sm text-stone-500">
                  Loading notifications.
                </div>
              ) : groupedNotifications.length ? (
                groupedNotifications.map((group) => (
                  <section key={group.date}>
                    <div className="sticky top-0 z-10 mb-3 rounded-full bg-[#efede8] px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
                      {group.date}
                    </div>
                    <div className="space-y-3">
                      {group.items.map((notification) => {
                        const className = `block rounded-[24px] border px-4 py-4 transition ${notification.is_read ? "border-stone-200 bg-stone-50" : "border-stone-900/10 bg-white shadow-[0_6px_16px_rgba(28,24,20,0.04)]"}`;
                        const content = (
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex items-start gap-3">
                              <span className={`mt-1 inline-flex h-10 w-10 items-center justify-center rounded-full border ${levelStyles(notification.level)}`}>
                                <FontAwesomeIcon
                                  icon={notification.category === "ANNOUNCEMENT" ? faBullhorn : faBell}
                                  className="h-4 w-4"
                                />
                              </span>
                              <div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="text-base font-semibold text-stone-950">{notification.title}</p>
                                  {!notification.is_read ? (
                                    <span className="rounded-full bg-stone-950 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white">
                                      New
                                    </span>
                                  ) : null}
                                </div>
                                <p className="mt-2 text-sm leading-6 text-stone-600">{notification.message}</p>
                                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-medium text-stone-400">
                                  <span>{notification.category === "ANNOUNCEMENT" ? "Admin announcement" : "System notification"}</span>
                                  <span>•</span>
                                  <span>{formatDateTime(notification.created_at)}</span>
                                  {notification.created_by_username ? (
                                    <>
                                      <span>•</span>
                                      <span>{notification.created_by_username}</span>
                                    </>
                                  ) : null}
                                  {notification.period_name ? (
                                    <>
                                      <span>•</span>
                                      <span>{notification.period_name}</span>
                                    </>
                                  ) : null}
                                </div>
                              </div>
                            </div>
                            <span className={`rounded-full px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.14em] ${levelStyles(notification.level)}`}>
                              {notification.level}
                            </span>
                          </div>
                        );
                        return (
                          notification.action_href ? (
                            <Link key={notification.id} href={notification.action_href} className={className}>
                              {content}
                            </Link>
                          ) : (
                            <div key={notification.id} className={className}>
                              {content}
                            </div>
                          )
                        );
                      })}
                    </div>
                  </section>
                ))
              ) : (
                <div className="rounded-[22px] border border-dashed border-stone-300 bg-stone-50 px-4 py-4 text-sm text-stone-500">
                  No notifications to show right now.
                </div>
              )}
            </div>
          </article>

          <aside className="space-y-5">
            {isAdmin ? (
              <article className="rounded-[28px] border border-stone-900/8 bg-white p-5 shadow-[0_8px_24px_rgba(28,24,20,0.04)] sm:p-6">
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-stone-100 text-stone-700">
                    <FontAwesomeIcon icon={faBullhorn} className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-stone-400">Admin</p>
                    <h2 className="mt-1 text-xl font-semibold text-stone-950">Send to all users</h2>
                  </div>
                </div>

                <form className="mt-6 space-y-4" onSubmit={handleBroadcast}>
                  <label className="block space-y-2">
                    <span className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Title</span>
                    <Input
                      value={broadcastForm.title}
                      onChange={(event) => setBroadcastForm((current) => ({ ...current, title: event.target.value }))}
                      placeholder="System maintenance"
                      disabled={isSubmitting}
                    />
                  </label>
                  <label className="block space-y-2">
                    <span className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Message</span>
                    <textarea
                      value={broadcastForm.message}
                      onChange={(event) => setBroadcastForm((current) => ({ ...current, message: event.target.value }))}
                      placeholder="Let everyone know what changed."
                      disabled={isSubmitting}
                      className="min-h-[140px] w-full rounded-[18px] border border-stone-900/10 bg-white px-4 py-3 text-sm text-stone-900 outline-none transition focus:border-stone-900/20"
                    />
                  </label>
                  <label className="block space-y-2">
                    <span className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Link</span>
                    <Input
                      value={broadcastForm.action_href}
                      onChange={(event) => setBroadcastForm((current) => ({ ...current, action_href: event.target.value }))}
                      placeholder="/spill-over"
                      disabled={isSubmitting}
                    />
                  </label>
                  <label className="block space-y-2">
                    <span className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Priority</span>
                    <select
                      value={broadcastForm.level}
                      onChange={(event) =>
                        setBroadcastForm((current) => ({
                          ...current,
                          level: event.target.value as "INFO" | "WARNING" | "IMPORTANT",
                        }))
                      }
                      className="h-12 w-full rounded-[18px] border border-stone-900/10 bg-white px-4 text-sm text-stone-900 outline-none transition focus:border-stone-900/20"
                      disabled={isSubmitting}
                    >
                      <option value="INFO">Info</option>
                      <option value="WARNING">Warning</option>
                      <option value="IMPORTANT">Important</option>
                    </select>
                  </label>
                  <Button type="submit" className="w-full" disabled={isSubmitting}>
                    Send announcement
                  </Button>
                </form>
              </article>
            ) : null}

            <article className="rounded-[28px] border border-stone-900/8 bg-white p-5 shadow-[0_8px_24px_rgba(28,24,20,0.04)] sm:p-6">
              <div className="flex items-center gap-3">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 text-amber-800">
                  <FontAwesomeIcon icon={faTriangleExclamation} className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-stone-400">Notes</p>
                  <h2 className="mt-1 text-xl font-semibold text-stone-950">What shows here</h2>
                </div>
              </div>
              <div className="mt-5 space-y-3 text-sm leading-6 text-stone-500">
                <p>Important system notifications are kept per user, including pre-close spill-over reminders and lucky draw announcements.</p>
                <p>Admin announcements are copied to every active user individually so each account has its own dated inbox.</p>
              </div>
            </article>
          </aside>
        </div>
      </AppSectionPage>
    </>
  );
}
