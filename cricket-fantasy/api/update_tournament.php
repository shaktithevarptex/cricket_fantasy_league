<?php
require 'db.php';

$body = json_decode(file_get_contents('php://input'), true);

if(!$body || !isset($body['id'])){
  http_response_code(400);
  echo json_encode(['status'=>'failure','reason'=>'Missing id']);
  exit;
}

$tId = (int)$body['id'];

try{
  $pdo->beginTransaction();

  // ─────────────────────────────────────────────
  // 1. SAFETY CHECK
  // ─────────────────────────────────────────────
  if(empty($body['teams'])){
    echo json_encode([
      'status'=>'failure',
      'reason'=>'Teams data missing — update blocked'
    ]);
    exit;
  }

  // ─────────────────────────────────────────────
  // 2. UPDATE TOURNAMENT
  // ─────────────────────────────────────────────
  $wc = isset($body['weeklyCaptains'])
    ? json_encode($body['weeklyCaptains'], JSON_UNESCAPED_SLASHES)
    : null;

  $stmt_t = $pdo->prepare(
    'UPDATE tournaments
     SET name=?, series_id=?, status=?, start_date=?,
         weekly_captains = IF(? IS NOT NULL, ?, weekly_captains)
     WHERE id=?'
  );

  $stmt_t->execute([
    $body['name'],
    $body['seriesId']  ?? null,
    $body['status']    ?? 'active',
    $body['startDate'] ?? date('Y-m-d'),
    $wc, $wc,
    $tId
  ]);

  // ─────────────────────────────────────────────
  // 3. LOAD EXISTING PLAYERS (PRESERVE DATA)
  // ─────────────────────────────────────────────
  $existingPlayers = [];

  $stmt = $pdo->prepare(
    'SELECT p.*, t.tournament_id
     FROM players p
     JOIN teams t ON t.id = p.team_id
     WHERE t.tournament_id = ?'
  );
  $stmt->execute([$tId]);

  foreach($stmt->fetchAll() as $p){
    $key = preg_replace('/[^a-z]/','', strtolower($p['name']));
    $existingPlayers[$key] = $p;
  }

  // ─────────────────────────────────────────────
  // 4. DELETE OLD TEAMS + PLAYERS
  // ─────────────────────────────────────────────
  $pdo->prepare(
    'DELETE p FROM players p
     JOIN teams t ON t.id = p.team_id
     WHERE t.tournament_id = ?'
  )->execute([$tId]);

  $pdo->prepare('DELETE FROM teams WHERE tournament_id=?')->execute([$tId]);

  // ─────────────────────────────────────────────
// 5. REINSERT TEAMS + PLAYERS (WITH PRESERVE + MAPPING)
// ─────────────────────────────────────────────
$teamIdMap   = [];
$playerIdMap = [];

foreach(($body['teams'] ?? []) as $team){

  $oldTeamId = $team['id'] ?? null;

  $pdo->prepare(
    'INSERT INTO teams (tournament_id, name, owner, players_count)
     VALUES (?,?,?,?)'
  )->execute([
    $tId,
    $team['name'],
    $team['owner'] ?? $team['name'],
    count($team['players'] ?? [])
  ]);

  $newTeamId = $pdo->lastInsertId();

  // ✅ map old → new team
  if($oldTeamId){
    $teamIdMap[$oldTeamId] = $newTeamId;
  }

  foreach(($team['players'] ?? []) as $p){

    $oldPlayerId = $p['id'] ?? null;

    $key = preg_replace('/[^a-z]/','', strtolower($p['name']));
    $old = $existingPlayers[$key] ?? null;

    $matchPoints = isset($p['matchPoints'])
  ? json_encode($p['matchPoints'], JSON_UNESCAPED_SLASHES)
  : ($old['match_points'] ?? null);

    $pdo->prepare(
      'INSERT INTO players
         (team_id, name, original_name, price,
          total_points, batting_points, bowling_points, fielding_points,
          match_points, is_injured, cricket_team, replaced_for)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)'
    )->execute([
      $newTeamId,
      $p['name'],
      $p['originalName']   ?? $p['name'],
      $p['price']          ?? 0,
      (int)($old['total_points']    ?? 0),
      (int)($old['batting_points']  ?? 0),
      (int)($old['bowling_points']  ?? 0),
      (int)($old['fielding_points'] ?? 0),
      $matchPoints,
      isset($p['isInjured']) ? ($p['isInjured'] ? 1 : 0) : 0,
      $p['cricketTeam'] ?? null,
      $p['replacedFor'] ?? null
    ]);

    $newPlayerId = $pdo->lastInsertId();

    // ✅ map old → new player
    if($oldPlayerId){
      $playerIdMap[$oldPlayerId] = $newPlayerId;
    }
  }
}

