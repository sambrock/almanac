import { useQueryClient } from "@tanstack/react-query";
import { Redirect, Stack, router, useLocalSearchParams } from "expo-router";
import { ScrollView, StyleSheet, View } from "react-native";

import { Button } from "@/components/button";
import { JournalEditor } from "@/components/journal-editor";
import { addDays, formatJournalDate, isJournalDate, today } from "@/lib/journal";
import { signOut } from "@/lib/me";

export default function JournalScreen() {
  const { date } = useLocalSearchParams<"/journal/[date]">();
  const queryClient = useQueryClient();

  if (!isJournalDate(date)) {
    return <Redirect href={{ pathname: "/journal/[date]", params: { date: today() } }} />;
  }

  return (
    // On iOS 26 and later the header is see-through glass and the screen
    // starts under it. A scroll view with automatic insets moves the content
    // below the header and above the keyboard.
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      automaticallyAdjustKeyboardInsets
      keyboardDismissMode="interactive"
      contentContainerStyle={styles.content}
    >
      <Stack.Screen
        options={{
          title: formatJournalDate(date),
          headerRight: () => (
            <Button variant="plain" title="Sign out" onPress={() => signOut(queryClient)} />
          ),
        }}
      />
      <View style={styles.days}>
        <Button
          variant="plain"
          title="‹ Previous"
          onPress={() => router.setParams({ date: addDays(date, -1) })}
        />
        <Button
          variant="plain"
          title="Today"
          disabled={date === today()}
          onPress={() => router.setParams({ date: today() })}
        />
        <Button
          variant="plain"
          title="Next ›"
          onPress={() => router.setParams({ date: addDays(date, 1) })}
        />
      </View>
      <JournalEditor key={date} date={date} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
  },
  days: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 4,
  },
});
