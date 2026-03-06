import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const profileJs = fs.readFileSync(path.resolve(process.cwd(), "public/profile.js"), "utf8");

assert.match(
  profileJs,
  /const\s+acceptedChallenges\s*=\s*Array\.isArray\(mineAccepted\.items\)\s*\?\s*mineAccepted\.items\s*:\s*\[\];/,
  "Profile home state should normalize accepted challenge items as an array",
);

assert.match(
  profileJs,
  /for\s*\(const\s+acceptedChallenge\s+of\s+acceptedChallenges\)\s*\{/,
  "Profile home state should scan all accepted challenges",
);

assert.doesNotMatch(
  profileJs,
  /kind:\s*"finished"\s*,\s*\n\s*ctaLabel:\s*"Rematch"/,
  "Finished accepted challenges should not block New Challenge by returning Rematch from profile CTA",
);

assert.match(
  profileJs,
  /if\s*\(match\.status\s*!==\s*"collecting_moves"\)\s*continue;/,
  "Only collecting_moves matches should block CTA with Submit Moves",
);

console.log("profile home state regression checks passed");
