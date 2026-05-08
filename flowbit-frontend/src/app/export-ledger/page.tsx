"use client";

import { type MouseEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCircleXmark,
  faDownload,
  faFileCsv,
  faFilePdf,
  faLayerGroup,
  faPrint,
  faTriangleExclamation,
  faUsers,
} from "@fortawesome/free-solid-svg-icons";
import { ActionLoadingModal } from "@/components/app/action-loading-modal";
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
import {
  downloadSpillOverExportPdf,
  fetchCollaborators,
  fetchSpillOverExportPreview,
  type FlowBitCollaborator,
  type FlowBitSpillOverExportPreview,
} from "@/lib/overflow-client";

type ToastState = {
  type: "success" | "error";
  message: string;
} | null;

type DownloadState = {
  ledgerName: string;
  format: "csv" | "pdf";
} | null;

type SpillOverModalState = {
  collaboratorId: string;
  collaboratorLabel: string;
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

function getCollaboratorDisplayName(collaborator: FlowBitCollaborator) {
  return collaborator.full_name.trim() || collaborator.username;
}

export default function ExportLedgerPage() {
  const router = useRouter();
  const [ledgers, setLedgers] = useState<FlowBitLedger[]>([]);
  const [collaborators, setCollaborators] = useState<FlowBitCollaborator[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSpillOverLoading, setIsSpillOverLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState>(null);
  const [downloadingKey, setDownloadingKey] = useState<string | null>(null);
  const [downloadState, setDownloadState] = useState<DownloadState>(null);
  const [exportFilter, setExportFilter] = useState<"all" | "active" | "closed">("all");
  const [spillOverModal, setSpillOverModal] = useState<SpillOverModalState>(null);
  const [spillOverPreview, setSpillOverPreview] = useState<FlowBitSpillOverExportPreview | null>(null);
  const [isSpillOverPdfDownloading, setIsSpillOverPdfDownloading] = useState(false);
  const [isSpillOverPrintPreparing, setIsSpillOverPrintPreparing] = useState(false);

  const { activePeriod, hasActivePeriod, isLoading: isPeriodLoading, error: periodError } = usePeriodState();

  useEffect(() => {
    if (!hasActivePeriod || !activePeriod) {
      setLedgers([]);
      setCollaborators([]);
      setIsLoading(false);
      setIsSpillOverLoading(false);
      return;
    }

    let isMounted = true;
    setIsLoading(true);
    setIsSpillOverLoading(true);

    Promise.all([
      fetchLedgers({ period_id: activePeriod.id }),
      fetchLedgers({ period_id: activePeriod.id, section: "archive" }),
      fetchCollaborators(),
    ])
      .then(([activeRows, archivedRows, collaboratorRows]) => {
        if (!isMounted) {
          return;
        }

        const nextLedgers = [...activeRows, ...archivedRows]
          .filter((ledger) => !ledger.is_capacity_reserve)
          .sort((left, right) => left.priority - right.priority);

        setLedgers(nextLedgers);
        setCollaborators(
          collaboratorRows
            .slice()
            .sort((left, right) =>
              getCollaboratorDisplayName(left).localeCompare(getCollaboratorDisplayName(right)),
            ),
        );
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
          setIsSpillOverLoading(false);
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
    setDownloadState({
      ledgerName: ledger.name,
      format,
    });
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
      setDownloadState(null);
    }
  }

  async function openSpillOverExport(collaboratorId: string, collaboratorLabel: string) {
    if (!activePeriod) {
      return;
    }

    setSpillOverModal({ collaboratorId, collaboratorLabel });
    setSpillOverPreview(null);
    setIsSpillOverLoading(true);

    try {
      const preview = await fetchSpillOverExportPreview({
        periodId: activePeriod.id,
        collaboratorId,
      });
      setSpillOverPreview(preview);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Request failed.";
      setToast({ type: "error", message });
      setSpillOverModal(null);
    } finally {
      setIsSpillOverLoading(false);
    }
  }

  async function handleSpillOverPdfDownload() {
    if (!activePeriod || !spillOverModal) {
      return;
    }

    setIsSpillOverPdfDownloading(true);
    try {
      const file = await downloadSpillOverExportPdf({
        periodId: activePeriod.id,
        collaboratorId: spillOverModal.collaboratorId,
      });
      downloadBlob(file.blob, file.filename);
      setToast({ type: "success", message: "Spill-over PDF downloaded." });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Request failed.";
      setToast({ type: "error", message });
    } finally {
      setIsSpillOverPdfDownloading(false);
    }
  }

  function handleSpillOverPrint() {
    setIsSpillOverPrintPreparing(true);
    window.setTimeout(() => {
      window.print();
      setIsSpillOverPrintPreparing(false);
    }, 50);
  }

  return (
    <>
      <AppSectionPage
        eyebrow="Exports"
        title="Export"
        description=""
        workspaceLabel="Export"
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
          <div className="space-y-6">
            <section className="rounded-[24px] border border-stone-900/8 bg-white px-5 py-5 shadow-[0_8px_24px_rgba(28,24,20,0.04)]">
              <div className="flex flex-wrap items-center gap-3">
                <div>
                  <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-stone-400">
                    Export spill over
                  </p>
                  <p className="mt-1 text-sm text-stone-500">
                    Choose a collaborator to preview and print approved and overkill amounts.
                  </p>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => openSpillOverExport("all", "All collaborators")}
                  className="rounded-[18px] border border-stone-900/8 bg-stone-50 px-4 py-3 text-sm font-medium text-stone-700 transition hover:border-stone-900/16 hover:bg-stone-100"
                >
                  All collaborators
                </button>
                {collaborators.map((collaborator) => (
                  <button
                    key={collaborator.id}
                    type="button"
                    onClick={() =>
                      openSpillOverExport(String(collaborator.id), getCollaboratorDisplayName(collaborator))
                    }
                    className="rounded-[18px] border border-stone-900/8 bg-stone-50 px-4 py-3 text-sm font-medium text-stone-700 transition hover:border-stone-900/16 hover:bg-stone-100"
                  >
                    {getCollaboratorDisplayName(collaborator)}
                  </button>
                ))}
              </div>
            </section>

            <section className="rounded-[24px] border border-stone-900/8 bg-white px-5 py-5 shadow-[0_8px_24px_rgba(28,24,20,0.04)]">
              <div className="flex flex-wrap items-center gap-3 rounded-[22px] border border-stone-900/8 bg-stone-50 px-4 py-3">
                <div>
                  <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-stone-400">
                    Export ledger
                  </p>
                  <p className="mt-1 text-sm text-stone-500">
                    Open a ledger or download CSV and PDF exports.
                  </p>
                </div>
                <div className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-stone-500 sm:ml-auto">
                  <FontAwesomeIcon icon={faLayerGroup} className="h-3.5 w-3.5 text-stone-400" />
                  {filteredLedgers.length} ledger{filteredLedgers.length === 1 ? "" : "s"}
                </div>
                <div className="inline-flex rounded-[18px] border border-stone-900/8 bg-white p-1">
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

              <div className="mt-5">
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
                        <div
                          key={ledger.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => router.push(`/ledgers/${ledger.id}`)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              router.push(`/ledgers/${ledger.id}`);
                            }
                          }}
                          className="w-full cursor-pointer rounded-[24px] border border-stone-900/8 bg-stone-50 px-5 py-5 text-left shadow-[0_8px_24px_rgba(28,24,20,0.04)] transition hover:border-stone-900/16 hover:shadow-[0_12px_28px_rgba(28,24,20,0.08)] focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-950/20"
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
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </section>
          </div>
        )}
      </AppSectionPage>

      <ActionLoadingModal
        open={downloadState !== null}
        title={
          downloadState?.format === "csv"
            ? "Preparing CSV export"
            : "Preparing PDF export"
        }
        description={
          downloadState
            ? `${downloadState.ledgerName} is being prepared for download. PDF exports can take a little longer.`
            : ""
        }
      />
      <ActionLoadingModal
        open={isSpillOverPdfDownloading}
        title="Preparing spill-over PDF"
        description="Your collaborator spill-over export is being prepared for download."
      />
      <ActionLoadingModal
        open={isSpillOverPrintPreparing}
        title="Preparing receipt print"
        description="Your spill-over export is being prepared for receipt printing."
      />
      {spillOverModal ? (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-stone-950/50 px-4 py-6 print:bg-transparent"
          onClick={() => setSpillOverModal(null)}
        >
          <div
            className="max-h-[90vh] w-full max-w-[520px] overflow-y-auto rounded-[28px] bg-white p-5 shadow-[0_24px_60px_rgba(15,23,42,0.28)] print:max-h-none print:max-w-none print:overflow-visible print:rounded-none print:bg-transparent print:p-0 print:shadow-none"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-3 print:hidden">
              <div>
                <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-stone-400">
                  Export spill over
                </p>
                <h2 className="mt-1 text-xl font-semibold text-stone-950">
                  {spillOverModal.collaboratorLabel}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setSpillOverModal(null)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-stone-900/8 bg-white text-stone-500 transition hover:bg-stone-100 hover:text-stone-900"
                aria-label="Close spill-over export"
              >
                <FontAwesomeIcon icon={faCircleXmark} className="h-4 w-4" />
              </button>
            </div>

            {isSpillOverLoading ? (
              <div className="rounded-[24px] border border-dashed border-stone-300 bg-stone-50 px-5 py-10 text-sm text-stone-500">
                Loading spill-over export.
              </div>
            ) : spillOverPreview ? (
              <div className="space-y-4">
                <div className="print:hidden flex flex-wrap items-center gap-3 rounded-[22px] border border-stone-900/8 bg-stone-50 px-4 py-3">
                  <div className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">
                    <FontAwesomeIcon icon={faUsers} className="h-3.5 w-3.5 text-stone-400" />
                    {spillOverPreview.collaborator_label}
                  </div>
                  <div className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">
                    <FontAwesomeIcon icon={faTriangleExclamation} className="h-3.5 w-3.5 text-stone-400" />
                    {spillOverPreview.period_label}
                  </div>
                  <div className="ml-auto flex flex-wrap gap-2">
                    <Button variant="outline" className="rounded-[18px]" onClick={handleSpillOverPdfDownload}>
                      <FontAwesomeIcon icon={faFilePdf} className="h-3.5 w-3.5" />
                      PDF
                    </Button>
                    <Button className="rounded-[18px]" onClick={handleSpillOverPrint}>
                      <FontAwesomeIcon icon={faPrint} className="h-3.5 w-3.5" />
                      Print
                    </Button>
                  </div>
                </div>

                <div className="receipt-print-card mx-auto max-w-[440px] rounded-[28px] border border-dashed border-stone-300 bg-stone-50 p-5 text-stone-900 print:max-w-none print:rounded-none print:border-0 print:bg-white print:p-0">
                  <div className="text-center">
                    <p className="text-xs font-semibold uppercase tracking-[0.28em] text-stone-500">
                      Spill over export
                    </p>
                    <p className="mt-2 text-xl font-semibold text-stone-950">
                      {spillOverPreview.collaborator_label}
                    </p>
                    <p className="mt-1 text-sm text-stone-500">{spillOverPreview.period_label}</p>
                  </div>

                  <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
                    <div className="rounded-[18px] bg-white px-3 py-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-400">Number of spill over</p>
                      <p className="mt-1 text-lg font-semibold text-stone-950">
                        {spillOverPreview.summary.identifier_count}
                      </p>
                    </div>
                    <div className="rounded-[18px] bg-white px-3 py-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-400">Total amount</p>
                      <p className="mt-1 text-lg font-semibold text-stone-950">
                        {formatAmount(spillOverPreview.summary.total_amount)}
                      </p>
                    </div>
                  </div>

                  <div className="mt-5 rounded-[20px] bg-white px-4 py-4">
                    <div className="flex items-center justify-between border-b border-dashed border-stone-300 pb-2 text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
                      <span>Identifier</span>
                      <span>Amount</span>
                    </div>
                    <div className="mt-3 space-y-2">
                      {spillOverPreview.rows.length ? (
                        spillOverPreview.rows.map((row, index) => (
                          <div
                            key={`${row.identifier_number}-${row.amount}-${index}`}
                            className="grid grid-cols-[1fr_auto] items-center gap-4 text-sm"
                          >
                            <span className="font-semibold text-stone-900">{row.identifier_number}</span>
                            <span className="justify-self-end font-medium tabular-nums text-stone-700">
                              {formatAmount(row.amount)}
                            </span>
                          </div>
                        ))
                      ) : (
                        <p className="text-sm text-stone-500">No approved or overkill spill over in this scope.</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
      {toast ? <AdminActionToast message={toast.message} type={toast.type} onClose={() => setToast(null)} /> : null}
    </>
  );
}
