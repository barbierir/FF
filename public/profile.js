import { buildChallengeShareText, clearPlayerCreatureId, clearPlayerCreatureNickname, createChallenge, createStatusBadge, generateCreatureNickname, getCreaturePresentation, getGasRankTitle, getMatch, getMatchOpponentSummary, getMatchOutcomeLabel, getPlayerCreatureId, getPlayerCreatureNickname, getPlayerCreatureSummary, getShareableChallengeUrl, listMyChallenges, outcomeToBadgeVariant, randomSeed, renderChallengeShareActions, renderCreaturePickerGrid, renderPlayerIdentity, setPendingCreatureSelection, setPlayerCreatureId, setPlayerCreatureNickname } from "/app.js";

async function api(path, opts = {}) {
  const res = await fetch(path, opts);
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error?.message ?? `HTTP ${res.status}`);
  return json;
}

function renderCreatureSelect(container, playerId, onContinue) {
  let selectedId = getPlayerCreatureId(playerId) || "goblin";
  let selectedNickname = getPlayerCreatureNickname(playerId) || generateCreatureNickname(selectedId);

  const section = document.createElement("section");
  section.className = "card creature-select-card";

  const header = document.createElement("h2");
  header.textContent = "Creature Select";

  const grid = document.createElement("div");
  grid.className = "creature-select-grid";

  const nicknameLine = document.createElement("p");
  nicknameLine.className = "small";

  const continueBtn = document.createElement("button");
  continueBtn.textContent = "Continue";

  function syncSelection(nextId) {
    const shouldKeepNickname = nextId === selectedId && selectedNickname;
    selectedId = nextId;
    if (!shouldKeepNickname) {
      selectedNickname = generateCreatureNickname(nextId);
    }
    nicknameLine.textContent = `Nickname: ${selectedNickname}`;
    setPlayerCreatureId(playerId, selectedId);
    setPlayerCreatureNickname(playerId, selectedNickname);
    setPendingCreatureSelection({ creatureId: selectedId, nickname: selectedNickname });
    renderCreaturePickerGrid({ container: grid, selectedId, onSelect: syncSelection });
  }

  continueBtn.onclick = () => {
    setPlayerCreatureId(playerId, selectedId);
    setPlayerCreatureNickname(playerId, selectedNickname);
    onContinue(selectedId);
  };

  syncSelection(selectedId);
  section.append(header, grid, nicknameLine, continueBtn);
  container.replaceChildren(section);
}


function showSelectedCreatureLine(playerId, creatureId) {
  renderPlayerIdentity(document.getElementById("profileIdentity"), {
    playerId,
    creatureId,
    creatureNickname: getPlayerCreatureNickname(playerId),
    variant: "hero",
    showGif: true,
    showCreatureName: true,
    showNickname: true,
  });

  const button = document.getElementById("changeCreatureBtn");
  button.onclick = (event) => {
    event.preventDefault();
    clearPlayerCreatureId(playerId);
    clearPlayerCreatureNickname(playerId);
    document.getElementById("profileContent").hidden = true;
    initPlayerProfilePage(playerId);
  };
}


function createRankBadge(rankTitle) {
  const isTopTier = rankTitle.includes("👑");
  const badge = createStatusBadge({
    label: rankTitle.replace(" 👑", ""),
    variant: "rank",
    size: "md",
    extraClass: `gas-rank-badge${isTopTier ? " top-tier" : ""}`,
  });
  return badge;
}

function createResultBadge(label) {
  return createStatusBadge({
    label,
    variant: outcomeToBadgeVariant(label),
    size: "sm",
  }).outerHTML;
}

function toRecentMatchRows(recentMatches, currentPlayerId) {
  if (!recentMatches?.length) {
    return '<li>No finished matches yet.</li>';
  }
  return recentMatches
    .map((m) => {
      const opponent = getMatchOpponentSummary(m, currentPlayerId);
      const result = m.resultLabel || getMatchOutcomeLabel(m, currentPlayerId);
      return `<li><a href="/replay/${m.publicId}">${opponent.opponentPrimaryLabel}</a> · ${createResultBadge(result)} · ${opponent.opponentCreatureName}</li>`;
    })
    .join("");
}

function firstItem(items) {
  return Array.isArray(items) && items.length ? items[0] : null;
}

function createDefaultCreatureSpec(creatureId) {
  const classKey = creatureId ?? "goblin";
  return { classKey, cosmeticSeed: randomSeed() };
}

