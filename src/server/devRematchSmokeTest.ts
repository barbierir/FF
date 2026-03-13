import type { Move } from "../core/types.ts";
import { HttpError } from "./errors.ts";
import { createRematchFromReplay, loadChallengeForViewer, submitMovesForPlayer } from "./rematchLifecycle.ts";
import type { Store } from "./storage/store.ts";
import type { Side, StoredChallenge } from "./storage/types.ts";

type StepResult = {
  name: string;
  ok: boolean;
  details: Record<string, unknown>;
  error?: {
    message: string;
    expected?: unknown;
    actual?: unknown;
  };
};

type SmokeReport = {
  ok: boolean;
  startedAtISO: string;
  steps: StepResult[];
  artifacts: {
    replayPublicId: string | null;
    rematchToken: string | null;
    matchId: string | null;
    playerAId: string;
    playerBId: string;
    playerCId: string;
  };
};

function makeId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

async function snapshotChallenge(store: Store, challenge: StoredChallenge): Promise<Record<string, unknown>> {
  const moves = challenge.matchId ? await store.getMovesForMatch(challenge.matchId) : {};
  return {
    id: challenge.id,
    token: challenge.token,
    status: challenge.status,
    playerAId: challenge.playerAId ?? null,
    playerBId: challenge.playerBId ?? null,
    movesA: moves.A ?? null,
    movesB: moves.B ?? null,
  };
}

function failStep(name: string, details: Record<string, unknown>, message: string, expected?: unknown, actual?: unknown): StepResult {
  return {
    name,
    ok: false,
    details,
    error: { message, expected, actual },
  };
}

