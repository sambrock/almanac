import { useQueryClient } from "@tanstack/react-query";
import { useTheme } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, TextInput } from "react-native";
import { WebsocketProvider } from "y-websocket";
import * as Y from "yjs";

import { JournalSyncSocket, journalSyncUrl } from "@/lib/journal";
import { applyTextChange } from "@/lib/journal-text";
import { meQueryOptions } from "@/lib/me";

// Edits the entry for `date`. Remount it (with `key`) to switch dates.
export function JournalEditor({ date }: { date: string }) {
  const queryClient = useQueryClient();
  const { colors } = useTheme();
  const [body, setBody] = useState<Y.Text>();
  const [text, setText] = useState("");
  const [closed, setClosed] = useState(false);

  useEffect(() => {
    const doc = new Y.Doc();
    const docBody = doc.getText("body");
    docBody.observe(() => setText(docBody.toString()));

    // disableBc: there are no other tabs to share with, and lib0's stand-in
    // BroadcastChannel needs Node's Buffer.
    const provider = new WebsocketProvider(journalSyncUrl, date, doc, {
      WebSocketPolyfill: JournalSyncSocket,
      disableBc: true,
    });
    // Accept typing only once the server's copy has arrived. Text typed into
    // the empty document would merge in at the start of the saved entry.
    provider.once("sync", () => setBody(docBody));
    // The server closed the socket for good, most likely because the session ended.
    provider.on("closed", () => {
      setClosed(true);
      queryClient.invalidateQueries(meQueryOptions);
    });

    return () => {
      provider.destroy();
      doc.destroy();
    };
  }, [date, queryClient]);

  return (
    <TextInput
      multiline
      // The screen scrolls instead, so the header and keyboard insets apply.
      scrollEnabled={false}
      editable={body !== undefined && !closed}
      value={text}
      onChangeText={(next) => body && applyTextChange(body, next)}
      placeholder={
        closed ? "Couldn't open this entry." : body ? "What happened today?" : "Loading…"
      }
      style={[styles.input, { color: colors.text }]}
    />
  );
}

const styles = StyleSheet.create({
  input: {
    flexGrow: 1,
    fontSize: 17,
    lineHeight: 28,
    paddingHorizontal: 20,
    paddingVertical: 16,
    textAlignVertical: "top",
  },
});
