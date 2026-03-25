// ═══════════════════════════════════════════════════
// WIZARD — new tournament setup flow
// Name validation now uses match_players.php (DB)
// instead of CricAPI / local fuzzy matching.
// ═══════════════════════════════════════════════════
import { state }    from './state.js';
import { escHtml }  from './utils.js';
import { goPage }   from './navigation.js';

// ── Render wizard page ────────────────────────────
export function renderNewTournament() {
  document.getElementById('wiz-name').value = state.wiz.tName || '';
  document.getElementById('wiz-sid').value  = state.wiz.sid   || '';
  document.getElementById('wiz-upload-msg').style.display = 'none';
  updateWizParsedBanner();
}

export function updateWizParsedBanner() {
  const banner  = document.getElementById('wiz-parsed-banner');
  const nextBtn = document.getElementById('wiz-next-btn');
  const hint    = document.getElementById('wiz-next-hint');
  const statusEl = document.getElementById('wiz-match-status');

  if (state.wiz.parsedTeams.length) {
    const total  = state.wiz.parsedTeams.reduce((s, t) => s + t.players.length, 0);
    const owners = state.wiz.parsedTeams.map(t => t.owner || t.name).join(', ');
    banner.innerHTML = `✅ <strong>${state.wiz.parsedTeams.length} teams</strong> parsed · <strong>${total} players</strong><br>
      <span style="font-size:11px;opacity:.8">Owners: ${escHtml(owners)}</span>`;
    banner.style.display  = 'block';
    nextBtn.style.display = 'block';
    hint.style.display    = 'none';

    // Show DB match summary if available
    if (statusEl && state.wiz.matchStats) {
      const s = state.wiz.matchStats;
      statusEl.innerHTML = `
        <span style="color:var(--ok)">✔ ${s.exact} exact</span> &nbsp;
        <span style="color:#a78bfa">⬆ ${s.auto} auto</span> &nbsp;
        <span style="color:var(--warn)">⚠ ${s.fuzzy} to confirm</span> &nbsp;
        <span style="color:var(--err)">✖ ${s.unknown} unknown</span>
      `;
      statusEl.style.display = 'block';
    }
  } else {
    banner.style.display  = 'none';
    nextBtn.style.display = 'none';
    hint.style.display    = 'block';
    if (statusEl) statusEl.style.display = 'none';
  }
}

// ── File / drop handlers ──────────────────────────
export function handleWizFile(input) {
  const file = input.files[0];
  input.value = '';
  if (file) parseExcel(file);
}

export function handleWizDrop(event) {
  const file = event.dataTransfer.files[0];
  if (file) parseExcel(file);
}

export function parseExcel(file) {
  const ext   = file.name.split('.').pop().toLowerCase();
  const msgEl = document.getElementById('wiz-upload-msg');
  if (!['xlsx', 'xls', 'csv'].includes(ext)) {
    msgEl.textContent   = '❌ Upload .xlsx, .xls or .csv';
    msgEl.style.display = 'block';
    return;
  }
  const reader = new FileReader();
  reader.onload = async e => {
    try {
      const wb    = XLSX.read(e.target.result, { type: 'binary' });
      const ws    = wb.Sheets[wb.SheetNames[0]];
      const rows  = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
      const teams = parseAuctionSheet(rows);

      if (!teams.length) {
        msgEl.textContent   = '❌ No teams found. Make sure the sheet follows the auction format.';
        msgEl.style.display = 'block';
        return;
      }

      msgEl.style.display   = 'none';
      state.wiz.parsedTeams = teams;
      state.wiz.suggestions = {};
      state.wiz.choices     = {};
      state.wiz.matchStats  = null;
      state.wiz.dbResults   = {}; // raw results from match_players.php
      updateWizParsedBanner();

      // Validate all names against DB
      await validateNamesViaDB(teams);

    } catch (err) {
      msgEl.textContent   = '❌ Error: ' + err.message;
      msgEl.style.display = 'block';
    }
  };
  reader.readAsBinaryString(file);
}

