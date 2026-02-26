import assert from "node:assert/strict";
import { once } from "node:events";
import { createApiServer } from "../src/server/index.ts";

async function getText(url: string): Promise<string> {
  const res = await fetch(url);
  assert.equal(res.status, 200, `Expected 200 from ${url}, got ${res.status}`);
  return res.text();
}

async function main(): Promise<void> {
  const server = createApiServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Could not determine server address");
  }

  const base = `http://127.0.0.1:${address.port}`;

  const matchPage = await getText(`${base}/m/test`);
  assert.ok(matchPage.includes("<title>Submit Moves</title>"), "Expected /m/:id to serve match.html");

  const replayPage = await getText(`${base}/replay/test`);
  assert.ok(replayPage.includes("<title>Replay</title>"), "Expected /replay/:id to serve replay.html");

  server.close();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
