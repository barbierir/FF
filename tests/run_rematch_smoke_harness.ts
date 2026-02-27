import { rm } from "node:fs/promises";
import path from "node:path";

async function main(): Promise<void> {
  const dataDir = path.resolve(process.cwd(), "data", "faf");
  await rm(dataDir, { recursive: true, force: true });

  process.env.NODE_ENV = "development";
  process.env.PORT = "3312";
  const { createApiServer } = await import("../src/server/index.ts");
  const server = createApiServer();
  await new Promise<void>((resolve) => server.listen(3312, resolve));

  try {
    const res = await fetch("http://localhost:3312/api/dev/rematch-smoke-test");
    const body = await res.json();
    if (!res.ok) {
      throw new Error(`expected smoke endpoint success, got ${res.status}: ${JSON.stringify(body)}`);
    }
    if (body.ok !== true) {
      throw new Error(`expected body.ok true, got ${JSON.stringify(body)}`);
    }
    if (!Array.isArray(body.steps) || body.steps.length < 5) {
      throw new Error(`expected detailed steps in report, got ${JSON.stringify(body)}`);
    }
    console.log("ok");
  } finally {
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
}

await main();