export async function runRematchSmokeTest(store: Store): Promise<SmokeReport> {
  const startedAtISO = new Date().toISOString();
  const playerAId = makeId("guest_a");
  const playerBId = makeId("guest_b");
  const playerCId = makeId("guest_c");
  const steps: StepResult[] = [];

  const artifacts: SmokeReport["artifacts"] = {
    replayPublicId: null,
    rematchToken: null,
    matchId: null,
    playerAId,
    playerBId,
    playerCId,
  };

  try {
    await store.getOrCreatePlayer(playerAId);
    await store.getOrCreatePlayer(playerBId);
    await store.getOrCreatePlayer(playerCId);

    const seedChallenge = await store.createChallenge({
      creatureA: { classKey: "goblin", cosmeticSeed: 101 },
      playerAId,
      expiresInHours: 2,
      mode: "manual",
    });
    const seedMatch = await store.acceptChallenge(seedChallenge.token, { classKey: "dragon", cosmeticSeed: 202 }, playerBId);

    let seededFinal = await store.getMatch(seedMatch.id);
    for (let turn = 0; turn < 30 && seededFinal?.status !== "finished"; turn += 1) {
      const submitA = await store.submitTurnAction(seedMatch.id, "A", { type: "ATTACK", gas: 1 });
      if (submitA.status === "finished") break;
      const submitB = await store.submitTurnAction(seedMatch.id, "B", { type: "ATTACK", gas: 1 });
      if (submitB.status === "finished") break;
      seededFinal = await store.getMatch(seedMatch.id);
    }

    const finalizedSeed = await store.getMatch(seedMatch.id);
    if (!finalizedSeed || finalizedSeed.status !== "finished") {
      throw new Error("manual seed match did not finish");
    }
    artifacts.replayPublicId = finalizedSeed.publicId;
  } catch (error) {
    steps.push(failStep("0) Setup", { where: "seed match/replay creation" }, error instanceof Error ? error.message : "unknown setup error"));
    return { ok: false, startedAtISO, steps, artifacts };
  }

  if (!artifacts.replayPublicId) {
    steps.push(failStep("0) Setup", { where: "seed replay" }, "replayPublicId missing", "non-empty replay id", artifacts.replayPublicId));
    return { ok: false, startedAtISO, steps, artifacts };
  }

  steps.push({
    name: "0) Setup",
    ok: true,
    details: { replayPublicId: artifacts.replayPublicId, playerAId, playerBId, playerCId },
  });

  let rematch: StoredChallenge;
  try {
    const first = await createRematchFromReplay(store, artifacts.replayPublicId, playerAId, "A");
    const second = await createRematchFromReplay(store, artifacts.replayPublicId, playerAId, "A");
    artifacts.rematchToken = first.token;
    if (first.token !== second.token) {
      steps.push(
        failStep(
          "1) Rematch idempotency",
          { token1: first.token, token2: second.token, function: "createRematchFromReplay" },
          "rematch token changed between identical requests",
          "same token for both calls",
          { token1: first.token, token2: second.token },
        ),
      );
      return { ok: false, startedAtISO, steps, artifacts };
    }
    rematch = first;
    steps.push({ name: "1) Rematch idempotency", ok: true, details: { token1: first.token, token2: second.token } });
  } catch (error) {
    steps.push(failStep("1) Rematch idempotency", { function: "createRematchFromReplay" }, error instanceof Error ? error.message : "unknown rematch error"));
    return { ok: false, startedAtISO, steps, artifacts };
  }

  try {
    const beforeJoin = await store.getChallengeByToken(rematch.token);
    const joined = await loadChallengeForViewer(store, rematch.token, playerBId);
    const challengeAfterB = await store.getChallengeByToken(rematch.token);

    let thirdPartyRejected = false;
    let thirdPartyResult: Record<string, unknown> = {};
    try {
      await loadChallengeForViewer(store, rematch.token, playerCId);
      thirdPartyResult = { accepted: true };
    } catch (error) {
      if (error instanceof HttpError) {
        thirdPartyRejected = error.status === 403;
        thirdPartyResult = { accepted: false, status: error.status, code: error.code, message: error.message };
      } else {
        thirdPartyResult = { accepted: false, error: error instanceof Error ? error.message : "unknown error" };
      }
    }

    const unchangedAfterThird = await store.getChallengeByToken(rematch.token);

    if (!joined.playerBId || joined.playerBId !== playerBId) {
      steps.push(
        failStep(
          "2) Join-on-view",
          {
            before: beforeJoin ? await snapshotChallenge(store, beforeJoin) : null,
            after: challengeAfterB ? await snapshotChallenge(store, challengeAfterB) : null,
            function: "loadChallengeForViewer",
          },
          "playerBId was not bound on challenge view",
          playerBId,
          joined.playerBId,
        ),
      );
      return { ok: false, startedAtISO, steps, artifacts };
    }

    if (!thirdPartyRejected) {
      steps.push(
        failStep(
          "2) Join-on-view",
          {
            thirdPartyResult,
            stateAfterThirdParty: unchangedAfterThird ? await snapshotChallenge(store, unchangedAfterThird) : null,
            function: "joinChallengeIfEligible",
          },
          "third-party viewer was not blocked",
          "403 challenge_forbidden",
          thirdPartyResult,
        ),
      );
      return { ok: false, startedAtISO, steps, artifacts };
    }

    steps.push({
      name: "2) Join-on-view",
      ok: true,
      details: {
        playerBBefore: beforeJoin?.playerBId ?? null,
        playerBAfter: challengeAfterB?.playerBId ?? null,
        thirdPartyResult,
      },
    });
  } catch (error) {
    steps.push(failStep("2) Join-on-view", { function: "loadChallengeForViewer" }, error instanceof Error ? error.message : "unknown join error"));
    return { ok: false, startedAtISO, steps, artifacts };
  }

  try {
    const accepted = await store.acceptChallenge(rematch.token, { classKey: "troll", cosmeticSeed: 303 }, playerBId);
    artifacts.matchId = accepted.id;

    if (accepted.mode === "manual") {
      const submitA = await store.submitTurnAction(accepted.id, "A", { type: "ATTACK", gas: 1 });
      const submitB = await store.submitTurnAction(accepted.id, "B", { type: "HEAL" });
      const refreshed = await store.getMatch(accepted.id);
      const history = refreshed?.turnHistoryJson ? JSON.parse(refreshed.turnHistoryJson) as Array<{ turn: number; A: Move; B: Move }> : [];
      const firstTurn = history[0];
      const mappedCorrectly = firstTurn?.A?.type === "ATTACK" && firstTurn?.B?.type === "HEAL";

      if (!mappedCorrectly) {
        const challengeState = await store.getChallengeByToken(rematch.token);
        steps.push(
          failStep(
            "3) Identity-based slot mapping",
            {
              submitA,
              submitB,
              history,
              challenge: challengeState ? await snapshotChallenge(store, challengeState) : null,
              function: "submitTurnAction",
            },
            "manual mode slot mapping did not follow player identity",
            { firstTurn: { A: "ATTACK", B: "HEAL" } },
            firstTurn ?? null,
          ),
        );
        return { ok: false, startedAtISO, steps, artifacts };
      }

      let finished = false;
      for (let turn = 0; turn < 30; turn += 1) {
        const aFollowUp = await store.submitTurnAction(accepted.id, "A", { type: "ATTACK", gas: 1 });
        if (aFollowUp.status === "finished") {
          finished = true;
          break;
        }
        const bFollowUp = await store.submitTurnAction(accepted.id, "B", { type: "ATTACK", gas: 1 });
        if (bFollowUp.status === "finished") {
          finished = true;
          break;
        }
      }

      if (!finished) {
        throw new Error("manual rematch did not finish within expected turns");
      }

      steps.push({
        name: "3) Identity-based slot mapping",
        ok: true,
        details: {
          mode: "manual",
          playerASubmitStatus: submitA.status,
          playerBSubmitStatus: submitB.status,
          firstTurn,
        },
      });
    } else {
      const movesA: Move[] = [{ type: "ATTACK", gas: 1 }];
      const movesB: Move[] = [{ type: "HEAL" }];

      const submitA = await submitMovesForPlayer(store, accepted.id, playerAId, movesA);
      const stateAfterA = await store.getMovesForMatch(accepted.id);

      const hintedSide: Side = "A";
      const submitB = await submitMovesForPlayer(store, accepted.id, playerBId, movesB, hintedSide);
      const stateAfterB = await store.getMovesForMatch(accepted.id);

      const aMapped = Array.isArray(stateAfterA.A) && !stateAfterA.B;
      const bMapped = Array.isArray(stateAfterB.A) && Array.isArray(stateAfterB.B);
      const sideHintIgnored = submitB.sideHintIgnored && submitB.side === "B";

      if (!aMapped || !bMapped || !sideHintIgnored) {
        const challengeState = await store.getChallengeByToken(rematch.token);
        steps.push(
          failStep(
            "3) Identity-based slot mapping",
            {
              submitA,
              submitB,
              hintedSide,
              stateAfterA,
              stateAfterB,
              challenge: challengeState ? await snapshotChallenge(store, challengeState) : null,
              function: "submitMovesForPlayer",
            },
            "move slot mapping did not follow player identity",
            { afterA: { A: "set", B: "unset" }, afterB: { A: "set", B: "set" }, submitBSide: "B" },
            { stateAfterA, stateAfterB, submitBSide: submitB.side },
          ),
        );
        return { ok: false, startedAtISO, steps, artifacts };
      }

      steps.push({
        name: "3) Identity-based slot mapping",
        ok: true,
        details: {
          mode: "auto",
          playerASubmitResolvedSide: submitA.side,
          playerBSubmitResolvedSide: submitB.side,
          intentionallyWrongSideHint: hintedSide,
          slotsAfterA: { movesASet: Boolean(stateAfterA.A), movesBSet: Boolean(stateAfterA.B) },
          slotsAfterB: { movesASet: Boolean(stateAfterB.A), movesBSet: Boolean(stateAfterB.B) },
        },
      });
    }
  } catch (error) {
    steps.push(failStep("3) Identity-based slot mapping", { function: "submission" }, error instanceof Error ? error.message : "unknown submit error"));
    return { ok: false, startedAtISO, steps, artifacts };
  }

  try {
    const match = artifacts.matchId ? await store.getMatch(artifacts.matchId) : undefined;
    const payload = artifacts.matchId ? await store.getFinalizedPayload(artifacts.matchId) : undefined;
    if (!match || match.status !== "finished") {
      const challenge = await store.getChallengeByToken(rematch.token);
      steps.push(
        failStep(
          "4) Finalization",
          {
            matchId: artifacts.matchId,
            matchStatus: match?.status,
            challenge: challenge ? await snapshotChallenge(store, challenge) : null,
            function: "finalizeMatchIfReady",
          },
          "match did not finalize after both moves",
          "finished",
          match?.status,
        ),
      );
      return { ok: false, startedAtISO, steps, artifacts };
    }

    steps.push({
      name: "4) Finalization",
      ok: true,
      details: {
        matchId: match.id,
        matchStatus: match.status,
        replayPublicId: match.publicId,
        outcome: payload?.summary ?? null,
      },
    });
  } catch (error) {
    steps.push(failStep("4) Finalization", { function: "finalizeMatchIfReady" }, error instanceof Error ? error.message : "unknown finalize error"));
    return { ok: false, startedAtISO, steps, artifacts };
  }

  return { ok: true, startedAtISO, steps, artifacts };
}
