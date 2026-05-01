"use client";

import Link from "next/link";
import { ReactNode } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faLock } from "@fortawesome/free-solid-svg-icons";
import { AppSectionPage } from "@/components/app/app-section-page";
import { Button } from "@/components/ui/button";
import { usePeriodState } from "@/components/period/use-period-state";

type PeriodRequiredPageProps = {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
  showDefaultAside?: boolean;
};

export function PeriodRequiredPage({
  eyebrow,
  title,
  description,
  children,
  showDefaultAside = true,
}: PeriodRequiredPageProps) {
  const { activePeriod, hasActivePeriod, isLoading, error } = usePeriodState();

  if (isLoading) {
    return (
      <AppSectionPage eyebrow={eyebrow} title={title} description={description} showDefaultAside={showDefaultAside}>
        <div className="space-y-4 text-sm leading-6 text-stone-500">
          <p>Checking for an active period before opening this workspace.</p>
        </div>
      </AppSectionPage>
    );
  }

  if (!hasActivePeriod) {
    return (
      <AppSectionPage
        eyebrow={eyebrow}
        title={`${title} is locked`}
        description="Create an active period first. Ticket entry, ledgers, spill-over, and ticket history stay locked until a period is in place."
        showDefaultAside={showDefaultAside}
      >
        <div className="rounded-[24px] border border-amber-200 bg-amber-50 px-5 py-5 text-stone-700">
          <div className="flex items-start gap-3">
            <span className="mt-1 inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-amber-700">
              <FontAwesomeIcon icon={faLock} className="h-4 w-4" />
            </span>
            <div className="flex-1">
              <p className="text-base font-semibold text-stone-900">No active period found</p>
              <p className="mt-2 text-sm leading-6 text-stone-600">
                {error || "Set up the period term first, then come back to unlock this section."}
              </p>
              <div className="mt-4">
                <Link href="/periods">
                  <Button>Go to Period</Button>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </AppSectionPage>
    );
  }

  return (
    <AppSectionPage
      eyebrow={eyebrow}
      title={title}
      description={`${description} Active period: ${activePeriod?.name}.`}
      showDefaultAside={showDefaultAside}
    >
      {children}
    </AppSectionPage>
  );
}