// ─────────────────────────────────────────────
// 5B. SAVE WEEKLY CAPTAINS (FIXED)
// ─────────────────────────────────────────────
if(isset($body['weeklyCaptains']) && is_array($body['weeklyCaptains'])){

  $pdo->prepare("DELETE FROM weekly_captains WHERE tournament_id=?")
      ->execute([$tId]);

  foreach($body['weeklyCaptains'] as $week => $teams){

    if(!is_array($teams)) continue;

    foreach($teams as $oldTeamId => $c){

      if(!is_array($c)) continue;

      $newTeamId = $teamIdMap[$oldTeamId] ?? null;
      if(!$newTeamId) continue;

      // ✅ map players too
      $newCaptainId = $playerIdMap[$c['captain']] ?? null;
      $newVcId      = $playerIdMap[$c['vc']] ?? null;

      $pdo->prepare("
        INSERT INTO weekly_captains 
        (tournament_id, team_id, week_key, captain_id, vc_id, created_at)
        VALUES (?,?,?,?,?,?)
      ")->execute([
        $tId,
        $newTeamId,
        $week,
        $newCaptainId,
        $newVcId,
        time()
      ]);
    }
  }
}

// ─────────────────────────────────────────────
// 6. MATCHES (STORE SCORECARD)
// ─────────────────────────────────────────────
if(isset($body['matches']) && is_array($body['matches'])){

  // Load existing matches to preserve scorecard if needed
  $existing = $pdo->prepare(
    'SELECT external_id, scorecard_raw, is_scored
     FROM matches WHERE tournament_id=?'
  );
  $existing->execute([$tId]);

  $cache = [];
  foreach($existing->fetchAll() as $row){
    if($row['external_id']){
      $cache[$row['external_id']] = $row;
    }
  }

  // Delete old matches
  $pdo->prepare('DELETE FROM matches WHERE tournament_id=?')
      ->execute([$tId]);

  $stmtM = $pdo->prepare(
    'INSERT INTO matches
     (tournament_id, external_id, name, match_number, date, venue,
      status, result, team_info, is_scored, scorecard_raw, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)'
  );

  foreach($body['matches'] as $m){

    $extId = $m['id'] ?? null;
    $cached = $cache[$extId] ?? [];

    $stmtM->execute([
      $tId,
      $extId,
      $m['name'] ?? null,
      $m['matchNumber'] ?? null,
      $m['date'] ?? null,
      $m['venue'] ?? null,
      $m['status'] ?? null,
      $m['result'] ?? null,
      !empty($m['teamInfo']) ? json_encode($m['teamInfo'], JSON_UNESCAPED_SLASHES) : null,

      // is_scored
      isset($m['isScored'])
        ? ($m['isScored'] ? 1 : 0)
        : ($cached['is_scored'] ?? 0),

      // 🔥 MAIN FIX
      isset($m['scorecard_raw'])
        ? $m['scorecard_raw']
        : ($cached['scorecard_raw'] ?? null),

      time()
    ]);
  }
}

  $pdo->commit();
  echo json_encode(['status'=>'success']);

} catch(Exception $e){
  $pdo->rollBack();
  http_response_code(500);
  echo json_encode(['status'=>'failure','reason'=>'DB error: '.$e->getMessage()]);
}