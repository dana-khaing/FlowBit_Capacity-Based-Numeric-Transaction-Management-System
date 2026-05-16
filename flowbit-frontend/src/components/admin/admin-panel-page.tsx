"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowUpRightFromSquare,
  faCalendarDays,
  faFileLines,
  faGear,
  faTicket,
  faShieldHalved,
  faUsersGear,
} from "@fortawesome/free-solid-svg-icons";
import { AdminActionToast } from "@/components/admin/admin-action-toast";
import { WorkspaceShell } from "@/components/app/workspace-shell";
import { AdminAccessGuard } from "@/components/admin/admin-access-guard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getApiBaseUrl } from "@/lib/api";
import {
  deletePeriodLuckyDraw,
  fetchPeriodLuckyDraw,
  fetchPeriods,
  savePeriodLuckyDraw,
  type FlowBitLuckyDraw,
  type FlowBitPeriod,
} from "@/lib/period-client";

type ToastState = {
  type: "success" | "error";
  message: string;
} | null;

const buildAdminLinks = () => {
  const apiBaseUrl = getApiBaseUrl();
  const backendBaseUrl = apiBaseUrl.replace(/\/api$/, "");

  return [
    {
      title: "User management",
      description: "Review users, roles, and access state inside the app.",
      href: "/admin/users",
      icon: faUsersGear,
      external: false,
    },
    {
      title: "Override codes",
      description: "Create or rotate admin override codes safely.",
      href: "/admin/override-codes",
      icon: faGear,
      external: false,
    },
    {
      title: "Audit logs",
      description: "Inspect approvals, refunds, period changes, and admin actions.",
      href: "/admin/audit-logs",
      icon: faFileLines,
      external: false,
    },
    {
      title: "Periods",
      description: "Open, adjust, pre-close, and review period control settings.",
      href: "/periods",
      icon: faCalendarDays,
      external: false,
    },
    {
      title: "Lucky Number Announce",
      description: "Open the period workspace to set reveal time, announce the lucky number, or review winner state.",
      href: "/periods",
      icon: faTicket,
      external: false,
    },
    {
      title: "API docs",
      description: "Open the protected backend API documentation.",
      href: `${backendBaseUrl}/api/docs/`,
      icon: faArrowUpRightFromSquare,
      external: true,
    },
    {
      title: "Django admin",
      description: "Open the full backend admin console for maintenance tasks.",
      href: `${backendBaseUrl}/admin/`,
      icon: faShieldHalved,
      external: true,
    },
  ];
};

