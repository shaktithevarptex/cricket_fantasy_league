// ═══════════════════════════════════════════════════
// UTILS — pure helpers, no DOM / state dependencies
// ═══════════════════════════════════════════════════

/** Escape arbitrary text for safe HTML insertion. */
export function escHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Escape for HTML attribute values (single-quote safe). */
export function escAttr(s) {
  return String(s || '').replace(/'/g, '&#39;').replace(/"/g, '&quot;');
}

/** Collapse a string to [a-z] only — used for fuzzy name keys. */
export function escId(s) {
  return String(s || '').replace(/[^a-zA-Z0-9]/g, '_');
}

/** Normalise a name to lower-alpha only for comparison. */
export const norm = s => (s || '').toLowerCase().replace(/[^a-z]/g, '');

/** Generate a pseudo-unique ID with an optional prefix. */
export function makeId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

/** Show a brief floating toast. */
export function toast(msg, bg = '#10b981', color = '#fff', duration = 3200) {
  const el = document.createElement('div');
  el.style.cssText = [
    'position:fixed', 'top:24px', 'left:50%', 'transform:translateX(-50%)',
    `background:${bg}`, `color:${color}`,
    'padding:12px 24px', 'border-radius:12px', 'font-weight:700',
    'font-size:14px', 'z-index:9999', 'box-shadow:0 4px 20px rgba(0,0,0,.4)'
  ].join(';');
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), duration);
}

/** Match two player name strings using last-name heuristics. */
export function isSamePlayer(a, b) {
  if (!a || !b) return false;

  const na = norm(a);
  const nb = norm(b);

  // exact match
  if (na === nb) return true;

  // contains match (VERY IMPORTANT)
  if (na.includes(nb) || nb.includes(na)) return true;

  // split ORIGINAL names (NOT norm)
  const pa = a.toLowerCase().split(' ');
  const pb = b.toLowerCase().split(' ');

  const la = pa[pa.length - 1]; // last name
  const lb = pb[pb.length - 1];

  // last name match + first initial match
  if (la === lb && pa[0][0] === pb[0][0]) return true;

  // last name strong match
  if (la === lb && la.length > 3) return true;

  return false;
}

/** Convert CricAPI overs string "3.4" → decimal 3.667 */
export function parseOvers(oversStr) {
  const parts      = String(oversStr || '0').split('.');
  const fullOvers  = parseInt(parts[0]) || 0;
  const balls      = parseInt(parts[1]) || 0;
  return fullOvers + (balls / 6);
}

/** Normalise the scorecard object so innings is always present. */
export function normalizeScorecard(apiData) {
  const src = apiData.scorecard || apiData.innings || [];
  return {
    ...apiData,
    innings: src.map(sc => ({
      inning:   sc.inning  || sc.team || '',
      batting:  sc.batting  || [],
      bowling:  sc.bowling  || [],
      catching: sc.catching || []
    }))
  };
}
