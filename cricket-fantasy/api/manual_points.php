<?php
require 'db.php';

$body = json_decode(file_get_contents('php://input'), true);
if(!$body){ http_response_code(400); echo json_encode(['status'=>'failure','reason'=>'Invalid JSON']); exit; }

$type   = $body['type']   ?? 'player';
$pts    = (int)($body['points'] ?? 0);
$tid    = (int)($body['tournament_id'] ?? 0);
$reason = trim($body['reason'] ?? 'Manual');

if(!$pts){ echo json_encode(['status'=>'failure','reason'=>'Points cannot be 0']); exit; }

$colMap = ['batting'=>'batting_points','bowling'=>'bowling_points','fielding'=>'fielding_points'];

try{
  if($type === 'player'){
    $playerId = (int)($body['player_id'] ?? 0);
    $matchId  = trim($body['match_id']   ?? '');
    $cat      = $body['category'] ?? 'bowling';
    $col      = $colMap[$cat] ?? 'bowling_points';

    if(!$playerId){ echo json_encode(['status'=>'failure','reason'=>'Missing player_id']); exit; }

    $check = $pdo->prepare(
      'SELECT p.id, p.name, p.total_points, p.match_points
       FROM players p JOIN teams t ON t.id=p.team_id
       WHERE p.id=? AND t.tournament_id=?'
    );
    $check->execute([$playerId, $tid]);
    $player = $check->fetch();
    if(!$player){ echo json_encode(['status'=>'failure','reason'=>'Player not found in this tournament']); exit; }

    $mp = !empty($player['match_points']) ? json_decode($player['match_points'], true) : [];

    if($matchId){
      // Get existing entry — preserve all nested stats
      $cur = $mp[$matchId] ?? [
        'batting'  => ['points'=>0],
        'bowling'  => ['points'=>0],
        'fielding' => ['points'=>0],
        'bonus'    => ['milestone'=>0,'mom'=>0,'hatrick'=>0,'sixSixes'=>0,'sixFours'=>0,'manual'=>0]
      ];

      // Ensure bonus is an array
      if(!isset($cur['bonus']) || !is_array($cur['bonus'])){
        $cur['bonus'] = ['milestone'=>0,'mom'=>0,'hatrick'=>0,'sixSixes'=>0,'sixFours'=>0,'manual'=>0];
      }

      $r = strtolower($reason);

      // Route to the correct bonus key based on reason
      if(str_contains($r,'man of the match') || str_contains($r,'mom')){
        $cur['bonus']['mom']       = ($cur['bonus']['mom']       ?? 0) + $pts;
      } elseif(str_contains($r,'hat-trick') || str_contains($r,'hatrick') || str_contains($r,'hat trick')){
        $cur['bonus']['hatrick']   = ($cur['bonus']['hatrick']   ?? 0) + $pts;
      } elseif(str_contains($r,'6 sixes') || str_contains($r,'six sixes')){
        $cur['bonus']['sixSixes']  = ($cur['bonus']['sixSixes']  ?? 0) + $pts;
      } elseif(str_contains($r,'6 fours') || str_contains($r,'six fours')){
        $cur['bonus']['sixFours']  = ($cur['bonus']['sixFours']  ?? 0) + $pts;
      } elseif(in_array($cat, ['batting','bowling','fielding'])){
        // Category bonus — add to cat.points, never overwrite stats
        if(!is_array($cur[$cat])) $cur[$cat] = ['points'=>(int)($cur[$cat]??0)];
        $cur[$cat]['points'] = ($cur[$cat]['points'] ?? 0) + $pts;
      } else {
        $cur['bonus']['manual']    = ($cur['bonus']['manual']    ?? 0) + $pts;
      }

      $mp[$matchId] = $cur;
    }

    $pdo->prepare(
      "UPDATE players SET total_points=total_points+?, {$col}={$col}+?, match_points=? WHERE id=?"
    )->execute([$pts, $pts, json_encode($mp, JSON_UNESCAPED_SLASHES), $playerId]);

    echo json_encode([
      'status'    =>'success',
      'player'    =>$player['name'],
      'points'    =>$pts,
      'reason'    =>$reason,
      'new_total' =>$player['total_points'] + $pts,
    ]);

  } elseif($type === 'team'){
    $teamId = (int)($body['team_id'] ?? 0);
    if(!$teamId){ echo json_encode(['status'=>'failure','reason'=>'Missing team_id']); exit; }

    $check = $pdo->prepare('SELECT id FROM teams WHERE id=? AND tournament_id=?');
    $check->execute([$teamId, $tid]);
    if(!$check->fetch()){ echo json_encode(['status'=>'failure','reason'=>'Team not found in this tournament']); exit; }

    $pList = $pdo->prepare('SELECT id FROM players WHERE team_id=? AND is_injured=0');
    $pList->execute([$teamId]);
    $affected = 0;
    $upd = $pdo->prepare('UPDATE players SET total_points=total_points+? WHERE id=?');
    foreach($pList->fetchAll() as $p){ $upd->execute([$pts, $p['id']]); $affected++; }

    echo json_encode(['status'=>'success','players_updated'=>$affected,'points_each'=>$pts]);

  } else {
    echo json_encode(['status'=>'failure','reason'=>'Unknown type']);
  }

} catch(Exception $e){
  http_response_code(500);
  echo json_encode(['status'=>'failure','reason'=>$e->getMessage()]);
}