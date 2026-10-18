import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { Button } from "#/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "#/components/ui/card";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { authClient } from "#/lib/auth-client";

export const Route = createFileRoute("/")({ component: Home });

type Me = { id: string; email: string; name: string; emailVerified: boolean };

const meQueryKey = ["me"];

async function fetchMe(): Promise<Me | null> {
  const response = await fetch(`${import.meta.env.VITE_API_URL}/me`, { credentials: "include" });
  if (response.status === 401) return null;
  if (!response.ok) throw new Error(`GET /me failed with ${response.status}`);
  return response.json();
}

function Home() {
  const me = useQuery({ queryKey: meQueryKey, queryFn: fetchMe });

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center p-6">
      {me.isPending ? (
        <p className="text-muted-foreground text-sm">Loading…</p>
      ) : me.isError ? (
        <p className="text-destructive text-sm">{me.error.message}. Is the server running?</p>
      ) : me.data ? (
        <SignedIn me={me.data} />
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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: meQueryKey }),
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

function SignedIn({ me }: { me: Me }) {
  const queryClient = useQueryClient();

  const signOut = useMutation({
    mutationFn: () => authClient.signOut(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: meQueryKey }),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Signed in</CardTitle>
        <CardDescription>{me.email}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <p className="text-muted-foreground text-xs font-medium">GET /me</p>
          <pre className="bg-muted overflow-x-auto rounded-md p-3 text-xs">
            {JSON.stringify(me, null, 2)}
          </pre>
        </div>
        <Button variant="outline" disabled={signOut.isPending} onClick={() => signOut.mutate()}>
          {signOut.isPending ? "Signing out…" : "Sign out"}
        </Button>
      </CardContent>
    </Card>
  );
}
