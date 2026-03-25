// ═══════════════════════════════════════════════════
// SCORING — fantasy points calculation engine
// ═══════════════════════════════════════════════════
import { norm, isSamePlayer, parseOvers, normalizeScorecard } from './utils.js';

// ── Batting points ────────────────────────────────
export function calcBat(runs, balls, fours, sixes, sr, duck, notOut = false) {
  const J = duck ? -10 : runs;

  let K = 0;
  if (runs >= 25)  K += 25;
  if (runs >= 50)  K += 50;
  if (runs >= 75)  K += 75;
  if (runs >= 100) K += 100;
  if (runs >= 125) K += 125;
  if (runs >= 150) K += 150;
  if (runs >= 200) K += 200;

  let L = 0;
  if      (sr < 50)   L = -60;
  else if (sr < 75)   L = -40;
  else if (sr < 100)  L = -20;
  else if (sr < 125)  L = -10;
  else if (sr <= 150) L = 0;
  else if (sr <= 175) L = 10;
  else if (sr <= 200) L = 20;
  else if (sr <= 250) L = 40;
  else if (sr <= 300) L = 60;
  else if (sr <= 350) L = 80;
  else                L = 100;

  const M = (runs > 20 || balls >= 10) ? L : 0;
  const notOutBonus = notOut ? 10 : 0;

  return J + K + M + (fours * 1) + (sixes * 2) + notOutBonus;
}

// ── Bowling points ────────────────────────────────
export function calcBowl(wkts, maidens, runs, oversDec, eco, wides = 0, noballs = 0, lbwBowled = 0) {
  let pts = wkts * 25;

  if      (wkts >= 8) pts += 175;
  else if (wkts === 7) pts += 150;
  else if (wkts === 6) pts += 125;
  else if (wkts === 5) pts += 100;
  else if (wkts === 4) pts += 75;
  else if (wkts === 3) pts += 50;

  pts += lbwBowled * 10;
  pts += maidens * 40;
  pts -= (wides + noballs) * 2;

  if (oversDec >= 2) {
    if      (eco < 1)   pts += 120;
    else if (eco < 2)   pts += 80;
    else if (eco < 4)   pts += 40;
    else if (eco < 6)   pts += 20;
    else if (eco < 8)   pts += 10;
    else if (eco <= 10) pts += 0;
    else if (eco > 16)  pts -= 60;
    else if (eco > 14)  pts -= 40;
    else if (eco > 12)  pts -= 20;
    else if (eco > 10)  pts -= 10;
  }

  return pts;
}

// ── Build the lbw/bowled map for an entire scorecard ──
function buildLbwMap(scorecard) {
  const lbwMap = {};
  (scorecard.innings || []).forEach(inn => {
    (inn.batting || []).forEach(b => {
      const text = (b['dismissal-text'] || '').toLowerCase();
      if (!text.includes('b ')) return;
      const match = text.match(/b\s+([a-z\s]+)/);
      if (!match) return;
      const key = norm(match[1].trim());
      lbwMap[key] = (lbwMap[key] || 0) + 1;
    });
  });
  return lbwMap;
}

// ── Apply one match scorecard to the entire tournament ──
export function applyMatch(tournament, matchInfo, rawScorecard) {
  const scorecard = normalizeScorecard(rawScorecard);
  const mid       = matchInfo.id;
  const lbwMap    = buildLbwMap(scorecard);

  const updatedTeams = (tournament.teams || []).map(team => ({
    ...team,
    players: (team.players || []).map(player => {
      if (player.isInjured) return player;

      let bat = 0, bowl = 0, field = 0;
      let runs = 0, balls = 0, fours = 0, sixes = 0, sr = 0;
      let wkts = 0, overs = 0, runsConceded = 0, eco = 0;
      let catches = 0, runouts = 0, stumpings = 0;

      (scorecard.innings || []).forEach(inn => {
        // ── Batting ──────────────────────────────
        (inn.batting || []).forEach(b => {
          if (!isSamePlayer(player.name, b.batsman?.name || '')) return;
          runs   += +(b.r   || 0);
          balls  += +(b.b   || 0);
          fours  += +(b['4s'] || 0);
          sixes  += +(b['6s'] || 0);
          sr      = b.sr ? parseFloat(b.sr) : sr;
          const duck   = runs === 0 && balls > 0;
          const notOut = (b['dismissal-text'] || '').toLowerCase().includes('not out');
          bat = calcBat(runs, balls, fours, sixes, sr, duck, notOut);
        });

        // ── Bowling ──────────────────────────────
        (inn.bowling || []).forEach(bw => {
          if (!isSamePlayer(player.name, bw.bowler?.name || '')) return;
          wkts         = +(bw.w || 0);
          overs        = parseOvers(bw.o || 0);
          runsConceded = +(bw.r || 0);
          eco          = bw.eco ? parseFloat(bw.eco) : 0;
          const wides  = +(bw.wd || 0);
          const noballs = +(bw.nb || 0);
          const lbwBowled = lbwMap[norm(player.name)] || 0;
          bowl = calcBowl(wkts, bw.m || 0, runsConceded, overs, eco, wides, noballs, lbwBowled);
        });

        // ── Fielding ─────────────────────────────
        (inn.catching || []).forEach(c => {
          if (!isSamePlayer(player.name, c.catcher?.name || '')) return;
          catches   += +(c.catch   || 0);
          runouts   += +(c.runout  || 0);
          stumpings += +(c.stumped || 0);
          field      = catches * 10 + runouts * 10 + stumpings * 10;
        });
      });

      const total = bat + bowl + field;
      if (total === 0) return player;

        const mp = {
          batting:  { runs, balls, strikeRate: sr, fours, sixes, points: bat },
          bowling:  { wickets: wkts, overs, runs: runsConceded, economy: eco, points: bowl },
          fielding: { catches, runouts, stumpings, points: field },
          bonus:    { milestone: 0, mom: 0 }
        };

        return {
          ...player,
          matchPoints:    { ...(player.matchPoints || {}), [mid]: mp },
          totalPoints:    (player.totalPoints    || 0) + total,
          battingPoints:  (player.battingPoints  || 0) + bat,
          bowlingPoints:  (player.bowlingPoints  || 0) + bowl,
          fieldingPoints: (player.fieldingPoints || 0) + field
        };
    })
  }));

  // ── Update match metadata ─────────────────────
  const newMatches = (tournament.matches || []).some(m => m.id === mid)
    ? tournament.matches.map(m =>
        m.id === mid
          ? { ...m, status: 'completed', result: matchInfo.status,
              teamInfo: matchInfo.teamInfo || m.teamInfo || [], isScored: true }
          : m
      )
    : [
        ...(tournament.matches || []),
        { id: mid, name: matchInfo.name, date: matchInfo.date,
          venue: matchInfo.venue || '', status: 'completed',
          result: matchInfo.status, teamInfo: matchInfo.teamInfo || [], isScored: true }
      ];

  return { ...tournament, teams: updatedTeams, matches: newMatches };
}
