import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetCurrentUserQueryKey,
  getListDogsQueryKey,
  useCompleteEmailVerification,
} from "@workspace/api-client-react";
import { AlertCircle, Loader2, MailCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ResendVerificationForm } from "@/components/resend-verification";

type LinkResult =
  | { kind: "session"; accessToken: string; refreshToken: string }
  | { kind: "error"; message: string }
  | { kind: "none" };

/**
 * Supabase sends members back from the verification email with the new
 * session (or an error) in the URL fragment, and sometimes the query string.
 */
export function readVerificationLink(hash: string, search: string): LinkResult {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  const query = new URLSearchParams(search.replace(/^\?/, ""));
  const accessToken = params.get("access_token");
  const refreshToken = params.get("refresh_token");
  if (accessToken && refreshToken) {
    return { kind: "session", accessToken, refreshToken };
  }
  const errorCode = params.get("error_code") ?? query.get("error_code");
  const error = params.get("error") ?? query.get("error");
  if (errorCode || error) {
    return {
      kind: "error",
      message:
        errorCode === "otp_expired"
          ? "This verification link has expired or was already used."
          : "This verification link didn't work.",
    };
  }
  return { kind: "none" };
}

/** True when the current URL is a Supabase email-link return that the verified page should handle. */
export function isVerificationReturn(hash: string, search: string): boolean {
  return readVerificationLink(hash, search).kind !== "none";
}

function Shell({ icon, title, description, children }: { icon: React.ReactNode; title: string; description: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center p-4">
      <Card className="w-full max-w-md border-border/50 shadow-lg">
        <CardHeader className="text-center space-y-4">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary">{icon}</div>
          <CardTitle className="font-display text-2xl">{title}</CardTitle>
          <CardDescription className="text-base">{description}</CardDescription>
        </CardHeader>
        {children && <CardContent className="flex flex-col gap-3">{children}</CardContent>}
      </Card>
    </div>
  );
}

export default function AuthVerified() {
  const queryClient = useQueryClient();
  const started = useRef(false);
  const [link] = useState(() => readVerificationLink(window.location.hash, window.location.search));
  const complete = useCompleteEmailVerification({
    mutation: {
      onSuccess: (data) => {
        queryClient.setQueryData(getGetCurrentUserQueryKey(), data.user);
        queryClient.invalidateQueries({ queryKey: getListDogsQueryKey() });
      },
    },
  });

  useEffect(() => {
    // Keep sign-in tokens out of the address bar and browser history.
    if (window.location.hash || window.location.search) {
      window.history.replaceState(null, "", window.location.pathname);
    }
    if (link.kind === "session" && !started.current) {
      started.current = true;
      complete.mutate({ data: { accessToken: link.accessToken, refreshToken: link.refreshToken } });
    }
  }, [link, complete]);

  if (link.kind === "session" && (complete.isIdle || complete.isPending)) {
    return <Shell icon={<Loader2 className="h-8 w-8 animate-spin" />} title="Verifying your email…" description="This only takes a moment." />;
  }

  if (link.kind === "session" && complete.isSuccess) {
    return (
      <Shell
        icon={<MailCheck className="h-8 w-8" />}
        title="You're verified!"
        description={<>Welcome to SniffTown{complete.data.user.displayName ? `, ${complete.data.user.displayName}` : ""}. You're signed in on this browser. Using the app? Head back to it and sign in.</>}
      >
        <Button asChild size="lg" className="w-full"><Link href="/dogs/new">Add your dog</Link></Button>
        <Button asChild variant="outline" className="w-full"><Link href="/">Explore SniffTown</Link></Button>
      </Shell>
    );
  }

  const message =
    link.kind === "error"
      ? link.message
      : link.kind === "session"
        ? "This verification link has expired or was already used."
        : "Open the link from your verification email to finish signing up.";

  return (
    <Shell icon={<AlertCircle className="h-8 w-8" />} title="Let's try that again" description={<>{message} If you already verified, just sign in.</>}>
      <Button asChild size="lg" className="w-full"><Link href="/auth">Sign in</Link></Button>
      <ResendVerificationForm />
    </Shell>
  );
}
