import { Context, Effect, Layer, PubSub } from "effect";
import * as encoding from "lib0/encoding";
import * as syncProtocol from "y-protocols/sync";

import { UserId } from "../../domain/ids.ts";
import { JournalDate } from "./JournalEntry.ts";

// Message type for Yjs sync in the y-websocket wire protocol.
export const messageSync = 0;

export const syncMessage = (write: (encoder: encoding.Encoder) => void) => {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, messageSync);
  write(encoder);
  return encoding.toUint8Array(encoder);
};

// Carries y-websocket messages to every socket open on an entry. The room is
// `<userId>/<date>`.
export class JournalRelay extends Context.Service<
  JournalRelay,
  PubSub.PubSub<{ room: string; message: Uint8Array }>
>()("almanac/JournalRelay") {
  static readonly layer = Layer.effect(JournalRelay, PubSub.unbounded());
}

export const entryRoom = (userId: UserId, date: JournalDate) => `${userId}/${date}`;

// Sends a Yjs update to every socket open on the entry.
export const publishUpdate = Effect.fn("JournalRelay.publishUpdate")(function* (
  room: string,
  update: Uint8Array,
) {
  const relay = yield* JournalRelay;
  const message = syncMessage((encoder) => syncProtocol.writeUpdate(encoder, update));
  yield* PubSub.publish(relay, { room, message });
});
