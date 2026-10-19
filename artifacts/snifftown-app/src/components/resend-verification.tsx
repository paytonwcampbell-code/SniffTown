import { useState } from "react";
import { useResendVerificationEmail } from "@workspace/api-client-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** Lets a member request a fresh verification link, e.g. after one expires. */
export function ResendVerificationForm({ initialEmail = "" }: { initialEmail?: string }) {
  const [email, setEmail] = useState(initialEmail);
  const resend = useResendVerificationEmail();
  const error = (resend.error as { data?: { error?: unknown } } | null)?.data?.error;

  return (
    <form
      className="flex flex-col gap-2 pt-2"
      onSubmit={(event) => {
        event.preventDefault();
        resend.mutate({ data: { email: email.trim() } });
      }}
    >
      <label htmlFor="resend-email" className="text-sm font-medium text-foreground">Need a new verification link?</label>
      <Input id="resend-email" type="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={(event) => setEmail(event.target.value)} />
      <Button type="submit" variant="secondary" disabled={resend.isPending || !email.trim()}>
        {resend.isPending ? "Sending…" : "Email me a new link"}
      </Button>
      {resend.isSuccess && <p className="text-sm text-muted-foreground">{resend.data.message}</p>}
      {resend.isError && <p className="text-sm text-destructive">{typeof error === "string" ? error : "We couldn't send a new link. Please try again."}</p>}
    </form>
  );
}
