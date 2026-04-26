"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowRightFromBracket, faBars } from "@fortawesome/free-solid-svg-icons";
import { AdminConfirmModal } from "@/components/admin/admin-confirm-modal";
import { usePeriodState } from "@/components/period/use-period-state";
import { Button } from "@/components/ui/button";
import { ProfileAvatar } from "@/components/profile/profile-avatar";
import { fetchCurrentUser, getStoredUser, logoutFromBackend, type AuthUser } from "@/lib/auth-client";

type AppHeaderProps = {
  onMenuClick: () => void;
};

export function AppHeader({ onMenuClick }: AppHeaderProps) {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLogoutPending, setIsLogoutPending] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const { activePeriod } = usePeriodState();

  useEffect(() => {
    setUser(getStoredUser());
    fetchCurrentUser().then(setUser).catch(() => {
      // SessionGuard handles redirect on invalid sessions.
    });
  }, []);

  async function handleLogout() {
    setIsLogoutPending(true);
    await logoutFromBackend();
    router.push("/login");
    router.refresh();
  }

  const periodLabel = activePeriod ? activePeriod.name : "No active period";
  const navActionClassName =
    "inline-flex h-12 items-center justify-center gap-3 rounded-[20px] border border-stone-900/10 bg-white px-4 py-3 text-sm font-semibold text-stone-700 transition hover:bg-stone-50";

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
