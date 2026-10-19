import assert from "node:assert/strict";
import { createServer as createHttpServer } from "node:http";
import test from "node:test";
import { createServer as createViteServer } from "vite";
import * as Y from "yjs";

test("journal bodies and previews render on the server with isolated session data", async (t) => {
  const requests: Array<{ path: string; user: string | undefined }> = [];
  const api = createHttpServer((request, response) => {
    const user = request.headers.cookie?.match(/session=(alice|bob)/)?.[1];
    requests.push({ path: request.url ?? "", user });
    response.setHeader("Content-Type", "application/json");
    response.setHeader("Access-Control-Allow-Origin", request.headers.origin ?? "http://127.0.0.1");
    response.setHeader("Access-Control-Allow-Credentials", "true");
    if (!user) {
      response.writeHead(401).end(JSON.stringify({ _tag: "Unauthorized", message: "No session" }));
      return;
    }
    if (request.url === "/me") {
      response.end(
        JSON.stringify({ id: user, email: `${user}@example.com`, name: user, emailVerified: true }),
      );
      return;
    }
    if (request.url === "/journal/entries") {
      // A slow response must still finish before the page renders.
      setTimeout(() => {
        response.end(
          JSON.stringify([
            { id: `${user}-entry`, date: "2026-10-18", title: null, preview: `${user} preview` },
          ]),
        );
      }, 50);
      return;
    }
    if (request.url === "/journal/entries/2026-10-18") {
      const doc = new Y.Doc();
      const body = `${user} saved body`;
      doc.getText("body").insert(0, body);
      const state = Buffer.from(Y.encodeStateAsUpdate(doc)).toString("base64");
      doc.destroy();
      setTimeout(() => response.end(JSON.stringify({ body, doc: state })), 50);
      return;
    }
    if (request.url === "/journal/entries/2026-10-19") {
      response.end("null");
      return;
    }
    response.writeHead(404).end("{}");
  });
  await new Promise<void>((resolve) => api.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise<void>((resolve) => api.close(() => resolve())));
  const apiAddress = api.address();
  assert.ok(apiAddress && typeof apiAddress !== "string");
  const previousApiUrl = process.env.VITE_API_URL;
  process.env.VITE_API_URL = `http://127.0.0.1:${apiAddress.port}`;
  t.after(() => {
    if (previousApiUrl === undefined) delete process.env.VITE_API_URL;
    else process.env.VITE_API_URL = previousApiUrl;
  });
  const vite = await createViteServer({
    envFile: false,
    // Start disables its HTTP middleware in the reserved "test" mode.
    mode: "ssr-test",
    logLevel: "error",
    server: { host: "127.0.0.1", port: 0 },
  });
  t.after(() => vite.close());
  await vite.listen();
  const webAddress = vite.httpServer?.address();
  assert.ok(webAddress && typeof webAddress !== "string");
  const webUrl = `http://127.0.0.1:${webAddress.port}`;

  const responses = await Promise.all(
    ["alice", "bob"].map(async (user) => {
      const response = await fetch(`${webUrl}/journal/2026-10-18`, {
        headers: { Cookie: `session=${user}` },
      });
      assert.equal(response.status, 200);
      const html = await response.text();
      const renderedHtml = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, "");
      return { user, html, renderedHtml };
    }),
  );
  for (const { user, html, renderedHtml } of responses) {
    assert.ok(renderedHtml.includes(`${user} preview`), "preview must appear in server HTML");
    assert.ok(
      renderedHtml.includes(`${user} saved body`),
      "body must appear before editor hydration",
    );
    assert.ok(html.includes("journalList"), "the generated query must be dehydrated");
    assert.ok(html.includes("journalGet"), "the entry snapshot query must be dehydrated");
    assert.ok(
      !renderedHtml.includes("What happened today?"),
      "saved entries must not show a placeholder",
    );
    assert.ok(!html.includes(`session=${user}`), "session cookies must not be dehydrated");
    const other = user === "alice" ? "bob" : "alice";
    assert.ok(!html.includes(`${other} saved body`), "requests must have separate query caches");
    assert.deepEqual(
      requests
        .filter((request) => request.user === user)
        .map((request) => request.path)
        .sort(),
      ["/journal/entries", "/journal/entries/2026-10-18", "/me"],
    );
  }

  const emptyResponse = await fetch(`${webUrl}/journal/2026-10-19`, {
    headers: { Cookie: "session=alice" },
  });
  assert.equal(emptyResponse.status, 200);
  assert.ok(!(await emptyResponse.text()).includes("alice saved body"));

  const signedOut = await fetch(`${webUrl}/journal/2026-10-18`, { redirect: "manual" });
  assert.equal(signedOut.status, 307);
  assert.equal(signedOut.headers.get("Location"), "/");
  assert.deepEqual(
    requests.filter((request) => !request.user).map((request) => request.path),
    ["/me"],
  );
});
