"use client";

import { ReactNode, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { clearStoredSession, fetchCurrentUser } from "@/lib/auth-client";

type SessionGuardProps = {
  children: ReactNode;
};

export function SessionGuard({ children }: SessionGuardProps) {
  const router = useRouter();
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function validateSession() {
      try {
        await fetchCurrentUser();
      } catch {
        clearStoredSession();
        router.push("/login");
      } finally {
        if (isMounted) {
          setIsChecking(false);
        }
      }
    }

    validateSession();
    return () => {
      isMounted = false;
    };
  }, [router]);

  if (isChecking) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-stone-500">
        Loading your workspace...
      </div>
    );
  }

  return <>{children}</>;
}
