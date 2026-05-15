"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowRightFromBracket, faBars, faBell, faBullhorn, faTriangleExclamation } from "@fortawesome/free-solid-svg-icons";
import { AdminConfirmModal } from "@/components/admin/admin-confirm-modal";
import { usePeriodState } from "@/components/period/use-period-state";
import { Button } from "@/components/ui/button";
import { ProfileAvatar } from "@/components/profile/profile-avatar";
import { useCurrentUserState } from "@/components/auth/current-user-context";
import { logoutFromBackend } from "@/lib/auth-client";
import { useNotificationSummaryState } from "@/components/notifications/notification-summary-context";
import {
  dispatchNotificationsUpdated,
  markNotificationRead,
  type FlowBitNotification,
} from "@/lib/notification-client";

type AppHeaderProps = {
  onMenuClick: () => void;
};

export function AppHeader({ onMenuClick }: AppHeaderProps) {
  const router = useRouter();
  const notificationPopoverRef = useRef<HTMLDivElement | null>(null);
  const [isLogoutPending, setIsLogoutPending] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);
  const currentUserState = useCurrentUserState();
  const notificationSummaryState = useNotificationSummaryState();
  const { activePeriod } = usePeriodState();
  const user = currentUserState?.user ?? null;
  const notificationSummary = notificationSummaryState?.summary ?? { unread_count: 0, recent: [] };
  const refreshNotificationSummary = notificationSummaryState?.refreshSummary;

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!notificationPopoverRef.current) {
        return;
      }
      if (!notificationPopoverRef.current.contains(event.target as Node)) {
        setIsNotificationOpen(false);
      }
    }

    if (isNotificationOpen) {
      window.addEventListener("mousedown", handlePointerDown);
    }

    return () => window.removeEventListener("mousedown", handlePointerDown);
  }, [isNotificationOpen]);

  async function handleLogout() {
    setIsLogoutPending(true);
    await logoutFromBackend();
    router.push("/login");
    router.refresh();
  }

  const periodLabel = activePeriod ? activePeriod.name : "No active period";
  const navActionClassName =
    "inline-flex h-12 items-center justify-center gap-3 rounded-[20px] border border-stone-900/10 bg-white px-4 py-3 text-sm font-semibold text-stone-700 transition hover:bg-stone-50";

  function notificationIcon(notification: FlowBitNotification) {
    if (notification.category === "ANNOUNCEMENT") {
      return faBullhorn;
    }
    if (notification.level === "IMPORTANT" || notification.level === "WARNING") {
      return faTriangleExclamation;
    }
    return faBell;
  }

  async function handleNotificationClick(notification: FlowBitNotification) {
    try {
      if (!notification.is_read) {
        await markNotificationRead(notification.id);
        await refreshNotificationSummary?.();
        dispatchNotificationsUpdated();
      }
    } catch {
      // Let navigation continue.
    } finally {
      setIsNotificationOpen(false);
      router.push(notification.action_href || "/notifications");
    }
  }

  return (
    <>
      <AdminConfirmModal
        open={showLogoutConfirm}
        title="Log out of FlowBit"
        description="You will be signed out of the current session and returned to the login page."
        confirmLabel="Log out"
        showCodeInput={false}
        busy={isLogoutPending}
        onCodeChange={() => {}}
        onCancel={() => setShowLogoutConfirm(false)}
        onConfirm={handleLogout}
      />

      <div className="mx-auto flex w-full max-w-[1800px] items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="icon" onClick={onMenuClick} aria-label="Open navigation menu">
            <FontAwesomeIcon icon={faBars} className="h-4 w-4" />
          </Button>
          <Link
            href="/"
            className="rounded-xl px-1 py-1 text-[15px] font-medium text-stone-500 transition hover:text-stone-900"
          >
            <p className="text-[15px] font-medium text-stone-500">FlowBit</p>
          </Link>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden rounded-full border border-dashed border-stone-900/12 bg-stone-50 px-4 py-2 text-sm text-stone-500 sm:block">
            Period: {periodLabel}
          </div>
          <div ref={notificationPopoverRef} className="relative">
            <Button
              variant="outline"
              className="h-12 w-12 rounded-[20px] p-0"
              onClick={() => setIsNotificationOpen((current) => !current)}
              aria-label="Open notifications"
            >
              <FontAwesomeIcon icon={faBell} className="h-4 w-4" />
              {notificationSummary.unread_count ? (
                <span className="absolute -right-1 -top-1 inline-flex min-w-[22px] items-center justify-center rounded-full bg-rose-600 px-1.5 py-1 text-[10px] font-semibold text-white">
                  {notificationSummary.unread_count > 9 ? "9+" : notificationSummary.unread_count}
                </span>
              ) : null}
            </Button>

            {isNotificationOpen ? (
              <div className="absolute right-0 top-[calc(100%+12px)] z-50 w-[332px] rounded-[24px] border border-stone-900/10 bg-white p-3 shadow-[0_24px_80px_rgba(28,24,20,0.18)]">
                <div className="flex items-center justify-between gap-3 px-1 pb-2">
                  <div>
                    <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-stone-400">Notifications</p>
                    <p className="mt-0.5 text-xs text-stone-500">{notificationSummary.unread_count} unread</p>
                  </div>
                  <Link
                    href="/notifications"
                    onClick={() => setIsNotificationOpen(false)}
                    className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-700 transition hover:text-stone-950"
                  >
                    View all
                  </Link>
                </div>

                <div className="space-y-1.5">
                  {notificationSummary.recent.length ? notificationSummary.recent.map((notification) => (
                    <button
                      key={notification.id}
                      type="button"
                      onClick={() => void handleNotificationClick(notification)}
                      className={`flex w-full items-start gap-2 rounded-[16px] border px-3 py-2.5 text-left transition ${
                        notification.is_read
                          ? "border-stone-200 bg-stone-50"
                          : "border-stone-900/10 bg-white shadow-[0_6px_16px_rgba(28,24,20,0.04)]"
                      }`}
                    >
                      <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-stone-100 text-stone-700">
                        <FontAwesomeIcon icon={notificationIcon(notification)} className="h-3 w-3" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-[13px] font-semibold text-stone-950">{notification.title}</p>
                          {!notification.is_read ? (
                            <span className="rounded-full bg-stone-950 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-white">
                              New
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-0.5 line-clamp-1 text-[12px] leading-4.5 text-stone-500">{notification.message}</p>
                        <p className="mt-1 text-[10px] font-medium text-stone-400">
                          {new Date(notification.created_at).toLocaleString("en-GB", {
                            day: "2-digit",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                      </div>
                    </button>
                  )) : (
                    <div className="rounded-[16px] border border-dashed border-stone-300 bg-stone-50 px-3 py-2.5 text-sm text-stone-500">
                      No recent notifications.
                    </div>
                  )}
                </div>
              </div>
            ) : null}
          </div>
          <Link
            href="/profile"
            className={navActionClassName}
          >
            {user ? <ProfileAvatar user={user} className="h-8 w-8 rounded-full" textClassName="text-xs font-semibold" /> : null}
            Profile
          </Link>
          <Button
            variant="outline"
            className={navActionClassName}
            onClick={() => setShowLogoutConfirm(true)}
          >
            <FontAwesomeIcon icon={faArrowRightFromBracket} className="h-4 w-4" />
            Logout
          </Button>
        </div>
      </div>
    </>
  );
}
