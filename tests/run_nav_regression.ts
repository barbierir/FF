import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

const staticPages = [
  "public/index.html",
  "public/home.html",
  "public/replay.html",
  "public/challenge.html",
  "public/match.html",
  "public/profile.html",
];

for (const rel of staticPages) {
  const html = fs.readFileSync(path.resolve(root, rel), "utf8");
  assert.match(
    html,
    /id="navNewChallenge"\s+href="\/"[^>]*>New Challenge</,
    `${rel} must keep New Challenge hard-linked to /`,
  );
}

const simplePages = fs.readFileSync(path.resolve(root, "src/server/pages/simplePages.ts"), "utf8");
assert.match(
  simplePages,
  /id="navNewChallenge"\s+href="\/"[^>]*>New Challenge</,
  "simplePages layout must keep New Challenge hard-linked to /",
);

console.log("nav regression checks passed");
