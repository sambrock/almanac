import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTheme } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, StyleSheet, Text, TextInput } from "react-native";

import { Button } from "@/components/button";
import { authClient } from "@/lib/api";
import { refreshSession, signIn } from "@/lib/me";

export default function SignInScreen() {
  const queryClient = useQueryClient();
  const { colors } = useTheme();
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
    mutationFn: () => signIn(email, otp),
    onSuccess: () => refreshSession(queryClient),
  });

  const inputStyle = [styles.input, { borderColor: colors.border, color: colors.text }];
  const submit = step === "email" ? sendCode : verify;

  return (
    <KeyboardAvoidingView
      behavior="padding"
      style={[styles.screen, { backgroundColor: colors.background }]}
    >
      <Text style={[styles.title, { color: colors.text }]}>
        {step === "email" ? "Sign in" : "Enter your code"}
      </Text>
      <Text style={[styles.description, { color: colors.text }]}>
        {step === "email"
          ? "We'll email you a 6-digit code."
          : `Sent to ${email}. Locally, check the server log, or use DEV_OTP_CODE if it's set.`}
      </Text>

      {step === "email" ? (
        <TextInput
          key="email"
          autoFocus
          placeholder="Email"
          autoCapitalize="none"
          autoComplete="email"
          autoCorrect={false}
          keyboardType="email-address"
          textContentType="emailAddress"
          returnKeyType="send"
          value={email}
          onChangeText={setEmail}
          onSubmitEditing={() => sendCode.mutate()}
          style={inputStyle}
        />
      ) : (
        <TextInput
          key="code"
          autoFocus
          placeholder="Code"
          autoComplete="one-time-code"
          keyboardType="number-pad"
          textContentType="oneTimeCode"
          maxLength={6}
          value={otp}
          onChangeText={setOtp}
          style={inputStyle}
        />
      )}

      {submit.isError && (
        <Text style={[styles.error, { color: colors.notification }]}>{submit.error.message}</Text>
      )}

      {step === "email" ? (
        <Button
          title={sendCode.isPending ? "Sending…" : "Send code"}
          disabled={sendCode.isPending || email === ""}
          onPress={() => sendCode.mutate()}
        />
      ) : (
        <>
          <Button
            title={verify.isPending ? "Signing in…" : "Sign in"}
            disabled={verify.isPending || otp.length < 6}
            onPress={() => verify.mutate()}
          />
          <Button
            variant="plain"
            title="Use a different email"
            onPress={() => {
              setOtp("");
              verify.reset();
              setStep("email");
            }}
          />
        </>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    justifyContent: "center",
    gap: 16,
    padding: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
  },
  description: {
    fontSize: 15,
    opacity: 0.6,
  },
  input: {
    borderRadius: 10,
    borderWidth: 1,
    fontSize: 17,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  error: {
    fontSize: 15,
  },
});
