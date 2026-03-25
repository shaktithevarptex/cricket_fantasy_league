// ═══════════════════════════════════════════════════
// RESOLVE — confirm/correct player name matches
// Enhanced to show team badge, role, country from DB
// ═══════════════════════════════════════════════════
import { state }               from './state.js';
import { escHtml, escAttr, escId } from './utils.js';
import { goPage }              from './navigation.js';

export function renderResolve() {
  const container = document.getElementById('resolve-items');
  container.innerHTML = '';

  const dbResults   = state.wiz.dbResults   || {};
  const suggestions = state.wiz.suggestions  || {};
  const allEntries  = Object.entries(suggestions);

  if (!allEntries.length) {
    container.innerHTML = `
      <div class="alert alert-ok">
        ✅ All player names matched exactly — nothing to confirm.
      </div>`;
    updateResolveBtn();
    return;
  }

  allEntries.forEach(([orig, suggs]) => {
    const result   = dbResults[orig] || {};
    const isUnknown = suggs.length === 0;
    const isAuto    = result.status === 'auto';
    const isFuzzy   = result.status === 'fuzzy';

    const card        = document.createElement('div');
    card.className    = 'card mb-16';
    card.style.border = isUnknown
      ? '1px solid rgba(248,113,113,.3)'
      : '1px solid rgba(251,191,36,.25)';

    // ── Status badge ──────────────────────────────
    const statusBadge = isUnknown
      ? `<span class="badge" style="background:rgba(248,113,113,.15);border:1px solid rgba(248,113,113,.35);color:var(--err)">✖ Unknown</span>`
      : isAuto
        ? `<span class="badge" style="background:rgba(139,92,246,.15);border:1px solid rgba(139,92,246,.35);color:#a78bfa">⬆ Auto-matched</span>`
        : `<span class="badge" style="background:rgba(251,191,36,.1);border:1px solid rgba(251,191,36,.3);color:var(--warn)">⚠ Needs confirm</span>`;

    // ── Suggestion pills ──────────────────────────
    const pills = suggs.map(s => {
      const isSelected = state.wiz.choices[orig]?.name === s.name;
      const teamInfo   = s.team
        ? `<div style="font-size:10px;color:var(--dim);margin-top:3px">
            ${s.teamImg ? `<img src="${escHtml(s.teamImg)}" style="width:14px;height:14px;border-radius:50%;vertical-align:middle;margin-right:3px"/>` : ''}
            ${escHtml(s.team)} · ${escHtml(s.role || '')} · ${escHtml(s.country || '')}
           </div>`
        : '';
      return `
        <button class="name-pill ${isSelected ? 'selected' : ''}"
          onclick="pickName('${escId(orig)}','${escAttr(orig)}','${escAttr(s.name)}')">
          <div>${escHtml(s.name)}
            <span style="color:var(--dim);font-size:10px;margin-left:4px">${Math.round(s.score * 100)}%</span>
          </div>
          ${teamInfo}
        </button>`;
    }).join('');

    const keepSelected = state.wiz.choices[orig]?.name === orig;

    card.innerHTML = `
      <div class="flex items-center gap-14 mb-12" style="flex-wrap:wrap">
        <div style="font-size:18px">${isUnknown ? '❓' : '⚠️'}</div>
        <div class="flex-1">
          <div class="txt-dim fs-11">From Excel:</div>
          <div class="fw-800" style="font-size:15px;color:${isUnknown ? 'var(--err)' : 'var(--warn)'}">"${escHtml(orig)}"</div>
        </div>
        ${statusBadge}
      </div>

      ${isUnknown ? `
        <div class="alert alert-err mb-12" style="font-size:12px">
          ❌ No match found in player database. You can keep the original name or type a replacement below.
        </div>
        <div class="flex gap-10 mb-12" style="align-items:center">
          <input class="inp flex-1" id="custom-${escId(orig)}"
            placeholder="Type correct player name"
            value="${escHtml(state.wiz.choices[orig]?.name !== orig ? (state.wiz.choices[orig]?.name || '') : '')}"
            oninput="setCustomName('${escAttr(orig)}', this.value)"/>
          <button class="btn btn-ghost" style="white-space:nowrap"
            onclick="setCustomName('${escAttr(orig)}', document.getElementById('custom-${escId(orig)}').value)">
            Use this
          </button>
        </div>` : `
        <div class="txt-dim fs-12 mb-8">Select correct player:</div>
        <div class="flex" style="flex-wrap:wrap;gap:8px" id="pills-${escId(orig)}">
          ${pills}
        </div>`}

      <div class="flex" style="margin-top:10px;gap:8px">
        <button class="name-pill keep-orig ${keepSelected ? 'selected' : ''}"
          onclick="pickName('${escId(orig)}','${escAttr(orig)}','__KEEP__')">
          Keep "${escHtml(orig)}"
        </button>
      </div>
    `;
    container.appendChild(card);
  });

  updateResolveBtn();
}

export function pickName(escapedOrig, orig, chosenName) {
  if (chosenName === '__KEEP__') {
    state.wiz.choices[orig] = { name: orig };
  } else {
    const suggs = state.wiz.suggestions[orig] || [];
    const found = suggs.find(s => s.name === chosenName);
    state.wiz.choices[orig] = found || { name: chosenName };
  }
  renderResolve();
  updateResolveBtn();
}

export function setCustomName(orig, value) {
  const val = value.trim() || orig;
  state.wiz.choices[orig] = { name: val };
  updateResolveBtn();
}

export function updateResolveBtn() {
  const entries = Object.entries(state.wiz.suggestions || {});
  // All entries must have a choice set
  const allDone = entries.every(([o]) => !!state.wiz.choices[o]);
  const btn     = document.getElementById('resolve-confirm-btn');
  const hint    = document.getElementById('resolve-hint');
  if (btn)  btn.disabled             = !allDone;
  if (hint) hint.style.display       = allDone ? 'none' : 'block';
}

export function resolveConfirm() { goPage('preview'); }
export function resolveSkip() {
  // Accept all originals as-is
  Object.keys(state.wiz.suggestions || {}).forEach(orig => {
    if (!state.wiz.choices[orig]) state.wiz.choices[orig] = { name: orig };
  });
  goPage('preview');
}
