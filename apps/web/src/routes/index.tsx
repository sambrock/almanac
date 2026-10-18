import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Navigate, createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import { today } from "@/lib/journal";
import { meQueryOptions, refreshSession } from "@/lib/me";
import { prefetchJournal } from "@/lib/prefetch-journal";

export const Route = createFileRoute("/")({
  // Fetch on the server; let the browser decide today's journal date.
  ssr: "data-only",
  loader: ({ context }) => prefetchJournal(context.queryClient),
  component: Home,
});

function Home() {
  const me = useQuery(meQueryOptions);

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center p-6">
      {me.isPending ? (
        <p className="text-muted-foreground text-sm">Loading…</p>
      ) : me.isError && me.error._tag !== "Unauthorized" ? (
        <p className="text-destructive text-sm">
          {me.error.message ?? "Couldn't load your account"}. Is the server running?
        </p>
      ) : me.isSuccess ? (
        <Navigate to="/journal/$date" params={{ date: today() }} replace />
      ) : (
        <SignIn />
      )}
    </main>
  );
}

function SignIn() {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");

  const sendCode = useMutation({
    mutationFn: async () => {
      const { error } = await authClient.emailOtp.sendVerificationOtp({ email, type: "sign-in" });
      if (error) throw new Error(error.message ?? "Couldn't send the code");
    },
    onSuccess: () => setStep("code"),
  });

  const verify = useMutation({
    mutationFn: async () => {
      const { error } = await authClient.signIn.emailOtp({ email, otp });
      if (error) throw new Error(error.message ?? "Couldn't sign in");
    },
    onSuccess: () => refreshSession(queryClient),
  });

  if (step === "email") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Sign in</CardTitle>
          <CardDescription>We'll email you a 6-digit code.</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              sendCode.mutate();
            }}
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>
            {sendCode.isError && (
              <p className="text-destructive text-sm">{sendCode.error.message}</p>
            )}
            <Button type="submit" disabled={sendCode.isPending}>
              {sendCode.isPending ? "Sending…" : "Send code"}
            </Button>
          </form>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Enter your code</CardTitle>
        <CardDescription>
          Sent to {email}. Locally, check the server log, or use DEV_OTP_CODE if it's set.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            verify.mutate();
          }}
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="otp">Code</Label>
            <Input
              id="otp"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              required
              value={otp}
              onChange={(event) => setOtp(event.target.value)}
            />
          </div>
          {verify.isError && <p className="text-destructive text-sm">{verify.error.message}</p>}
          <Button type="submit" disabled={verify.isPending}>
            {verify.isPending ? "Signing in…" : "Sign in"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setOtp("");
              setStep("email");
            }}
          >
            Use a different email
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
