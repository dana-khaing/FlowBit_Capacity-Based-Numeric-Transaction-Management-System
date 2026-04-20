"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowRightFromBracket, faUser } from "@fortawesome/free-solid-svg-icons";
import { Button } from "@/components/ui/button";
import { fetchCurrentUser, getStoredUser, logoutFromBackend, type AuthUser } from "@/lib/auth-client";

export function AppHeader() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    setUser(getStoredUser());
    fetchCurrentUser().then(setUser).catch(() => {
      // SessionGuard handles redirect on invalid sessions.
    });
  }, []);

  async function handleLogout() {
    await logoutFromBackend();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="mx-auto flex w-full max-w-[1800px] items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
      <div className="flex items-center gap-4">
        <button className="flex h-11 w-11 items-center justify-center rounded-2xl border border-stone-900/10 bg-white text-2xl text-stone-500">
          ≡
        </button>
        <div>
          <p className="text-[15px] font-medium text-stone-500">FlowBit</p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="hidden rounded-full border border-stone-900/10 bg-stone-50 px-4 py-2 text-sm text-stone-500 sm:block">
          Period: Mar 1–16
        </div>
        {user ? (
          <div className="hidden text-right sm:block">
            <p className="text-sm font-medium text-stone-700">{user.full_name || user.username}</p>
            <p className="text-xs text-stone-400">@{user.username}</p>
          </div>
        ) : null}
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#d97a35] text-sm font-semibold text-white">
          {user?.username?.slice(0, 2).toUpperCase() || "FB"}
        </div>
        <Link
          href="/profile"
          className="inline-flex items-center justify-center gap-2 rounded-[20px] border border-stone-900/10 bg-white px-5 py-3 text-sm font-semibold text-stone-700 transition hover:bg-stone-50"
        >
          <FontAwesomeIcon icon={faUser} className="h-4 w-4" />
          Profile
        </Link>
        <Button variant="outline" onClick={handleLogout}>
          <FontAwesomeIcon icon={faArrowRightFromBracket} className="h-4 w-4" />
          Logout
        </Button>
      </div>
    </div>
  );
}
