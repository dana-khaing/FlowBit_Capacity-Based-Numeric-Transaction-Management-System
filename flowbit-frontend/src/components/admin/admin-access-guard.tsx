"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { WorkspaceShell } from "@/components/app/workspace-shell";
import { fetchCurrentUser, getStoredUser, type AuthUser } from "@/lib/auth-client";

type AdminAccessGuardProps = {
  children: (user: AuthUser) => ReactNode;
};

export function AdminAccessGuard({ children }: AdminAccessGuardProps) {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(getStoredUser());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCurrentUser()
      .then((currentUser) => {
        setUser(currentUser);
        setLoading(false);
        if (currentUser.role !== "admin") {
          router.replace("/profile");
        }
      })
      .catch(() => {
        setLoading(false);
      });
  }, [router]);

  if (loading || !user) {
    return (
      <WorkspaceShell>
        <div className="mx-auto w-full max-w-[1800px] px-4 py-4 text-sm text-stone-500 sm:px-6 lg:px-8">
          Loading admin workspace...
        </div>
      </WorkspaceShell>
    );
  }

  if (user.role !== "admin") {
    return (
      <WorkspaceShell>
        <div className="mx-auto flex w-full max-w-[1800px] flex-col gap-4 px-4 py-8 sm:px-6 lg:px-8">
          <div className="rounded-[28px] border border-stone-900/8 bg-white p-6 shadow-[0_8px_24px_rgba(28,24,20,0.04)]">
            <h1 className="text-2xl font-semibold text-stone-950">Admin access only</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-500">
              This area is limited to administrator accounts.
            </p>
            <Link
              href="/profile"
              className="mt-5 inline-flex rounded-[18px] border border-stone-900/10 bg-stone-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-stone-800"
            >
              Back to profile
            </Link>
          </div>
        </div>
      </WorkspaceShell>
    );
  }

  return <>{children(user)}</>;
}