async function resolveHomeState(playerId, creatureId) {
  const [publicData, mineOpen, mineAccepted, incoming] = await Promise.all([
    api(`/api/players/${encodeURIComponent(playerId)}/public`),
    api(`/api/challenges/mine?playerId=${encodeURIComponent(playerId)}&status=open&limit=20`),
    api(`/api/challenges/mine?playerId=${encodeURIComponent(playerId)}&status=accepted&limit=20`),
    api(`/api/challenges/open?excludePlayerId=${encodeURIComponent(playerId)}&limit=20`),
  ]);

  const myOpenChallenge = (mineOpen.items ?? []).find((item) => item.playerAId === playerId) ?? null;
  if (myOpenChallenge) {
    return {
      kind: "waiting",
      ctaLabel: "New Challenge",
      statusText: "Waiting for opponent…",
      shareUrl: getShareableChallengeUrl(myOpenChallenge),
      shareMessage: buildChallengeShareText({
        challengerLabel: getPlayerCreatureNickname(playerId) || getCreaturePresentation(playerId, creatureId, null).creatureName,
      }),
      onClick: async () => {
        await createChallenge(playerId, createDefaultCreatureSpec(creatureId), creatureId);
        await refreshPlayerHome(playerId, creatureId);
      },
      recentMatches: publicData.recentMatches,
      profile: publicData.profile ?? null,
    };
  }

  const incomingChallenge = firstItem(incoming.items);
  if (incomingChallenge) {
    return {
      kind: "incoming",
      ctaLabel: "Accept Challenge",
      statusText: "Incoming challenge ready.",
      shareUrl: null,
      onClick: () => {
        location.href = `/c/${incomingChallenge.token}`;
      },
      recentMatches: publicData.recentMatches,
      profile: publicData.profile ?? null,
    };
  }

  const acceptedChallenge = firstItem(mineAccepted.items);
  if (acceptedChallenge?.token) {
    const details = await api(`/api/challenges/${encodeURIComponent(acceptedChallenge.token)}?viewerId=${encodeURIComponent(playerId)}`);
    if (details.matchId) {
      const match = await getMatch(details.matchId);
      if (match.status === "collecting_moves") {
        const side = details.playerAId === playerId ? "A" : "B";
        return {
          kind: "active",
          ctaLabel: "Submit Moves",
          statusText: "Match in progress.",
          shareUrl: null,
          onClick: () => {
            location.href = `/m/${encodeURIComponent(details.matchId)}?side=${side}`;
          },
          recentMatches: publicData.recentMatches,
          profile: publicData.profile ?? null,
        };
      }
      if (match.status === "finished") {
        const publicId = details.publicId || match.publicId;
        if (publicId) {
          return {
          kind: "finished",
          ctaLabel: "Rematch",
          statusText: "Last match finished.",
          shareUrl: null,
          onClick: () => {
            location.href = `/replay/${encodeURIComponent(publicId)}`;
          },
          recentMatches: publicData.recentMatches,
          profile: publicData.profile ?? null,
        };
        }
      }
    }
  }

  return {
    kind: "idle",
    ctaLabel: "New Challenge",
    statusText: "Ready to start a new match.",
    shareUrl: null,
    onClick: async () => {
      await createChallenge(playerId, createDefaultCreatureSpec(creatureId), creatureId);
      await refreshPlayerHome(playerId, creatureId);
    },
    recentMatches: publicData.recentMatches,
    profile: publicData.profile ?? null,
  };
}


async function resolveShareableOutgoingChallenge(playerId) {
  const mineOpen = await listMyChallenges(playerId, "open", 20);
  return (mineOpen.items ?? []).find((item) => item.playerAId === playerId) ?? null;
}

async function refreshPlayerHome(playerId, creatureId) {
  const statusEl = document.getElementById("homeStatus");
  const errorEl = document.getElementById("homeError");
  const primaryBtn = document.getElementById("primaryActionBtn");
  const shareActions = document.getElementById("shareChallengeActions");
  const shareFeedback = document.getElementById("shareFeedback");

  statusEl.textContent = "Loading...";
  errorEl.textContent = "";
  primaryBtn.disabled = true;

  try {
    const state = await resolveHomeState(playerId, creatureId);
    const outgoingChallenge = await resolveShareableOutgoingChallenge(playerId);
    const shareUrl = getShareableChallengeUrl(outgoingChallenge) || state.shareUrl || null;
    const challengerLabel = getPlayerCreatureNickname(playerId) || getCreaturePresentation(playerId, creatureId, null).creatureName;
    const shareMessage = shareUrl
      ? buildChallengeShareText({ challengerLabel, opponentLabel: outgoingChallenge?.opponentLabel || null })
      : null;
    const wins = state.profile?.wins ?? 0;
    const losses = state.profile?.losses ?? 0;
    const draws = state.profile?.draws ?? 0;
    const rankPosition = state.profile?.leaderboardRank;
    const rankTitle = getGasRankTitle(wins);

    const rank = document.querySelector(".gas-rank-badge");
    if (rank) rank.remove();
    const identityRoot = document.getElementById("profileIdentity");
    if (identityRoot) {
      identityRoot.insertAdjacentElement("afterend", createRankBadge(rankTitle));
    }

    primaryBtn.textContent = state.ctaLabel;
    primaryBtn.disabled = false;
    primaryBtn.onclick = () => void state.onClick();

    statusEl.textContent = state.statusText;
    document.getElementById("profileWins").textContent = String(wins);
    document.getElementById("profileLosses").textContent = String(losses);
    document.getElementById("profileDraws").textContent = String(draws);
    document.getElementById("profileRank").textContent = rankPosition ? `#${rankPosition}` : "—";
    renderChallengeShareActions(shareActions, {
      url: shareUrl,
      message: shareMessage || state.shareMessage,
      onCopyStateChange: (message, isError) => {
        if (!shareFeedback) return;
        shareFeedback.textContent = message;
        shareFeedback.className = isError ? "error" : "small";
      },
    });
    if (shareFeedback) {
      shareFeedback.textContent = "";
      shareFeedback.className = "small";
    }

    document.getElementById("recent").innerHTML = toRecentMatchRows(state.recentMatches, playerId);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    statusEl.textContent = "Could not load home state.";
    errorEl.textContent = message;
    primaryBtn.disabled = true;
  }
}

