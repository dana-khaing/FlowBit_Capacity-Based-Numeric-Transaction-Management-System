"use client";

import { type MouseEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faDownload,
  faFileCsv,
  faFilePdf,
  faLayerGroup,
} from "@fortawesome/free-solid-svg-icons";
import { AppSectionPage } from "@/components/app/app-section-page";
import { AdminActionToast } from "@/components/admin/admin-action-toast";
import { usePeriodState } from "@/components/period/use-period-state";
import { Button } from "@/components/ui/button";
import {
  exportLedgerCsv,
  exportLedgerPdf,
  fetchLedgers,
  type FlowBitLedger,
} from "@/lib/ledger-client";

type ToastState = {
  type: "success" | "error";
  message: string;
} | null;

function formatAmount(value: string) {
  const amount = Number(value);
  if (Number.isNaN(amount)) {
    return value;
  }
  return amount.toLocaleString("en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "Not set";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ExportLedgerPage() {
  const router = useRouter();
  const [ledgers, setLedgers] = useState<FlowBitLedger[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState>(null);
  const [downloadingKey, setDownloadingKey] = useState<string | null>(null);
  const [exportFilter, setExportFilter] = useState<"all" | "active" | "closed">("all");

  const { activePeriod, hasActivePeriod, isLoading: isPeriodLoading, error: periodError } = usePeriodState();

  useEffect(() => {
    if (!hasActivePeriod || !activePeriod) {
      setLedgers([]);
      setIsLoading(false);
      return;
    }

    let isMounted = true;
    setIsLoading(true);

    Promise.all([
      fetchLedgers({ period_id: activePeriod.id }),
      fetchLedgers({ period_id: activePeriod.id, section: "archive" }),
    ])
      .then(([activeRows, archivedRows]) => {
        if (!isMounted) {
          return;
        }

        const nextLedgers = [...activeRows, ...archivedRows]
          .filter((ledger) => !ledger.is_capacity_reserve)
          .sort((left, right) => left.priority - right.priority);

        setLedgers(nextLedgers);
        setPageError(null);
      })
      .catch((error) => {
        if (!isMounted) {
          return;
        }
        const message = error instanceof Error ? error.message : "Request failed.";
        setPageError(message);
        setToast({ type: "error", message });
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [activePeriod?.id, hasActivePeriod]);

  const filteredLedgers = useMemo(() => {
    if (exportFilter === "active") {
      return ledgers.filter((ledger) => ledger.is_active);
    }
    if (exportFilter === "closed") {
      return ledgers.filter((ledger) => !ledger.is_active);
    }
    return ledgers;
  }, [exportFilter, ledgers]);

  const activeCount = useMemo(
    () => ledgers.filter((ledger) => ledger.is_active).length,
    [ledgers],
  );

  async function handleDownload(
    event: MouseEvent<HTMLButtonElement>,
    ledger: FlowBitLedger,
    format: "csv" | "pdf",
  ) {
    event.stopPropagation();
    const key = `${ledger.id}:${format}`;
    setDownloadingKey(key);
    try {
      const file =
        format === "csv"
          ? await exportLedgerCsv(ledger.id)
          : await exportLedgerPdf(ledger.id);
      downloadBlob(file.blob, file.filename);
      setToast({
        type: "success",
        message: `${ledger.name} ${format.toUpperCase()} downloaded.`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Request failed.";
      setToast({ type: "error", message });
    } finally {
      setDownloadingKey(null);
    }
  }

  return (
    <>
      <AppSectionPage
        eyebrow="Exports"
        title="Export ledger"
        description=""
        workspaceLabel="Export ledger"
        aside={
          <aside className="rounded-[28px] border border-stone-900/8 bg-[#f3f0ea] p-5 shadow-[0_8px_24px_rgba(28,24,20,0.03)] sm:p-6">
            <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-stone-400">Current period</p>
            <div className="mt-4 space-y-4">
              <div className="rounded-[22px] bg-white px-4 py-4">
                <p className="text-sm text-stone-500">Active term</p>
                <p className="mt-1 text-lg font-semibold text-stone-900">
                  {activePeriod?.name ?? "No active period"}
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                <div className="rounded-[22px] bg-white px-4 py-4">
                  <p className="text-sm text-stone-500">Ledgers</p>
                  <p className="mt-1 text-lg font-semibold text-stone-900">{ledgers.length}</p>
                </div>
                <div className="rounded-[22px] bg-white px-4 py-4">
                  <p className="text-sm text-stone-500">Active</p>
                  <p className="mt-1 text-lg font-semibold text-stone-900">{activeCount}</p>
                </div>
              </div>
            </div>
          </aside>
        }
      >
        {isPeriodLoading || isLoading ? (
          <div className="rounded-[24px] border border-dashed border-stone-300 bg-stone-50 px-5 py-10 text-sm text-stone-500">
            Loading ledgers for export.
          </div>
        ) : periodError ? (
          <div className="rounded-[24px] border border-rose-200 bg-rose-50 px-5 py-5 text-sm text-rose-700">
            {periodError}
          </div>
        ) : !hasActivePeriod ? (
          <div className="rounded-[24px] border border-dashed border-amber-300 bg-amber-50 px-5 py-5 text-sm text-amber-800">
            Open a period first before exporting ledgers.
          </div>
        ) : pageError ? (
          <div className="rounded-[24px] border border-rose-200 bg-rose-50 px-5 py-5 text-sm text-rose-700">
            {pageError}
          </div>
        ) : (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-3 rounded-[22px] border border-stone-900/8 bg-stone-50 px-4 py-3">
              <div className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">
                <FontAwesomeIcon icon={faLayerGroup} className="h-3.5 w-3.5 text-stone-400" />
                {filteredLedgers.length} ledger{filteredLedgers.length === 1 ? "" : "s"}
              </div>
              <div className="ml-auto inline-flex rounded-[18px] border border-stone-900/8 bg-white p-1">
                {[
                  { label: "All", value: "all" },
                  { label: "Active", value: "active" },
                  { label: "Closed", value: "closed" },
                ].map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setExportFilter(option.value as "all" | "active" | "closed")}
                    className={`rounded-[14px] px-4 py-2 text-sm font-medium transition ${
                      exportFilter === option.value
                        ? "bg-stone-950 text-white"
                        : "text-stone-600 hover:bg-stone-100"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            {filteredLedgers.length === 0 ? (
              <div className="rounded-[24px] border border-dashed border-stone-300 bg-stone-50 px-5 py-10 text-sm text-stone-500">
                No ledgers match this export view yet.
              </div>
            ) : (
              <div className="space-y-4">
                {filteredLedgers.map((ledger) => {
                  const csvKey = `${ledger.id}:csv`;
                  const pdfKey = `${ledger.id}:pdf`;
                  const isCsvLoading = downloadingKey === csvKey;
                  const isPdfLoading = downloadingKey === pdfKey;

                  return (
                    <button
                      key={ledger.id}
                      type="button"
                      onClick={() => router.push(`/ledgers/${ledger.id}`)}
                      className="w-full rounded-[24px] border border-stone-900/8 bg-white px-5 py-5 text-left shadow-[0_8px_24px_rgba(28,24,20,0.04)] transition hover:border-stone-900/16 hover:shadow-[0_12px_28px_rgba(28,24,20,0.08)]"
                    >
                      <div className="flex flex-wrap items-start gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-lg font-semibold text-stone-900">{ledger.name}</p>
                            <span
                              className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] ${
                                ledger.is_active
                                  ? "bg-emerald-100 text-emerald-700"
                                  : "bg-stone-200 text-stone-600"
                              }`}
                            >
                              {ledger.is_active ? "Active" : "Closed"}
                            </span>
                          </div>
                          <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-stone-500">
                            <span>Priority {ledger.priority}</span>
                            <span>Capacity {formatAmount(ledger.limit_per_identifier)}</span>
                            <span>Ends {formatDateTime(ledger.end_date)}</span>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            variant="outline"
                            className="rounded-[18px]"
                            onClick={(event) => handleDownload(event, ledger, "csv")}
                            disabled={isCsvLoading || isPdfLoading}
                          >
                            <FontAwesomeIcon icon={faFileCsv} className="h-3.5 w-3.5" />
                            {isCsvLoading ? "Downloading" : "CSV"}
                          </Button>
                          <Button
                            variant="outline"
                            className="rounded-[18px]"
                            onClick={(event) => handleDownload(event, ledger, "pdf")}
                            disabled={isCsvLoading || isPdfLoading}
                          >
                            <FontAwesomeIcon icon={faFilePdf} className="h-3.5 w-3.5" />
                            {isPdfLoading ? "Downloading" : "PDF"}
                          </Button>
                          <Button
                            className="rounded-[18px]"
                            onClick={(event) => handleDownload(event, ledger, "pdf")}
                            disabled={isCsvLoading || isPdfLoading}
                          >
                            <FontAwesomeIcon icon={faDownload} className="h-3.5 w-3.5" />
                            Export
                          </Button>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </AppSectionPage>

      {toast ? <AdminActionToast message={toast.message} type={toast.type} onClose={() => setToast(null)} /> : null}
    </>
  );
}
