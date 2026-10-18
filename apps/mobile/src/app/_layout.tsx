import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { DarkTheme, DefaultTheme, Stack, ThemeProvider, useTheme } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { StyleSheet, Text, useColorScheme, View } from "react-native";

import { Button } from "@/components/button";
import { apiUrl } from "@/lib/api";
import { meQueryOptions } from "@/lib/me";

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
        <RootNavigator />
      </ThemeProvider>
    </QueryClientProvider>
  );
}

function RootNavigator() {
  const me = useQuery(meQueryOptions);
  const signedOut = me.isError && me.error._tag === "Unauthorized";
  // Keep the journal open through a failed refetch, unless the session is gone.
  const signedIn = me.data !== undefined && !signedOut;

  useEffect(() => {
    if (!me.isPending) SplashScreen.hide();
  }, [me.isPending]);

  if (me.isPending) return null;
  if (!signedIn && !signedOut) return <ServerError onRetry={() => me.refetch()} />;

  return (
    <Stack>
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="index" />
        <Stack.Screen name="journal/[date]" />
      </Stack.Protected>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="sign-in" options={{ headerShown: false }} />
      </Stack.Protected>
    </Stack>
  );
}

function ServerError({ onRetry }: { onRetry: () => void }) {
  const { colors } = useTheme();

  return (
    <View style={[styles.serverError, { backgroundColor: colors.background }]}>
      <Text style={[styles.message, { color: colors.text }]}>
        Couldn't reach the server at {apiUrl}. Is it running?
      </Text>
      <Button title="Try again" onPress={onRetry} />
    </View>
  );
}

const styles = StyleSheet.create({
  serverError: {
    flex: 1,
    justifyContent: "center",
    gap: 16,
    padding: 24,
  },
  message: {
    fontSize: 17,
    textAlign: "center",
  },
});