export async function initPlayerProfilePage(playerId) {
  const flow = document.getElementById("creatureFlow");
  const profileContent = document.getElementById("profileContent");
  const selected = getPlayerCreatureId(playerId);

  if (!selected) {
    profileContent.hidden = true;
    renderCreatureSelect(flow, playerId, async (creatureId) => {
      showSelectedCreatureLine(playerId, creatureId);
      flow.replaceChildren();
      profileContent.hidden = false;
      await refreshPlayerHome(playerId, creatureId);
    });
    return;
  }

  showSelectedCreatureLine(playerId, selected);
  flow.replaceChildren();
  profileContent.hidden = false;
  await refreshPlayerHome(playerId, selected);
}

export async function apiLeaderboardGlobal() {
  const data = await api("/api/leaderboard/global");
  const empty = document.getElementById("leaderboardEmpty");
  const rows = data.rows ?? [];
  if (!rows.length) {
    empty.hidden = false;
    document.getElementById("rows").innerHTML = "";
    return;
  }
  empty.hidden = true;
  document.getElementById("rows").innerHTML = rows
    .map((r) => {
      const summary = getPlayerCreatureSummary({ playerId: r.playerId, creatureId: r.creatureId, creatureNickname: r.creatureNickname });
      return `<tr><td><span class="status-badge status-badge--rank status-badge--sm">#${r.rank}</span></td><td><a href="/p/${encodeURIComponent(r.playerId)}" class="leaderboard-identity" data-player-id="${r.playerId}" data-creature-id="${summary.creatureId || ""}" data-creature-nickname="${summary.creatureNickname || ""}"></a></td><td>${summary.creatureName}</td><td>${r.wins}</td><td>${r.losses}</td><td>${r.draws}</td><td>${r.played}</td></tr>`;
    })
    .join("");

  document.getElementById("rows").querySelectorAll("[data-player-id]").forEach((node) => {
    const id = node.getAttribute("data-player-id");
    if (!id) return;
    renderPlayerIdentity(node, {
      playerId: id,
      creatureId: node.getAttribute("data-creature-id") || null,
      creatureNickname: node.getAttribute("data-creature-nickname") || null,
      variant: "compact",
      showGif: true,
      showCreatureName: true,
      showNickname: true,
    });
  });
}

export async function apiRivalry(playerA, playerB) {
  const data = await api(`/api/rivalry/${encodeURIComponent(playerA)}/${encodeURIComponent(playerB)}`);
  const playerALabel = getPlayerCreatureNickname(playerA) || "Player A";
  const playerBLabel = getPlayerCreatureNickname(playerB) || "Player B";
  document.getElementById("stats").textContent = `Matches ${data.totalMatches} · ${playerALabel} W${data.winsA} · ${playerBLabel} W${data.winsB} · Damage ${data.totalDamageA}/${data.totalDamageB}`;
  document.getElementById("matches").innerHTML = data.matches.map((publicId) => `<li><a href="/replay/${publicId}">${publicId}</a></li>`).join("");
}

export async function apiDaily() {
  const dailyEl = document.getElementById("daily");
  const dailyBadge = createStatusBadge({ label: "Daily", variant: "daily", size: "sm" }).outerHTML;

  try {
    const data = await api("/api/daily-highlight");
    const fallbackPresentation = getCreaturePresentation(data.playerId, data.playerCreatureId ?? null, null);
    const challengerLabel = (data.playerCreatureNickname || "").trim() || fallbackPresentation.creatureName || "Mystery Challenger";
    const valueLabel = data.valueLabel || "Score";
    const metricLabel = data.highlightLabel || "Daily Record";

    dailyEl.innerHTML = `${dailyBadge} Face today's challenger and try to beat the daily record.<br><strong>${metricLabel}</strong>: ${valueLabel} ${data.value} · Challenger: <a href="/p/${encodeURIComponent(data.playerId)}">${challengerLabel}</a> · <a href="/replay/${data.publicId}">Watch replay</a>`;
  } catch (error) {
    dailyEl.textContent = "Today's challenge is not ready yet.";
  }
}
