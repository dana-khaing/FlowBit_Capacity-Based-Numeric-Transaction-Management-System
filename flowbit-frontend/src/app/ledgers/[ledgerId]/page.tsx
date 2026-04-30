import { LedgerViewPage } from "@/components/ledger/ledger-view-page";

type LedgerViewRouteProps = {
  params: Promise<{
    ledgerId: string;
  }>;
};

export default async function LedgerViewRoute({ params }: LedgerViewRouteProps) {
  const resolvedParams = await params;
  return <LedgerViewPage ledgerId={Number(resolvedParams.ledgerId)} />;
}
