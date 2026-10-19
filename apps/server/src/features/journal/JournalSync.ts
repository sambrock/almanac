import { Effect, Option, PubSub, Schema } from "effect";
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/http";
import { Socket } from "effect/socket";
import * as decoding from "lib0/decoding";
import * as syncProtocol from "y-protocols/sync";

import { AppConfig } from "../../config/AppConfig.ts";
import { BetterAuth } from "../auth/BetterAuth.ts";
import { sessionUser } from "../auth/sessionUser.ts";
import { JournalEntries } from "./JournalEntries.ts";
import { JournalDate } from "./JournalEntry.ts";
import {
  entryRoom,
  JournalRelay,
  messageSync,
  publishUpdate,
  syncMessage,
} from "./JournalRelay.ts";

// Message type for awareness in the y-websocket wire protocol.
const messageAwareness = 1;

// y-websocket clients connect to `/journal/sync/<date>`, one socket per open
// entry. Every message is relayed to all sockets on the same entry, including
// the sender: Yjs ignores updates it has already seen, and clients count their
// own awareness echoes as proof the connection is alive.
export const JournalSyncRoutes = HttpRouter.use((router) =>
  Effect.gen(function* () {
    const auth = yield* BetterAuth;
    const entries = yield* JournalEntries;
    const { webOrigin } = yield* AppConfig;
    const relay = yield* JournalRelay;

    yield* router.add(
      "GET",
      "/journal/sync/:date",
      Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest;
        const date = yield* HttpRouter.params.pipe(
          Effect.map((params) => params.date),
          Effect.flatMap(Schema.decodeUnknownEffect(JournalDate)),
          Effect.option,
        );
        const user = yield* sessionUser(auth, new Headers(request.headers));

        const socket = yield* Effect.orDie(request.upgrade);
        // Acquiring the reader completes the handshake. Writes wait until it has.
        const pull = yield* Effect.orDie(Socket.readerBytes(socket));
        const writer = yield* socket.writer;

        // Close codes 4400-4499 tell y-websocket to stop reconnecting.
        // A cookie socket must come from the web app, so other sites can't
        // ride the session cookie. Browsers can't set Authorization on a
        // WebSocket, so a socket that sends one is the mobile app, which
        // sends the API's own origin.
        const bearer = request.headers.authorization !== undefined;
        if (!bearer && request.headers.origin !== webOrigin) {
          yield* writer.write(new Socket.CloseEvent(4403, "Origin not allowed"));
          return HttpServerResponse.empty();
        }
        if (Option.isNone(user)) {
          yield* writer.write(new Socket.CloseEvent(4401, "Not signed in"));
          return HttpServerResponse.empty();
        }
        if (Option.isNone(date)) {
          yield* writer.write(new Socket.CloseEvent(4400, "Invalid date"));
          return HttpServerResponse.empty();
        }

        const { userId } = user.value;
        const room = entryRoom(userId, date.value);

        // Subscribe before reading the stored state, so no update published
        // in between is missed.
        const subscription = yield* PubSub.subscribe(relay);
        yield* PubSub.take(subscription).pipe(
          Effect.flatMap((relayed) =>
            relayed.room === room ? writer.write(relayed.message) : Effect.void,
          ),
          Effect.forever,
          Effect.forkScoped,
        );

        // Ask the client for anything the server is missing, such as edits
        // made while it was offline.
        const { result: step1 } = yield* entries.withDoc(userId, date.value, (doc) =>
          syncMessage((encoder) => syncProtocol.writeSyncStep1(encoder, doc)),
        );
        yield* writer.write(step1);

        const handleMessage = Effect.fnUntraced(function* (message: Uint8Array) {
          const decoder = decoding.createDecoder(message);
          const messageType = decoding.readVarUint(decoder);

          if (messageType === messageAwareness) {
            return yield* PubSub.publish(relay, { room, message });
          }
          if (messageType !== messageSync) return;

          const { result: reply, update } = yield* entries.withDoc(userId, date.value, (doc) =>
            syncMessage((encoder) => syncProtocol.readSyncMessage(decoder, encoder, doc, null)),
          );
          // A reply holding only the message type header means there's nothing to send.
          if (reply.length > 1) yield* writer.write(reply);
          if (Option.isSome(update)) yield* publishUpdate(room, update.value);
        });

        yield* pull.pipe(
          Effect.flatMap((messages) => Effect.forEach(messages, handleMessage, { discard: true })),
          Effect.forever,
          Effect.catchReason("SocketError", "SocketCloseError", () => Effect.void),
          Effect.orDie,
        );
        return HttpServerResponse.empty();
      }),
    );
  }),
);
