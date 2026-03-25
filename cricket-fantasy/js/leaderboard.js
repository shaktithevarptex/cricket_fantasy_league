// ═══════════════════════════════════════════════════
// LEADERBOARD — standings + top performers
// ═══════════════════════════════════════════════════
import { escHtml, norm } from './utils.js';
import { weekKey }       from './week.js';

// ── Captain multiplier helper (used here AND in matches.js) ──
export function playerTotalWithCap(player, tournament) {
  const wc      = tournament.weeklyCaptains || {};
  const matches = tournament.matches || [];
  const mp      = player.matchPoints || {};

  // Find which team this player belongs to (needed for team-scoped captain lookup)
  let playerTeamId = null;
  for (const tm of (tournament.teams || [])) {
    if ((tm.players || []).some(p => p.id === player.id)) {
      playerTeamId = String(tm.id);
      break;
    }
  }

  const allWkKeys = Object.keys(wc).sort();

  // For a given match date, find captain selection for this player's team.
  // Uses exact week first, then falls back to most recent past week.
  // This matches the same logic as renderFantasyPoints in matches.js.
  function getCapForMatch(matchDate) {
    if (!playerTeamId || !matchDate) return {};
    const matchTs  = new Date(matchDate).getTime();
    const matchWk  = weekKey(new Date(matchDate));

    // 1. Exact week match
    const exact = wc[matchWk]?.[playerTeamId];
    if (exact) return exact;

    // 2. Most recent week whose Monday is <= match date
    const sorted = [...allWkKeys].reverse();
    for (const wk of sorted) {
      if (new Date(wk).getTime() <= matchTs) {
        const sel = wc[wk]?.[playerTeamId];
        if (sel) return sel;
      }
    }
    return {};
  }

  let matchTotal = 0;
  let mpRaw      = 0;

  Object.entries(mp).forEach(([matchId, pts]) => {
    const raw =
      (pts.batting?.points  || 0) +
      (pts.bowling?.points  || 0) +
      (pts.fielding?.points || 0) +
      (pts.bonus?.milestone || 0) +
      (pts.bonus?.mom       || 0) +
      (pts.bonus?.manual    || 0) +
      (pts.bonus?.hatrick   || 0) +
      (pts.bonus?.sixSixes  || 0) +
      (pts.bonus?.sixFours  || 0);
    mpRaw += raw;

    // Look up this match's date from the matches array
    const match     = matches.find(m => m.id === matchId);
    const matchDate = match?.date || null;
    const cap       = getCapForMatch(matchDate);

    const isC  = cap && String(cap.captain) === String(player.id);
    const isVC = cap && String(cap.vc)      === String(player.id);
    const mult = isC ? 2 : isVC ? 1.5 : 1;

    matchTotal += raw * mult;
  });

  // Fallback: points applied at team/tournament level (no matchPoints entry)
  const dbTotal     = player.totalPoints || 0;
  const unaccounted = dbTotal - mpRaw;
  if (unaccounted > 0) matchTotal += unaccounted;

  return Math.round(matchTotal * 10) / 10;
}


// ── Latest-week captain badge for a player ────────
export function captainBadge(playerId, tournament) {
  const wc        = tournament.weeklyCaptains || {};
  const sortedWks = Object.keys(wc).sort().reverse();
  for (const wk of sortedWks) {
    for (const sel of Object.values(wc[wk] || {})) {
      if (playerId === sel.captain) return 'C';
      if (playerId === sel.vc)      return 'VC';
    }
  }
  return null;
}

