"use client";

import { useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faDownload,
  faFilePdf,
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

function getCollaboratorDisplayName(collaborator: FlowBitCollaborator) {
  return collaborator.full_name.trim() || collaborator.username;
}

export default function ExportSpillOverPage() {
  const [collaborators, setCollaborators] = useState<FlowBitCollaborator[]>([]);
  const [selectedCollaboratorId, setSelectedCollaboratorId] = useState("all");
  const [preview, setPreview] = useState<FlowBitSpillOverExportPreview | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState>(null);
  const [isDownloading, setIsDownloading] = useState(false);

  const { activePeriod, hasActivePeriod, isLoading: isPeriodLoading, error: periodError } = usePeriodState();

  useEffect(() => {
    if (!hasActivePeriod || !activePeriod) {
      setCollaborators([]);
      setPreview(null);
      setIsLoading(false);
      return;
    }

    let isMounted = true;
    setIsLoading(true);

    Promise.all([
      fetchCollaborators(),
      fetchSpillOverExportPreview({
        periodId: activePeriod.id,
        collaboratorId: selectedCollaboratorId,
      }),
    ])
      .then(([collaboratorRows, previewPayload]) => {
        if (!isMounted) {
          return;
        }
        setCollaborators(
          collaboratorRows.slice().sort((left, right) =>
            getCollaboratorDisplayName(left).localeCompare(getCollaboratorDisplayName(right)),
          ),
        );
        setPreview(previewPayload);
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
  }, [activePeriod?.id, hasActivePeriod, selectedCollaboratorId]);

  const summaryCards = useMemo(
    () => [
      {
        label: "Identifiers",
        value: String(preview?.summary.identifier_count ?? 0),
      },
      {
        label: "Approved",
        value: formatAmount(preview?.summary.approved_total ?? "0.00"),
      },
      {
        label: "Overkill",
        value: formatAmount(preview?.summary.overkill_total ?? "0.00"),
      },
      {
        label: "Total",
        value: formatAmount(preview?.summary.total_amount ?? "0.00"),
      },
    ],
    [preview],
  );

  async function handleDownloadPdf() {
    if (!activePeriod) {
      return;
    }
    setIsDownloading(true);
    try {
      const file = await downloadSpillOverExportPdf({
        periodId: activePeriod.id,
        collaboratorId: selectedCollaboratorId,
      });
      downloadBlob(file.blob, file.filename);
      setToast({ type: "success", message: "Spill-over PDF downloaded." });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Request failed.";
      setToast({ type: "error", message });
    } finally {
      setIsDownloading(false);
    }
  }

  function handlePrint() {
    window.print();
  }

  return (
    <>
      <AppSectionPage
        eyebrow="Exports"
        title="Export spill over"
        description=""
        workspaceLabel="Export spill over"
        aside={
          <aside className="print:hidden rounded-[28px] border border-stone-900/8 bg-[#f3f0ea] p-5 shadow-[0_8px_24px_rgba(28,24,20,0.03)] sm:p-6">
            <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-stone-400">Collaborators</p>
            <div className="mt-4 space-y-2">
              <button
                type="button"
                onClick={() => setSelectedCollaboratorId("all")}
                className={`w-full rounded-[18px] px-4 py-3 text-left text-sm font-medium transition ${
                  selectedCollaboratorId === "all"
                    ? "bg-stone-950 text-white"
                    : "bg-white text-stone-700 hover:bg-stone-100"
                }`}
              >
                All collaborators
              </button>
              {collaborators.map((collaborator) => (
                <button
                  key={collaborator.id}
                  type="button"
                  onClick={() => setSelectedCollaboratorId(String(collaborator.id))}
                  className={`w-full rounded-[18px] px-4 py-3 text-left text-sm font-medium transition ${
                    selectedCollaboratorId === String(collaborator.id)
                      ? "bg-stone-950 text-white"
                      : "bg-white text-stone-700 hover:bg-stone-100"
                  }`}
                >
                  {getCollaboratorDisplayName(collaborator)}
                </button>
              ))}
            </div>
          </aside>
        }
      >
        {isPeriodLoading || isLoading ? (
          <div className="print:hidden rounded-[24px] border border-dashed border-stone-300 bg-stone-50 px-5 py-10 text-sm text-stone-500">
            Loading spill-over export.
          </div>
        ) : periodError ? (
          <div className="print:hidden rounded-[24px] border border-rose-200 bg-rose-50 px-5 py-5 text-sm text-rose-700">
            {periodError}
          </div>
        ) : !hasActivePeriod ? (
          <div className="print:hidden rounded-[24px] border border-dashed border-amber-300 bg-amber-50 px-5 py-5 text-sm text-amber-800">
            Open a period first before exporting spill over.
          </div>
        ) : pageError ? (
          <div className="print:hidden rounded-[24px] border border-rose-200 bg-rose-50 px-5 py-5 text-sm text-rose-700">
            {pageError}
          </div>
        ) : preview ? (
          <div className="space-y-5">
            <div className="print:hidden flex flex-wrap items-center gap-3 rounded-[22px] border border-stone-900/8 bg-stone-50 px-4 py-3">
              <div className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">
                <FontAwesomeIcon icon={faUsers} className="h-3.5 w-3.5 text-stone-400" />
                {preview.collaborator_label}
              </div>
              <div className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">
                <FontAwesomeIcon icon={faTriangleExclamation} className="h-3.5 w-3.5 text-stone-400" />
                {preview.period_label}
              </div>
              <div className="ml-auto flex flex-wrap gap-2">
                <Button variant="outline" className="rounded-[18px]" onClick={handleDownloadPdf}>
                  <FontAwesomeIcon icon={faFilePdf} className="h-3.5 w-3.5" />
                  PDF
                </Button>
                <Button className="rounded-[18px]" onClick={handlePrint}>
                  <FontAwesomeIcon icon={faPrint} className="h-3.5 w-3.5" />
                  Print
                </Button>
              </div>
            </div>

            <div className="print:hidden grid gap-4 lg:grid-cols-4">
              {summaryCards.map((card) => (
                <article
                  key={card.label}
                  className="rounded-[24px] border border-stone-900/8 bg-white px-5 py-5 shadow-[0_8px_24px_rgba(28,24,20,0.04)]"
                >
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-400">
                    {card.label}
                  </p>
                  <p className="mt-2 text-3xl font-semibold text-stone-950">{card.value}</p>
                </article>
              ))}
            </div>

            <div className="receipt-print-card mx-auto max-w-[440px] rounded-[28px] border border-dashed border-stone-300 bg-stone-50 p-5 text-stone-900 print:max-w-none print:rounded-none print:border-0 print:bg-white print:p-0">
              <div className="text-center">
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-stone-500">
                  Spill over export
                </p>
                <p className="mt-2 text-xl font-semibold text-stone-950">
                  {preview.collaborator_label}
                </p>
                <p className="mt-1 text-sm text-stone-500">{preview.period_label}</p>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-[18px] bg-white px-3 py-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-400">Identifiers</p>
                  <p className="mt-1 text-lg font-semibold text-stone-950">{preview.summary.identifier_count}</p>
                </div>
                <div className="rounded-[18px] bg-white px-3 py-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-400">Total</p>
                  <p className="mt-1 text-lg font-semibold text-stone-950">
                    {formatAmount(preview.summary.total_amount)}
                  </p>
                </div>
                <div className="rounded-[18px] bg-white px-3 py-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-400">Approved</p>
                  <p className="mt-1 text-lg font-semibold text-stone-950">
                    {formatAmount(preview.summary.approved_total)}
                  </p>
                </div>
                <div className="rounded-[18px] bg-white px-3 py-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-400">Overkill</p>
                  <p className="mt-1 text-lg font-semibold text-stone-950">
                    {formatAmount(preview.summary.overkill_total)}
                  </p>
                </div>
              </div>

              <div className="mt-5 rounded-[20px] bg-white px-4 py-4">
                <div className="flex items-center justify-between border-b border-dashed border-stone-300 pb-2 text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
                  <span>Identifier</span>
                  <span>Amount</span>
                </div>
                <div className="mt-3 space-y-2">
                  {preview.rows.length ? (
                    preview.rows.map((row) => (
                      <div key={row.identifier_number} className="flex items-center justify-between gap-3 text-sm">
                        <span className="font-semibold text-stone-900">{row.identifier_number}</span>
                        <span className="font-medium text-stone-700">{formatAmount(row.amount)}</span>
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
      </AppSectionPage>

      <ActionLoadingModal
        open={isDownloading}
        title="Preparing spill-over PDF"
        description="Your collaborator spill-over export is being prepared for download."
      />
      {toast ? <AdminActionToast message={toast.message} type={toast.type} onClose={() => setToast(null)} /> : null}
    </>
  );
}
