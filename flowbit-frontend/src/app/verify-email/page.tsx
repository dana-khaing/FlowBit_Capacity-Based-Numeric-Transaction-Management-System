import { VerifyEmailPage } from "@/components/auth/verify-email-page";

type VerifyEmailRouteProps = {
  searchParams: Promise<{
    selector?: string;
    token?: string;
  }>;
};

export default async function VerifyEmailRoute({ searchParams }: VerifyEmailRouteProps) {
  const params = await searchParams;

  return <VerifyEmailPage selector={params.selector || ""} token={params.token || ""} />;
}
