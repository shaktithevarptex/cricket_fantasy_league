// ═══════════════════════════════════════════════════
// PREVIEW — review parsed teams and create tournament
// ═══════════════════════════════════════════════════
import { state }                    from './state.js';
import { escHtml }                  from './utils.js';
import { apiSaveTournament,
         loadTournamentsFromServer } from './api.js';
import { goPage }                   from './navigation.js';

export function renderPreview() {
  const { parsedTeams, choices, tName, sid } = state.wiz;
  const total = parsedTeams.reduce((s, t) => s + t.players.length, 0);

  document.getElementById('preview-summary').innerHTML = `
    <div class="preview-stat">
      <div class="stat-label">Tournament</div>
      <div class="stat-value">${escHtml(tName) || '(no name)'}</div>
    </div>
    <div class="preview-stat">
      <div class="stat-label">Teams</div>
      <div class="stat-value">${parsedTeams.length}</div>
    </div>
    <div class="preview-stat">
      <div class="stat-label">Players</div>
      <div class="stat-value">${total}</div>
    </div>
    ${sid ? `<div class="preview-stat">
      <div class="stat-label">Series</div>
      <div class="stat-value small">${escHtml(sid.slice(0, 28))}…</div>
    </div>` : ''}
  `;

  const grid = document.getElementById('preview-teams');
  grid.innerHTML = '';

  parsedTeams.forEach(team => {
    const card       = document.createElement('div');
    card.className   = 'preview-card';
    const playerList = team.players.map(p => {
      const resObj    = choices[p.name];
      const display   = resObj ? resObj.name : p.name;
      const corrected = display !== p.name;
      return `
        <div class="player-row">
          <span class="player-name ${corrected ? 'corrected' : ''}">${escHtml(display)}</span>
          ${resObj && resObj.role ? `<span style="font-size:10px;color:var(--dim);margin-left:4px">${escHtml(resObj.role)}</span>` : ''}
          ${p.price ? `<span class="player-price">${p.price}Cr</span>` : ''}
        </div>`;
    }).join('');

    card.innerHTML = `
      <div class="preview-card-header">
        <div>
          <div class="team-owner">${escHtml(team.owner || team.name)}</div>
          <div class="team-meta">${team.players.length} players</div>
        </div>
      </div>
      <div class="player-list">${playerList}</div>
    `;
    grid.appendChild(card);
  });

  const noNameWarn = document.getElementById('preview-no-name-warn');
  const createBtn  = document.getElementById('preview-create-btn');
  if (!tName.trim()) {
    noNameWarn.style.display = 'block';
    createBtn.disabled       = true;
  } else {
    noNameWarn.style.display = 'none';
    createBtn.disabled       = false;
  }
}

export async function createTournament() {
  const { tName, sid, parsedTeams, choices } = state.wiz;
  if (!tName.trim()) return;
  if (!sid.trim())   { alert('Series ID required'); return; }

  const teams = parsedTeams.map(team => ({
    id:      team.name.replace(/\s+/g, '_') + '_' + Math.random().toString(36).substr(2, 5),
    name:    team.name,
    owner:   team.owner || team.name,
    players: team.players.map(p => {
      const dbInfo = choices[p.name] || {};
      return {
        id:             dbInfo.externalId || (p.name.replace(/\s+/g, '_') + '_' + Math.random().toString(36).substr(2, 5)),
        name:           dbInfo.name || p.name,
        originalName:   p.name,
        playerImg:      dbInfo.playerImg || null,
        role:           dbInfo.role || null,
        country:        dbInfo.country || null,
        price:          p.price || 0,
        totalPoints:    0,
        battingPoints:  0,
        bowlingPoints:  0,
        fieldingPoints: 0,
        matchPoints:    {},
        isInjured:      false
      };
    })
  }));

  const newT = {
    name:           tName,
    weeklyCaptains: {},
    seriesId:       sid,
    status:         'active',
    startDate:      new Date().toISOString().split('T')[0],
    teams,
    matches:        []
  };

  try {
    const resp = await apiSaveTournament(newT);
    if (resp && resp.status === 'success') {
      await loadTournamentsFromServer();
      goPage('admin-home');
    } else {
      alert('Save failed: ' + (resp?.reason || 'Unknown error'));
    }
  } catch (e) {
    alert('API error: ' + e.message);
  }
}