// ── DB-based name validation ──────────────────────
// Replaces the old API + fuzzy approach entirely.
async function validateNamesViaDB(teams) {
  const banner    = document.getElementById('wiz-parsed-banner');
  const statusEl  = document.getElementById('wiz-match-status');
  if (banner) banner.innerHTML += ' &nbsp; <span class="pu txt-dim">🔍 Matching names…</span>';

  const allNames = [...new Set(teams.flatMap(t => t.players.map(p => p.name)))];

  let dbResults = {};
  try {
    const res = await fetch('api/match_players.php', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ names: allNames })
    });
    const j = await res.json();

    if (j.status === 'success') {
      dbResults          = j.results || {};
      state.wiz.dbResults = dbResults;
      state.wiz.matchStats = j.stats || {};
    } else {
      console.warn('match_players.php returned failure:', j.reason);
    }
  } catch (e) {
    console.warn('DB name match failed (server may be offline):', e.message);
  }

  // Build suggestions map (only names that need human decision)
  const suggestions = {};
  for (const [inputName, result] of Object.entries(dbResults)) {
    if (result.status === 'exact') {
      // Auto-accept, no confirmation needed
      state.wiz.choices[inputName] = result.match;
    } else if (result.status === 'auto') {
      // High-confidence suggestion — pre-select but show in resolve UI
      const top = result.suggestions[0];
      state.wiz.choices[inputName] = top;
      suggestions[inputName] = result.suggestions;
    } else if (result.status === 'fuzzy') {
      suggestions[inputName] = result.suggestions;
    } else {
      // unknown — keep original, flag for user
      suggestions[inputName] = [];
    }
  }

  state.wiz.suggestions = suggestions;
  updateWizParsedBanner();
}

// ── Wizard "Next" button ──────────────────────────
export function wizNext() {
  state.wiz.tName = document.getElementById('wiz-name').value.trim();
  state.wiz.sid   = document.getElementById('wiz-sid').value.trim();
  if (!state.wiz.tName) { alert('Please enter a tournament name.'); return; }
  if (!state.wiz.sid)   { alert('Series ID is required — paste it from CricAPI.'); return; }

  // Only go to resolve if there are names that need confirmation
  const needsReview = Object.entries(state.wiz.suggestions).some(
    ([, suggs]) => suggs.length > 0
  );
  // Also show resolve if there are unknowns (empty suggestions)
  const hasUnknown = Object.keys(state.wiz.suggestions).length > 0;
  goPage((needsReview || hasUnknown) ? 'resolve' : 'preview');
}

// ── Auction-sheet parser (unchanged) ─────────────
export function parseAuctionSheet(rows) {
  if (!rows.length) return [];

  const isText = v => { const s = String(v || '').trim(); return s.length >= 2 && /[a-zA-Z]/.test(s) && !/^\d+(\.\d+)?$/.test(s); };
  const isNum  = v => { const s = String(v || '').trim(); return s !== '' && !isNaN(parseFloat(s)); };
  const clean  = v => String(v || '').trim();

  let ownerRow = null, ownerRowIdx = 0;
  for (let r = 0; r < Math.min(6, rows.length); r++) {
    const row       = rows[r] || [];
    const textCount = row.filter(isText).length;
    if (textCount >= 2) { ownerRow = row; ownerRowIdx = r; break; }
    if (textCount === 1 && row.filter(isNum).length >= 1) { ownerRow = row; ownerRowIdx = r; break; }
  }
  if (!ownerRow) return [];

  const teamCols = [];
  for (let c = 0; c < ownerRow.length; c++) {
    if (!isText(ownerRow[c])) continue;
    const owner = clean(ownerRow[c]);
    let priceCol = -1;
    for (let pc = c + 1; pc <= c + 2 && pc < (ownerRow.length + 2); pc++) {
      let numericCount = 0;
      for (let r = ownerRowIdx + 1; r < Math.min(ownerRowIdx + 4, rows.length); r++) {
        if (isNum((rows[r] || [])[pc])) numericCount++;
      }
      if (numericCount >= 1) { priceCol = pc; break; }
    }
    if (priceCol === -1) priceCol = c + 1;
    teamCols.push({ nameCol: c, priceCol, owner });
  }
  if (!teamCols.length) return [];

  return teamCols.map(({ nameCol, priceCol, owner }) => {
    const players = [];
    for (let r = ownerRowIdx + 1; r < rows.length; r++) {
      const row  = rows[r] || [];
      const name = clean(row[nameCol]);
      if (name.length >= 3 && /[a-zA-Z]/.test(name) && !isNum(name)) {
        players.push({ name, price: parseFloat(row[priceCol]) || 0, owner });
      }
    }
    return players.length ? { name: owner, owner, players } : null;
  }).filter(Boolean);
}
