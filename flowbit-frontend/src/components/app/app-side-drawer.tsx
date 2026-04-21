"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faXmark } from "@fortawesome/free-solid-svg-icons";
import { primaryNavItems } from "@/components/app/app-nav";
import { Button } from "@/components/ui/button";

type AppSideDrawerProps = {
  open: boolean;
  onClose: () => void;
};

export function AppSideDrawer({ open, onClose }: AppSideDrawerProps) {
  const pathname = usePathname();

  function isItemActive(href: string) {
    if (href === "/") {
      return pathname === "/";
    }
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex bg-stone-950/30" onClick={onClose}>
      <aside
        className="flex h-full w-full max-w-[340px] flex-col border-r border-stone-900/8 bg-[#f5f2ec] px-5 py-5 shadow-[0_18px_48px_rgba(24,24,24,0.18)] sm:px-6"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-stone-400">Navigation</p>
            <h2 className="mt-2 text-2xl font-semibold text-stone-950">FlowBit</h2>
          </div>
          <Button variant="outline" size="icon" onClick={onClose} aria-label="Close menu">
            <FontAwesomeIcon icon={faXmark} className="h-4 w-4" />
          </Button>
        </div>

        <nav className="mt-8 flex flex-1 flex-col gap-2">
          {primaryNavItems.map((item) => {
            const isActive = isItemActive(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                className={`flex items-center gap-3 rounded-[20px] border px-4 py-3 text-sm font-semibold transition ${
                  isActive
                    ? "border-stone-900/10 bg-white text-stone-950 shadow-[0_8px_18px_rgba(28,24,20,0.05)]"
                    : "border-transparent bg-transparent text-stone-600 hover:border-stone-900/8 hover:bg-white/70 hover:text-stone-900"
                }`}
              >
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-stone-900/[0.05] text-stone-700">
                  <FontAwesomeIcon icon={item.icon} className="h-4 w-4" />
                </span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="rounded-[24px] border border-stone-900/8 bg-white px-4 py-4 text-sm text-stone-500">
          Move between ticket entry, ledger review, overflow handling, exports, and archive screens from one place.
        </div>
      </aside>
    </div>
  );
}