export function AdminPanelPage() {
  const [periods, setPeriods] = useState<FlowBitPeriod[]>([]);
  const [luckyDraw, setLuckyDraw] = useState<FlowBitLuckyDraw | null>(null);
  const [luckyDrawNumber, setLuckyDrawNumber] = useState("");
  const [isLuckyDrawModalOpen, setIsLuckyDrawModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);
  const luckyDrawDigitRefs = useRef<Array<HTMLInputElement | null>>([]);

  const activePeriod = useMemo(
    () => periods.find((period) => period.is_open) ?? null,
    [periods],
  );

  useEffect(() => {
    let isMounted = true;

    async function loadLuckyDrawPanel() {
      try {
        const nextPeriods = await fetchPeriods();
        if (!isMounted) {
          return;
        }
        setPeriods(nextPeriods);
        const openPeriod = nextPeriods.find((period) => period.is_open);
        if (!openPeriod) {
          setLuckyDraw(null);
          setLuckyDrawNumber("");
          return;
        }

        try {
          const nextLuckyDraw = await fetchPeriodLuckyDraw(openPeriod.id);
          if (!isMounted) {
            return;
          }
          setLuckyDraw(nextLuckyDraw);
          setLuckyDrawNumber(nextLuckyDraw.number ?? "");
        } catch {
          if (!isMounted) {
            return;
          }
          setLuckyDraw(null);
          setLuckyDrawNumber("");
        }
      } catch (error) {
        if (!isMounted) {
          return;
        }
        setToast({
          type: "error",
          message: error instanceof Error ? error.message : "Request failed.",
        });
      }
    }

    void loadLuckyDrawPanel();
    return () => {
      isMounted = false;
    };
  }, []);

  async function handleSaveLuckyDraw(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activePeriod) {
      setToast({ type: "error", message: "Open a period first before announcing the lucky number." });
      return;
    }

    const normalizedNumber = luckyDrawNumber.replace(/\D/g, "");
    if (normalizedNumber.length !== 6) {
      setToast({ type: "error", message: "Lucky draw number must be exactly 6 digits." });
      return;
    }

    setIsSaving(true);
    try {
      const savedLuckyDraw = await savePeriodLuckyDraw(activePeriod.id, {
        number: normalizedNumber,
      });
      setLuckyDraw(savedLuckyDraw);
      setLuckyDrawNumber(savedLuckyDraw.number ?? normalizedNumber);
      setToast({ type: "success", message: "Lucky number saved successfully." });
      setIsLuckyDrawModalOpen(false);
    } catch (error) {
      setToast({
        type: "error",
        message: error instanceof Error ? error.message : "Request failed.",
      });
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDeleteLuckyDraw() {
    if (!activePeriod || !luckyDraw?.id) {
      return;
    }

    setIsSaving(true);
    try {
      await deletePeriodLuckyDraw(activePeriod.id);
      setLuckyDraw(null);
      setLuckyDrawNumber("");
      setToast({ type: "success", message: "Lucky number removed successfully." });
      setIsLuckyDrawModalOpen(false);
    } catch (error) {
      setToast({
        type: "error",
        message: error instanceof Error ? error.message : "Request failed.",
      });
    } finally {
      setIsSaving(false);
    }
  }

  function handleLuckyDrawDigitChange(index: number, value: string) {
    const nextDigit = value.replace(/\D/g, "").slice(-1);
    const digits = luckyDrawNumber.padEnd(6, " ").split("");
    digits[index] = nextDigit || "";
    const nextValue = digits.join("").replace(/\s/g, "");
    setLuckyDrawNumber(nextValue);

    if (nextDigit && index < 5) {
      luckyDrawDigitRefs.current[index + 1]?.focus();
    }
  }

  function handleLuckyDrawDigitKeyDown(index: number, event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Backspace" && !luckyDrawNumber[index] && index > 0) {
      luckyDrawDigitRefs.current[index - 1]?.focus();
    }
    if (event.key === "ArrowLeft" && index > 0) {
      event.preventDefault();
      luckyDrawDigitRefs.current[index - 1]?.focus();
    }
    if (event.key === "ArrowRight" && index < 5) {
      event.preventDefault();
      luckyDrawDigitRefs.current[index + 1]?.focus();
    }
  }

  function handleLuckyDrawPaste(event: React.ClipboardEvent<HTMLInputElement>) {
    const pasted = event.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!pasted) {
      return;
    }
    event.preventDefault();
    setLuckyDrawNumber(pasted);
    const focusIndex = Math.min(pasted.length, 5);
    luckyDrawDigitRefs.current[focusIndex]?.focus();
  }

  return (
    <AdminAccessGuard>
      {(user) => (
        <WorkspaceShell>
          {toast ? <AdminActionToast message={toast.message} type={toast.type} onClose={() => setToast(null)} /> : null}
          <div className="mx-auto w-full max-w-[1800px] px-4 py-3 sm:px-6 lg:px-8 lg:py-5">
            <div className="space-y-5">
              <section className="rounded-[28px] border border-stone-900/8 bg-white p-5 shadow-[0_8px_24px_rgba(28,24,20,0.04)] sm:p-6">
                <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-stone-400">Admin</p>
                <h1 className="mt-2 text-3xl font-semibold text-stone-950">Admin Panel</h1>
                <p className="mt-3 max-w-3xl text-sm leading-6 text-stone-500">
                  Central access for operational controls, audit review, user management, and backend maintenance.
                </p>
                <div className="mt-5 flex flex-wrap gap-3 text-sm text-stone-500">
                  <span className="inline-flex items-center gap-2 rounded-full bg-[#f5f1ea] px-3 py-2">
                    Signed in as {user.full_name || user.username}
                  </span>
                  <span className="inline-flex items-center gap-2 rounded-full bg-[#f5f1ea] px-3 py-2">
                    Administrator access
                  </span>
                </div>
              </section>

              <section className="grid gap-5 lg:grid-cols-2 xl:grid-cols-3">
                {buildAdminLinks().map((item) =>
                  item.external ? (
                    <a
                      key={item.title}
                      href={item.href}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-[26px] border border-stone-900/8 bg-white p-5 shadow-[0_8px_24px_rgba(28,24,20,0.04)] transition hover:bg-stone-50"
                    >
                      <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-[#f5f1ea] text-stone-700">
                        <FontAwesomeIcon icon={item.icon} className="h-4 w-4" />
                      </span>
                      <h2 className="mt-4 text-xl font-semibold text-stone-950">{item.title}</h2>
                      <p className="mt-2 text-sm leading-6 text-stone-500">{item.description}</p>
                    </a>
                  ) : item.title === "Lucky Number Announce" ? (
                    <button
                      key={item.title}
                      type="button"
                      onClick={() => setIsLuckyDrawModalOpen(true)}
                      className="rounded-[26px] border border-stone-900/8 bg-white p-5 text-left shadow-[0_8px_24px_rgba(28,24,20,0.04)] transition hover:bg-stone-50"
                    >
                      <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-[#f5f1ea] text-stone-700">
                        <FontAwesomeIcon icon={item.icon} className="h-4 w-4" />
                      </span>
                      <h2 className="mt-4 text-xl font-semibold text-stone-950">{item.title}</h2>
                      <p className="mt-2 text-sm leading-6 text-stone-500">{item.description}</p>
                      <p className="mt-3 text-xs font-semibold uppercase tracking-[0.16em] text-stone-400">
                        {activePeriod ? activePeriod.name : "No active period"}
                      </p>
                    </button>
                  ) : (
                    <Link
                      key={item.title}
                      href={item.href}
                      className="rounded-[26px] border border-stone-900/8 bg-white p-5 shadow-[0_8px_24px_rgba(28,24,20,0.04)] transition hover:bg-stone-50"
                    >
                      <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-[#f5f1ea] text-stone-700">
                        <FontAwesomeIcon icon={item.icon} className="h-4 w-4" />
                      </span>
                      <h2 className="mt-4 text-xl font-semibold text-stone-950">{item.title}</h2>
                      <p className="mt-2 text-sm leading-6 text-stone-500">{item.description}</p>
                    </Link>
                  ),
                )}
              </section>
            </div>
          </div>

          {isLuckyDrawModalOpen ? (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/40 px-4 py-6"
              onClick={() => {
                if (!isSaving) {
                  setIsLuckyDrawModalOpen(false);
                }
              }}
            >
              <div
                className="w-full max-w-md rounded-[28px] border border-stone-900/8 bg-white p-6 shadow-[0_18px_60px_rgba(28,24,20,0.24)]"
                onClick={(event) => event.stopPropagation()}
              >
                <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-stone-400">Lucky draw</p>
                <h3 className="mt-2 text-2xl font-semibold text-stone-950">Lucky Number Announce</h3>
                <p className="mt-3 text-sm leading-6 text-stone-500">
                  {activePeriod
                    ? `This will update the shared lucky number for ${activePeriod.name}.`
                    : "Open a period first before announcing the lucky number."}
                </p>

                <form className="mt-6 space-y-4" onSubmit={handleSaveLuckyDraw}>
                  <label className="block space-y-2">
                    <span className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Lucky draw number</span>
                    <div className="grid grid-cols-6 gap-2">
                      {Array.from({ length: 6 }, (_, index) => (
                        <Input
                          key={index}
                          ref={(element) => {
                            luckyDrawDigitRefs.current[index] = element;
                          }}
                          inputMode="numeric"
                          maxLength={1}
                          value={luckyDrawNumber[index] ?? ""}
                          onChange={(event) => handleLuckyDrawDigitChange(index, event.target.value)}
                          onKeyDown={(event) => handleLuckyDrawDigitKeyDown(index, event)}
                          onPaste={handleLuckyDrawPaste}
                          placeholder="*"
                          disabled={isSaving || !activePeriod}
                          className="h-14 rounded-[18px] px-0 text-center text-xl font-semibold tracking-[0.18em]"
                        />
                      ))}
                    </div>
                  </label>

                  <div className="flex gap-3">
                    {luckyDraw?.id ? (
                      <Button
                        type="button"
                        variant="outline"
                        className="flex-1"
                        onClick={handleDeleteLuckyDraw}
                        disabled={isSaving || !activePeriod}
                      >
                        Remove
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      variant="outline"
                      className="flex-1"
                      onClick={() => setIsLuckyDrawModalOpen(false)}
                      disabled={isSaving}
                    >
                      Cancel
                    </Button>
                    <Button type="submit" className="flex-1" disabled={isSaving || !activePeriod}>
                      {luckyDraw?.id ? "Save" : "Add"}
                    </Button>
                  </div>
                </form>
              </div>
            </div>
          ) : null}
        </WorkspaceShell>
      )}
    </AdminAccessGuard>
  );
}
