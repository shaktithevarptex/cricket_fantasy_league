<?php
require 'db.php';

try{
  $stmt = $pdo->query('SELECT * FROM tournaments ORDER BY id DESC');
  $tournaments = $stmt->fetchAll();

  foreach($tournaments as &$t){

    // ─────────────────────────────────────────────
    // 🔥 FIX: LOAD WEEKLY CAPTAINS FROM TABLE
    // ─────────────────────────────────────────────
    $wc = [];

    $stmtW = $pdo->prepare("
      SELECT team_id, week_key, captain_id, vc_id
      FROM weekly_captains
      WHERE tournament_id = ?
    ");
    $stmtW->execute([$t['id']]);

    foreach($stmtW->fetchAll() as $row){
      $wk  = $row['week_key'];
      $tid = (string)$row['team_id']; // IMPORTANT: string key

      if(!isset($wc[$wk])) $wc[$wk] = [];

      $wc[$wk][$tid] = [
        'captain' => (string)$row['captain_id'],
        'vc'      => (string)$row['vc_id']
      ];
    }

    $t['weeklyCaptains'] = $wc;

    // ─────────────────────────────────────────────
    // Teams
    // ─────────────────────────────────────────────
    $stmt2 = $pdo->prepare(
      'SELECT * FROM teams WHERE tournament_id=? ORDER BY id ASC'
    );
    $stmt2->execute([$t['id']]);
    $teams = $stmt2->fetchAll();

    foreach($teams as &$tm){
      $stmt3 = $pdo->prepare(
        'SELECT * FROM players WHERE team_id=? ORDER BY id ASC'
      );
      $stmt3->execute([$tm['id']]);
      $players = $stmt3->fetchAll();

      foreach($players as &$p){

        // match_points JSON
        $p['matchPoints'] = !empty($p['match_points'])
          ? json_decode($p['match_points'], true)
          : new stdClass();
        unset($p['match_points']);

        // snake_case → camelCase
        $p['totalPoints']    = (int)($p['total_points']    ?? 0);
        $p['battingPoints']  = (int)($p['batting_points']  ?? 0);
        $p['bowlingPoints']  = (int)($p['bowling_points']  ?? 0);
        $p['fieldingPoints'] = (int)($p['fielding_points'] ?? 0);
        unset($p['total_points'],$p['batting_points'],$p['bowling_points'],$p['fielding_points']);

        $p['isInjured']    = (bool)($p['is_injured'] ?? false);
        unset($p['is_injured']);

        $p['cricketTeam']  = $p['cricket_team'] ?? '';
        unset($p['cricket_team']);

        $p['replacedFor']  = $p['replaced_for'] ?? null;
        unset($p['replaced_for']);

        $p['country']        = $p['country'] ?? '';
        $p['countryFlagUrl'] = $p['country_flag_url'] ?? '';
        unset($p['country_flag_url']);

        $p['playerInfo'] = !empty($p['player_info'])
          ? json_decode($p['player_info'], true)
          : new stdClass();
        unset($p['player_info']);

        $p['price'] = (float)($p['price'] ?? 0);

        // 🔥 IMPORTANT: IDs as string
        $p['id'] = (string)$p['id'];
      }

      $tm['players'] = $players;

      // 🔥 IMPORTANT: team id as string
      $tm['id'] = (string)$tm['id'];
    }

    $t['teams'] = $teams;

    // ─────────────────────────────────────────────
    // Matches
    // ─────────────────────────────────────────────
    $stmtM = $pdo->prepare(
      'SELECT * FROM matches WHERE tournament_id=?
       ORDER BY CASE WHEN match_number IS NULL THEN 1 ELSE 0 END ASC,
                match_number ASC, date ASC'
    );
    $stmtM->execute([$t['id']]);
    $matches = $stmtM->fetchAll();

    foreach($matches as &$m){

      $m['teamInfo']    = !empty($m['team_info']) ? json_decode($m['team_info'], true) : [];
      $m['matchNumber'] = $m['match_number'] ?? null;
      $m['isScored']    = (bool)($m['is_scored'] ?? false);

      // Use external_id as frontend match id
      $m['id'] = !empty($m['external_id']) 
        ? $m['external_id'] 
        : (string)$m['id'];

      unset(
        $m['team_info'],
        $m['match_number'],
        $m['is_scored'],
        $m['external_id'],
        $m['scorecard_raw'],
        $m['created_at']
      );
    }

    $t['matches'] = $matches;

    // 🔥 IMPORTANT: tournament id as string
    $t['id'] = (string)$t['id'];
  }

  echo json_encode([
    'status'=>'success',
    'data'=>$tournaments
  ], JSON_UNESCAPED_SLASHES);

} catch(Exception $e){
  http_response_code(500);
  echo json_encode([
    'status'=>'failure',
    'reason'=>$e->getMessage()
  ]);
}