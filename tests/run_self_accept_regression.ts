import { rm } from "node:fs/promises";
import path from "node:path";

process.env.NODE_ENV = "development";

const dataDir = path.resolve(process.cwd(), "data", "faf");
await rm(dataDir, { recursive: true, force: true });

const { createApiServer } = await import("../src/server/index.ts");

async function main(): Promise<void> {
  const server = createApiServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Could not determine test server address");
  }

  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    const createResp = await fetch(`${baseUrl}/api/challenges`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        creatureA: { classKey: "goblin", cosmeticSeed: 111 },
        playerId: "self_accept_player",
      }),
    });
    if (!createResp.ok) throw new Error(`create failed: ${createResp.status}`);
    const created = (await createResp.json()) as { token: string };

    const selfAccept = await fetch(`${baseUrl}/api/challenges/${encodeURIComponent(created.token)}/accept`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        creatureB: { classKey: "dragon", cosmeticSeed: 222 },
        playerId: "self_accept_player",
      }),
    });

    if (selfAccept.status !== 403) {
      throw new Error(`expected self-accept to be forbidden (403), got ${selfAccept.status}`);
    }

    const payload = (await selfAccept.json()) as { error?: { code?: string } };
    if (payload.error?.code !== "self_accept_forbidden") {
      throw new Error(`unexpected error code: ${payload.error?.code}`);
    }

    console.log("ok");
  } finally {
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
}

await main();
