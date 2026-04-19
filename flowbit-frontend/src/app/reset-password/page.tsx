import { ResetPasswordPage } from "@/components/auth/reset-password-page";

type ResetPasswordRouteProps = {
  searchParams: Promise<{
    selector?: string;
    token?: string;
  }>;
};

export default async function ResetPasswordRoute({ searchParams }: ResetPasswordRouteProps) {
  const params = await searchParams;

  return <ResetPasswordPage selector={params.selector || ""} token={params.token || ""} />;
}
