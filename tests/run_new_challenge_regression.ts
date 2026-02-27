import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const publicDir = path.resolve(root, "public");
const htmlFiles = fs
  .readdirSync(publicDir)
  .filter((name) => name.endsWith(".html"))
  .sort();

for (const file of htmlFiles) {
  const rel = path.join("public", file);
  const html = fs.readFileSync(path.resolve(root, rel), "utf8");
  assert.match(html, /\/\?new=1/, `${rel} must include '/?new=1' for New Challenge navigation`);
}

console.log("ok");
