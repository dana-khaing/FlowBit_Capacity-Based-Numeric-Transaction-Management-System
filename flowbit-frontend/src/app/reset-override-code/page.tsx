import { ResetOverrideCodePage } from "@/components/auth/reset-override-code-page";

type ResetOverrideCodeRouteProps = {
  searchParams: Promise<{
    selector?: string;
    token?: string;
  }>;
};

export default async function ResetOverrideCodeRoute({ searchParams }: ResetOverrideCodeRouteProps) {
  const params = await searchParams;

  return <ResetOverrideCodePage selector={params.selector || ""} token={params.token || ""} />;
}
