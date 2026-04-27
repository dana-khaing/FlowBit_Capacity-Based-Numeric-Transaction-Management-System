import { Suspense } from "react";
import { AdminAuditLogsPage } from "@/components/admin/admin-audit-logs-page";

export default function AuditLogsAdminRoute() {
  return (
    <Suspense fallback={null}>
      <AdminAuditLogsPage />
    </Suspense>
  );
}