// ── Main leaderboard renderer ─────────────────────
export function renderLeaderboard(t) {
  const teams = t.teams || [];

  const ranked = [...teams]
    .map(tm => ({ ...tm, total: (tm.players || []).reduce((s, p) => s + playerTotalWithCap(p, t), 0) }))
    .sort((a, b) => b.total - a.total);

  const allP = teams.flatMap(tm =>
    (tm.players || []).map(p => ({
      ...p,
      teamName:     tm.name,
      ownerName:    tm.owner || tm.name,
      cricketTeam:  p.cricketTeam || p.country || '',
      capBadge:     captainBadge(p.id, t),
      totalWithCap: playerTotalWithCap(p, t)
    }))
  ).sort((a, b) => b.totalWithCap - a.totalWithCap);

  // ── Top Performers ────────────────────────────
  const medals   = ['🥇', '🥈', '🥉'];
  const tpBlock  = document.getElementById('top-performers');
  const tpList   = document.getElementById('top-performers-list');
  if (allP.length) {
    tpBlock.style.display = 'block';
    tpList.innerHTML = allP.map((p, i) => {
      const medalColor = ['var(--gold)', 'var(--silver)', 'var(--bronze)'][i] || 'var(--dim)';
      const pts        = p.totalWithCap || p.totalPoints || 0;
      const badge      = p.capBadge
        ? `<span style="display:inline-flex;align-items:center;font-size:10px;font-weight:800;padding:2px 7px;border-radius:6px;margin-right:6px;${
            p.capBadge === 'C'
              ? 'background:rgba(251,191,36,.2);color:#fbbf24;border:1px solid rgba(251,191,36,.4)'
              : 'background:rgba(139,92,246,.2);color:#a78bfa;border:1px solid rgba(139,92,246,.35)'
          }">${p.capBadge}</span>`
        : '';
      const natLine   = p.cricketTeam
        ? `<div style="font-size:12px;color:var(--dim);margin-top:3px">🏏 ${escHtml(p.cricketTeam)}</div>` : '';
      const ownerLine = `<div style="font-size:12px;color:var(--acc);margin-top:2px">👤 ${escHtml(p.ownerName || p.teamName)}</div>`;
      return `
        <div class="flex items-center gap-12" style="padding:11px 0;border-bottom:1px solid var(--bdr)">
          <span style="font-size:20px;min-width:28px;text-align:center;font-weight:900;color:${medalColor}">${medals[i] || i + 1}</span>
          <div class="flex-1" style="min-width:0">
            <div class="fw-700 txt-main" style="font-size:14px;display:flex;align-items:center;flex-wrap:wrap">
              ${badge}${escHtml(p.name)} &nbsp; ${ownerLine}
            </div>
            ${natLine}
          </div>
          <div class="ta-right" style="flex-shrink:0">
            <div class="txt-acc fw-800" style="font-size:18px">${pts}</div>
            <div class="fs-10 txt-dim">pts</div>
          </div>
        </div>`;
    }).join('');
  } else {
    tpBlock.style.display = 'none';
  }

  // ── Standings ─────────────────────────────────
  const standList = document.getElementById('standings-list');
  if (!ranked.length) {
    standList.innerHTML = '<div class="txt-dim ta-center" style="padding:30px">No teams yet</div>';
    return;
  }
  standList.innerHTML = '';
  let prevPoints = null;

  ranked.forEach((team, i) => {
    const isLeader  = i === 0;
    const diff      = i !== 0 ? prevPoints - (team.total || 0) : 0;
    prevPoints      = team.total || 0;
    const rankColor = isLeader ? '#10b981' : '#f87171';
    const statusLbl = isLeader
      ? '🟢 Leader'
      : `🔴 ${diff % 1 === 0 ? diff : diff.toFixed(1)} pts behind`;
    const ownerTag  = team.owner && norm(team.owner) !== norm(team.name)
      ? `<span style="color:var(--acc)">👤 ${escHtml(team.owner)}</span>` : '';
    const displayTotal = (team.total || 0) % 1 === 0
      ? (team.total || 0)
      : (team.total || 0).toFixed(1);

    const row = document.createElement('div');
    row.className = 'team-row';
    row.innerHTML = `
      <span style="width:32px;text-align:center;font-size:18px;font-weight:900;color:${['var(--gold)','var(--silver)','var(--bronze)'][i] || 'var(--dim)'}">
        ${['🥇','🥈','🥉'][i] || i + 1}
      </span>
      <div class="flex-1">
        <div class="fw-800 txt-main" style="font-size:16px">${escHtml(team.name)}</div>
        <div style="margin-top:3px;display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <span style="font-size:11px;font-weight:700;color:${rankColor}">${statusLbl}</span>
          ${ownerTag ? `<span class="fs-11">${ownerTag}</span>` : ''}
        </div>
      </div>
      <div class="ta-right" style="margin-right:10px">
        <div style="font-size:22px;font-weight:800;color:${rankColor}">${displayTotal}</div>
        <div class="fs-10 txt-dim">TOTAL PTS</div>
      </div>
      <span class="txt-dim fs-13" id="arrow-${i}">▼</span>
    `;

    // ── Expanded player breakdown ───────────────
    const detail = document.createElement('div');
    detail.style.cssText = 'display:none;padding:0 0 14px 46px';

    const sortedPlayers = (team.players || []).sort((a, b) => playerTotalWithCap(b, t) - playerTotalWithCap(a, t));

    detail.innerHTML = sortedPlayers.map(p => {
      const badge    = captainBadge(p.id, t);
      const badgePill = badge
        ? `<span style="font-size:9px;font-weight:800;padding:1px 5px;border-radius:5px;margin-right:5px;${
            badge === 'C'
              ? 'background:rgba(251,191,36,.2);color:#fbbf24'
              : 'background:rgba(139,92,246,.2);color:#a78bfa'
          }">${badge}</span>`
        : '';
      const pPts     = playerTotalWithCap(p, t);
      const mp       = p.matchPoints || {};
      const matches  = t.matches || [];

      const matchRows = matches.map(m => {
        const pts   = mp[m.id] || {};
        const total = (pts.batting?.points  || 0) +
              (pts.bowling?.points  || 0) +
              (pts.fielding?.points || 0) +
              (pts.bonus?.mom       || 0) +
              (pts.bonus?.manual    || 0) +
              (pts.bonus?.milestone || 0);
        if (total === 0) return '';
        return `
          <tr style="border-bottom:1px solid var(--bdr)">
            <td style="padding:6px 0;font-size:12px;color:#000">${escHtml(m.name || '')}</td>
            <td style="padding:6px 0;text-align:right;font-size:12px;font-weight:700;color:#000">+${total}</td>
          </tr>`;
      }).join('');

      return `
        <div class="player-row" onclick="event.stopPropagation(); togglePlayerMatches(this)"
             style="cursor:pointer;${p.isInjured ? 'opacity:.5' : ''}">
          ${p.isInjured ? '<span style="font-size:13px">🩹</span>' : ''}
          <div class="flex-1">
            <div class="${p.isInjured ? 'txt-dim' : 'txt-main'} fw-600"
                 style="font-size:14px;${p.isInjured ? 'text-decoration:line-through' : ''}">
              ${badgePill}${escHtml(p.name)}
              <span style="margin-left:6px;font-size:10px;color:#9ca3af">▼</span>
            </div>
          </div>
          <span style="color:#7dd3fc;font-weight:700;font-size:15px">${pPts}</span>
        </div>
        <div class="player-matches" style="display:none;padding:10px">
          <div style="font-size:10px;color:black;margin-bottom:6px">MATCH-BY-MATCH POINTS</div>
          <table style="width:100%;border-collapse:collapse">
            <thead>
              <tr style="font-size:10px;color:#000;text-transform:uppercase">
                <th style="text-align:left">Fixture</th>
                <th style="text-align:right">Pts</th>
              </tr>
            </thead>
            <tbody>
              ${matchRows || '<tr><td colspan="2" style="color:#000;font-size:11px">No points yet</td></tr>'}
            </tbody>
          </table>
        </div>`;
    }).join('');

    let open = false;
    row.onclick = () => {
      open = !open;
      detail.style.display = open ? 'block' : 'none';
      const arr = document.getElementById('arrow-' + i);
      if (arr) arr.textContent = open ? '▲' : '▼';
    };

    standList.appendChild(row);
    standList.appendChild(detail);
  });
}

// ── Toggle helpers (called from inline onclick) ───
export function toggleStats(row) {
  const next = row.nextElementSibling;
  if (!next) return;
  const open  = next.style.display === 'block';
  next.style.display = open ? 'none' : 'block';
  const arrow = row.querySelector('span:last-child');
  if (arrow) arrow.textContent = open ? '▼' : '▲';
}

export function togglePlayerMatches(row) {
  const box = row.nextElementSibling;
  if (!box) return;
  const isOpen = box.style.display === 'block';
  box.style.display = isOpen ? 'none' : 'block';
  const arrow = row.querySelector('span:last-child');
  if (arrow) arrow.textContent = isOpen ? '▼' : '▲';
}