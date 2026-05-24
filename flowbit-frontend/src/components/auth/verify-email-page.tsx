import { AuthShell } from "./auth-shell";
import { VerifyEmailFormCard } from "./verify-email-form-card";

type VerifyEmailPageProps = {
  selector: string;
  token: string;
};

export function VerifyEmailPage({ selector, token }: VerifyEmailPageProps) {
  return (
    <AuthShell>
      <VerifyEmailFormCard selector={selector} token={token} />
    </AuthShell>
  );
}
