// ═══════════════════════════════════════════════════
// MATCHES — match list, detail view, fantasy points
// ═══════════════════════════════════════════════════
import { state, getTournament } from './state.js';
import { escHtml }              from './utils.js';
import { getWeekKeyFromMatch, weekKey } from './week.js';
import { loadTournamentsFromServer } from './api.js';

// ── Match list ────────────────────────────────────
export function renderMatchesList(t) {
  const matches = t.matches || [];
  const el      = document.getElementById('matches-content');

  if (!matches.length) {
    el.innerHTML = '<div class="txt-dim ta-center" style="padding:60px;font-size:15px">🏏<br><br>No matches processed yet<br><span class="fs-12">Use Admin → Manage → Fetch Scores to load matches</span></div>';
    return;
  }

  const statusOrder = { live: 0, upcoming: 1, completed: 2 };
const sorted = [...matches].sort((a, b) => {
  const sa = statusOrder[a.status] ?? 1;
  const sb = statusOrder[b.status] ?? 1;
  if (sa !== sb) return sa - sb;
  return new Date(a.date || 0) - new Date(b.date || 0);
});

  el.innerHTML = sorted.map(m => {
    const ti       = m.teamInfo || [];
    const teamImgs = ti.slice(0, 2).map(team => `
      <div style="display:flex;align-items:center;gap:7px;min-width:0">
        <img src="${team.img || ''}" style="width:28px;height:28px;border-radius:50%;background:#1e293b;object-fit:cover;flex-shrink:0" onerror="this.style.display='none'"/>
        <span style="font-weight:700;font-size:13px;color:var(--txt);white-space:nowrap">${escHtml(team.shortname || team.name)}</span>
      </div>
    `).join('<span style="color:var(--dim);font-size:12px;padding:0 4px">vs</span>');

    const statusBg    = m.status === 'completed' ? 'rgba(52,211,153,.15)' : m.status === 'live' ? 'rgba(251,191,36,.15)' : 'rgba(56,189,248,.15)';
    const statusBdr   = m.status === 'completed' ? 'rgba(52,211,153,.35)' : m.status === 'live' ? 'rgba(251,191,36,.35)' : 'rgba(56,189,248,.35)';
    const statusColor = m.status === 'completed' ? '#34d399' : m.status === 'live' ? '#fbbf24' : '#38bdf8';

    // ── C/VC row for this match's week ──────────
    const matchWeekKey = m.date ? weekKey(new Date(m.date)) : null;
    const wc           = matchWeekKey ? (t.weeklyCaptains?.[matchWeekKey] || {}) : {};
    const capRows      = (t.teams || []).map(team => {
      const sel = wc[team.id];
      if (!sel) return '';
      const cap = (team.players || []).find(p => p.id === sel.captain);
      const vc  = (team.players || []).find(p => p.id === sel.vc);
      if (!cap) return '';
      return `
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:3px 0">
          <span style="font-size:11px;color:var(--dim);min-width:60px">${escHtml(team.owner || team.name)}</span>
          <span style="font-size:11px;font-weight:700;background:rgba(251,191,36,.15);color:#fbbf24;border:1px solid rgba(251,191,36,.3);border-radius:5px;padding:1px 7px">
            👑 C: ${escHtml(cap.name)}
          </span>
          ${vc ? `<span style="font-size:11px;font-weight:700;background:rgba(139,92,246,.15);color:#a78bfa;border:1px solid rgba(139,92,246,.3);border-radius:5px;padding:1px 7px">
            ⭐ VC: ${escHtml(vc.name)}
          </span>` : ''}
        </div>`;
    }).join('');

    return `
      <div class="card mb-12" onclick="showMatchDetail('${m.id}')"
           style="cursor:pointer;transition:background .15s"
           onmouseenter="this.style.background='var(--surfh)'"
           onmouseleave="this.style.background=''">
        ${ti.length >= 2 ? `<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;flex-wrap:wrap">${teamImgs}</div>` : ''}
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px">
          <div style="min-width:0">
            <div class="fw-700 txt-main" style="font-size:13px;line-height:1.4">${escHtml(m.name)}</div>
            ${m.venue ? `<div class="txt-dim" style="font-size:11px;margin-top:3px">📍 ${escHtml(m.venue)}</div>` : ''}
            <div class="txt-dim" style="font-size:11px;margin-top:2px">📅 ${m.date || ''}</div>
          </div>
          <span class="badge" style="background:${statusBg};border:1px solid ${statusBdr};color:${statusColor}">
            ${m.status}
          </span>
        </div>
        ${m.result ? `<div style="color:var(--ok);font-size:12px;font-weight:600;margin-top:8px;padding-top:8px;border-top:1px solid var(--bdr)">🏆 ${escHtml(m.result)}</div>` : ''}

        ${capRows ? `
          <div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--bdr)" onclick="event.stopPropagation()">
            <div style="font-size:10px;font-weight:700;letter-spacing:1px;color:var(--dim);margin-bottom:6px">THIS WEEK'S CAPTAIN & VC</div>
            ${capRows}
          </div>` : ''}
      </div>`;
  }).join('');
}

// ── Match detail view ─────────────────────────────
export async function showMatchDetail(matchId) {
  state.matchDetailOpen = true;
  
  // 🔥 ALWAYS LOAD FRESH DATA
  await loadTournamentsFromServer();

  const t = getTournament();
  const match = (t.matches || []).find(m => m.id === matchId);
  if (!match) return;

  const el   = document.getElementById('matches-content');
  const ti   = match.teamInfo || [];

  const teamBanner = ti.length >= 2 ? `
    <div style="display:flex;align-items:center;gap:16px;background:var(--accd);border:1px solid var(--bdra);border-radius:12px;padding:14px 18px;margin-bottom:16px;flex-wrap:wrap">
      ${ti.map(team => `
        <div style="display:flex;align-items:center;gap:10px">
          <img src="${team.img || ''}" style="width:36px;height:36px;border-radius:50%;background:#1e293b;object-fit:cover" onerror="this.style.display='none'"/>
          <div>
            <div style="font-weight:800;color:var(--txt);font-size:15px">${escHtml(team.name || '')}</div>
            <div style="color:var(--dim);font-size:11px">${escHtml(team.shortname || '')}</div>
          </div>
        </div>
      `).join('<div style="flex:1;text-align:center;color:var(--dim);font-weight:900;font-size:18px">vs</div>')}
    </div>` : '';

  const scorePills = (match.score || []).map(s => `
    <span style="background:var(--surf1);border:1px solid var(--bdr);border-radius:8px;padding:4px 12px;font-size:13px;font-weight:700;color:var(--txt)">
      ${escHtml(s.inning || '')} &nbsp;
      <span style="color:var(--acc)">${s.r}/${s.w}</span>
      <span style="color:var(--dim);font-size:11px;margin-left:4px">(${s.o} ov)</span>
    </span>`).join('');

  el.innerHTML = `
    <button class="btn btn-ghost mb-20"
      onclick="state.matchDetailOpen=false; renderMatchesList(getTournament())">← Back</button>
    ${teamBanner}
    <div class="fw-800 txt-main" style="font-size:18px;margin-bottom:4px">${escHtml(match.name)}</div>
    ${match.venue ? `<div class="txt-dim fs-12" style="margin-bottom:6px">📍 ${escHtml(match.venue)}</div>` : ''}
    ${scorePills ? `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px">${scorePills}</div>` : ''}
    <div style="color:var(--ok);font-weight:600;font-size:13px;margin-bottom:20px">🏆 ${escHtml(match.result || match.status || '')}</div>
    <div id="md-pane-pts">
      <div class="txt-dim ta-center" style="padding:30px">⏳ Calculating fantasy points…</div>
    </div>
  `;

  renderFantasyPoints(matchId);
}

// ── Fantasy points breakdown for one match ────────
export function renderFantasyPoints(matchId) {
  const t     = getTournament();
  const ptsEl = document.getElementById('md-pane-pts');
  if (!t || !ptsEl) { if (ptsEl) ptsEl.innerHTML = '<div class="txt-dim">No data</div>'; return; }

  const wkKey = getWeekKeyFromMatch(matchId, t);

  // ── Try exact week key first, then check ALL weeks as fallback ──
  const wc = (() => {
    const wca = t.weeklyCaptains || {};
    // Exact match first
    if (wkKey && wca[wkKey]) return wca[wkKey];
    // Fallback: find the most recent week that is <= match date
    const matchDate = (t.matches || []).find(m => m.id === matchId)?.date;
    if (!matchDate) return {};
    const matchTs = new Date(matchDate).getTime();
    const sortedWks = Object.keys(wca).sort().reverse();
    for (const wk of sortedWks) {
      if (new Date(wk).getTime() <= matchTs) return wca[wk];
    }
    // Last resort: use latest week
    if (sortedWks.length) return wca[sortedWks[0]];
    return {};
  })();

  const teamsSorted = (t.teams || [])
    .map(team => {
      const active = (team.players || []).filter(p => p.matchPoints && p.matchPoints[String(matchId)] !== undefined);
      const total  = active.reduce((s, p) => {
        const mp = p.matchPoints[String(matchId)] || {};
        const base       = (mp.batting?.points  || 0) + (mp.bowling?.points  || 0) + (mp.fielding?.points || 0)
                         + (mp.bonus?.milestone || 0) + (mp.bonus?.mom || 0)
                         + (mp.bonus?.manual    || 0) + (mp.bonus?.hatrick  || 0)
                         + (mp.bonus?.sixSixes  || 0) + (mp.bonus?.sixFours || 0);
        const teamCap    = wc[team.id] || {};
        const isCaptain  = String(teamCap.captain) === String(p.id);
        const isVC       = String(teamCap.vc) === String(p.id);
        const multiplier = isCaptain ? 2 : isVC ? 1.5 : 1;
        return s + Math.round(base * multiplier);
      }, 0);
      return { team, active, total };
    })
    .filter(x => x.active.length)
    .sort((a, b) => b.total - a.total);

  ptsEl.innerHTML = teamsSorted.map(obj => {
    const sorted = [...obj.active].sort((a, b) => {
      const ma = a.matchPoints[String(matchId)] || {};
const mb = b.matchPoints[String(matchId)] || {};
      const base = x => (x.batting?.points  || 0) + (x.bowling?.points  || 0) + (x.fielding?.points || 0)
                      + (x.bonus?.mom || 0) + (x.bonus?.manual || 0)
                      + (x.bonus?.hatrick || 0) + (x.bonus?.sixSixes || 0) + (x.bonus?.sixFours || 0);
      return base(mb) - base(ma);
    });

    return `
    <div class="card mb-14">
      <div class="lbl txt-acc">${escHtml(obj.team.name)} — ${obj.total} pts</div>
      ${sorted.map(p => {
        const mp = p.matchPoints[String(matchId)] || {};
        const teamCap   = wc[obj.team.id] || {};
        const isCaptain = String(teamCap.captain) === String(p.id);
        const isVC      = String(teamCap.vc) === String(p.id);
        const base      = (mp.batting?.points  || 0) + (mp.bowling?.points  || 0) + (mp.fielding?.points || 0)
                        + (mp.bonus?.milestone || 0) + (mp.bonus?.mom || 0)
                        + (mp.bonus?.manual    || 0) + (mp.bonus?.hatrick  || 0)
                        + (mp.bonus?.sixSixes  || 0) + (mp.bonus?.sixFours || 0);
        const multiplier = isCaptain ? 2 : isVC ? 1.5 : 1;
        const tot       = Math.round(base * multiplier);

        return `
          <div class="flex gap-10 player-row"
               onclick="toggleStats(this)"
               style="padding:8px 0;border-bottom:1px solid var(--bdr);cursor:pointer;align-items:center">
            <div class="flex-1">
              <div class="fw-600 txt-main" style="display:flex;align-items:center;flex-wrap:wrap">
                ${escHtml(p.name)}
                ${isCaptain ? `<span style="font-size:10px;font-weight:800;padding:2px 8px;border-radius:6px;margin-left:6px;background:rgba(251,191,36,.2);color:#fbbf24;border:1px solid rgba(251,191,36,.4)">C</span><span style="font-size:11px;color:#fbbf24;font-weight:700;margin-left:3px">×2</span>` : isVC ? `<span style="font-size:10px;font-weight:800;padding:2px 8px;border-radius:6px;margin-left:6px;background:rgba(139,92,246,.2);color:#a78bfa;border:1px solid rgba(139,92,246,.35)">VC</span><span style="font-size:11px;color:#a78bfa;font-weight:700;margin-left:3px">×1.5</span>` : ''}
                <span style="margin-left:6px;font-size:10px;color:#9ca3af">▼</span>
              </div>
              <div class="fs-11 txt-dim">🏏 ${mp.batting?.points||0} · 🎳 ${mp.bowling?.points||0} · 🧤 ${mp.fielding?.points||0}</div>
            </div>
            <div style="text-align:right;flex-shrink:0">
              ${multiplier > 1
                ? `<span style="font-size:12px;color:var(--dim);text-decoration:line-through;margin-right:4px">${base}</span><span class="fw-800" style="font-size:16px;color:${isCaptain?'#fbbf24':'#a78bfa'}">${tot}</span>`
                : `<span class="txt-acc fw-700" style="font-size:15px">${tot}</span>`}
            </div>
          </div>
          <div class="player-stats" style="display:none;padding:10px 12px;border-bottom:1px solid var(--bdr)">

            <div class="stat-block">
              <div class="fw-700 txt-main mb-6">🏏 Batting</div>
              <table class="stat-table">
                <tr><td>Runs</td><td class="txt-acc fw-700">${mp.batting?.runs || 0}</td></tr>
                <tr><td>Balls</td><td class="txt-acc fw-700">${mp.batting?.balls || 0}</td></tr>
                <tr><td>Strike Rate</td><td class="txt-acc fw-700">${mp.batting?.strikeRate || 0}</td></tr>
                <tr><td class="txt-acc fw-700">Points</td><td class="txt-acc fw-700">${mp.batting?.points || 0}</td></tr>
              </table>
            </div>

            <div class="stat-block">
              <div class="fw-700 txt-main mb-6">🎳 Bowling</div>
              <table class="stat-table">
                <tr><td>Wickets</td><td class="txt-acc fw-700">${mp.bowling?.wickets || 0}</td></tr>
                <tr><td>Overs</td><td class="txt-acc fw-700">${mp.bowling?.overs || 0}</td></tr>
                <tr><td>Economy</td><td class="txt-acc fw-700">${mp.bowling?.economy || 0}</td></tr>
                <tr><td class="txt-acc fw-700">Points</td><td class="txt-acc fw-700">${mp.bowling?.points || 0}</td></tr>
              </table>
            </div>

            <div class="stat-block">
              <div class="fw-700 txt-main mb-6">🧤 Fielding</div>
              <table class="stat-table">
                <tr><td>Catches</td><td class="txt-acc fw-700">${mp.fielding?.catches || 0}</td></tr>
                <tr><td>Runouts</td><td class="txt-acc fw-700">${mp.fielding?.runouts || 0}</td></tr>
                <tr><td>Stumpings</td><td class="txt-acc fw-700">${mp.fielding?.stumpings || 0}</td></tr>
                <tr><td class="txt-acc fw-700">Points</td><td class="txt-acc fw-700">${mp.fielding?.points || 0}</td></tr>
              </table>
            </div>

            ${((mp.bonus?.mom||0)+(mp.bonus?.manual||0)+(mp.bonus?.milestone||0)+(mp.bonus?.hatrick||0)+(mp.bonus?.sixSixes||0)+(mp.bonus?.sixFours||0)) > 0 ? `
            <div class="stat-block">
              <div class="fw-700 txt-main mb-6">⭐ Bonus</div>
              <table class="stat-table">
                ${(mp.bonus?.mom      ||0) ? `<tr><td>Man of the Match</td><td class="txt-acc fw-700">+${mp.bonus.mom}</td></tr>`      : ''}
                ${(mp.bonus?.hatrick  ||0) ? `<tr><td>Hat-trick</td>       <td class="txt-acc fw-700">+${mp.bonus.hatrick}</td></tr>`  : ''}
                ${(mp.bonus?.sixSixes ||0) ? `<tr><td>6 Sixes in Over</td> <td class="txt-acc fw-700">+${mp.bonus.sixSixes}</td></tr>` : ''}
                ${(mp.bonus?.sixFours ||0) ? `<tr><td>6 Fours in Over</td> <td class="txt-acc fw-700">+${mp.bonus.sixFours}</td></tr>` : ''}
                ${(mp.bonus?.milestone||0) ? `<tr><td>Milestone</td>        <td class="txt-acc fw-700">+${mp.bonus.milestone}</td></tr>`: ''}
                ${(mp.bonus?.manual   ||0) ? `<tr><td>Other Bonus</td>      <td class="txt-acc fw-700">${mp.bonus.manual>0?'+':''}${mp.bonus.manual}</td></tr>` : ''}
              </table>
            </div>` : ''}

            <div class="stat-block" style="background:${isCaptain ? 'rgba(251,191,36,.08)' : isVC ? 'rgba(139,92,246,.08)' : 'transparent'};border:1px solid ${isCaptain ? 'rgba(251,191,36,.3)' : isVC ? 'rgba(139,92,246,.3)' : 'var(--bdr)'}">
              <div class="fw-700 txt-main mb-6">👑 Role</div>
              <table class="stat-table">
                <tr>
                  <td>Role</td>
                  <td style="font-weight:800;color:${isCaptain ? '#fbbf24' : isVC ? '#a78bfa' : 'var(--dim)'}">
                    ${isCaptain ? '👑 Captain' : isVC ? '⭐ Vice Captain' : '—'}
                  </td>
                </tr>
                <tr>
                  <td>Multiplier</td>
                  <td style="font-weight:800;color:${isCaptain ? '#fbbf24' : isVC ? '#a78bfa' : 'var(--dim)'}">
                    ${isCaptain ? '2×' : isVC ? '1.5×' : '1×'}
                  </td>
                </tr>
                ${(isCaptain || isVC) ? `
                <tr>
                  <td>Base pts</td>
                  <td class="txt-acc fw-700">${base}</td>
                </tr>
                <tr>
                  <td style="font-weight:800">Final pts</td>
                  <td style="font-weight:900;font-size:15px;color:${isCaptain ? '#fbbf24' : '#a78bfa'}">${tot}</td>
                </tr>` : ''}
              </table>
            </div>

          </div>`;
      }).join('')}
    </div>`;
  }).join('');

  if (!teamsSorted.length) {
    ptsEl.innerHTML = '<div class="txt-dim ta-center">No fantasy points yet</div>';
  }
}