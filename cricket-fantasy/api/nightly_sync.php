  <?php
  // ── nightly_sync.php ─────────────────────────────────────────────────────────
  // Runs every night at 23:50 IST (18:20 UTC).
  // Fetches scorecards for TODAY's unscored matches and applies points to
  // the correct tournament's players only.
  //
  // Cron: 20 18 * * * php /var/www/html/cricket-fantasy/api/nightly_sync.php
  // HTTP: GET /api/nightly_sync.php?secret=cricket_nightly_2026[&tournament_id=1]
  //
  // Flow:
  //   1. Find today's matches WHERE is_scored=0 (no duplicates — is_scored prevents re-scoring)
  //   2. Fetch scorecard from CricAPI (1 hit per match)
  //   3. Calculate points per player using nested format (batting.points, bowling.points etc.)
  //   4. Save to DB, mark match as is_scored=1 (will never be scored again)
  // ─────────────────────────────────────────────────────────────────────────────
  require 'db.php';

  $secret = getenv('NIGHTLY_SECRET') ?: 'cricket_nightly_2026';
  if(php_sapi_name() !== 'cli'){
    if(($_GET['secret'] ?? '') !== $secret){
      http_response_code(403);
      echo json_encode(['status'=>'failure','reason'=>'Forbidden']);
      exit;
    }
  }

  // Optional: restrict to one tournament
  $filterTournamentId = isset($_GET['tournament_id']) ? (int)$_GET['tournament_id'] : null;

  set_time_limit(300);

  $log           = [];
  $matchesFound  = 0;
  $matchesScored = 0;
  $hitsUsed      = 0;
  $errors        = [];
  $startTime     = new DateTime();

  // ── Scorecard API key ────────────────────────────────────────────────────────
  $keyRow = $pdo->query("SELECT api_key FROM api_keys WHERE label='scorecard' LIMIT 1")->fetch();
  $apiKey = $keyRow['api_key'] ?? '';
  if(!$apiKey){
    echo json_encode(['status'=>'failure','reason'=>'No scorecard API key in api_keys table']);
    exit;
  }

  // ── Find today's unscored matches ────────────────────────────────────────────
  // is_scored = 0 ensures NO match is ever scored twice (duplicate prevention)
  $whereT = $filterTournamentId ? 'AND m.tournament_id = '.(int)$filterTournamentId : '';
  $stmt = $pdo->query(
    "SELECT m.id AS db_id, m.external_id, m.name, m.tournament_id, m.date
    FROM matches m
    WHERE DATE(m.date) = CURDATE()
      AND m.is_scored  = 0
      AND m.external_id IS NOT NULL
      AND m.external_id != ''
      {$whereT}
    ORDER BY m.tournament_id ASC, m.date ASC"
  );
  $todayMatches = $stmt->fetchAll();
  $matchesFound = count($todayMatches);

  $log[] = date('Y-m-d H:i:s').' — Nightly sync started';
  $log[] = "Today's unscored matches: {$matchesFound}";

  if(!$matchesFound){
    logRun($pdo, $startTime, 0, 0, 0, []);
    echo json_encode(['status'=>'success','log'=>$log,'scored'=>0]);
    exit;
  }

  // ── Process each match ───────────────────────────────────────────────────────
  foreach($todayMatches as $match){
    $mid  = $match['external_id'];
    $tid  = (int)$match['tournament_id'];
    $dbId = (int)$match['db_id'];
    $name = $match['name'];

    $log[] = "  [{$tid}] {$name}";

    // Fetch scorecard from CricAPI
    $url = "https://api.cricapi.com/v1/match_scorecard?apikey=".urlencode($apiKey)."&id=".urlencode($mid);
    $ctx = stream_context_create(['http'=>['timeout'=>25,'ignore_errors'=>true]]);
    $txt = @file_get_contents($url, false, $ctx);
    $hitsUsed++;

    if(!$txt){
      $errors[] = "No response for {$mid}";
      $log[]    = "    ❌ No response";
      continue;
    }

    $j = json_decode($txt, true);
    if(!$j || ($j['status']??'') !== 'success'){
      $errors[] = "API failure {$mid}: ".($j['reason']??'?');
      $log[]    = "    ❌ ".($j['reason']??'API failure');
      continue;
    }

    $data      = $j['data'] ?? [];
    $scorecard = $data['scorecard'] ?? [];

    // Match not ended yet — skip but update status
    if(empty($data['matchEnded'])){
      $log[] = "    ⏳ Not ended yet";
      if(!empty($data['matchStarted'])){
        $pdo->prepare('UPDATE matches SET status=? WHERE id=?')->execute(['live', $dbId]);
      }
      continue;
    }

    if(empty($scorecard)){
      $errors[] = "Empty scorecard {$mid}";
      $log[]    = "    ⚠️ Empty scorecard";
      continue;
    }

    // ── Load players for THIS tournament only ────────────────────────────────
    $pStmt = $pdo->prepare(
      'SELECT p.*, t2.id AS team_id
      FROM players p
      JOIN teams t2 ON t2.id = p.team_id
      WHERE t2.tournament_id = ?'
    );
    $pStmt->execute([$tid]);
    $allPlayers = $pStmt->fetchAll();

    $updateP = $pdo->prepare(
      'UPDATE players
      SET total_points    = ?,
          batting_points  = ?,
          bowling_points  = ?,
          fielding_points = ?,
          match_points    = ?,
          cricket_team    = COALESCE(NULLIF(cricket_team,""), ?)
      WHERE id = ?'
    );

    $totalNewPts = 0;

    // 🔥 ADD THIS BLOCK
  function buildLbwMap($scorecard){
    $map = [];
    foreach($scorecard as $inn){
      foreach(($inn['bowling'] ?? []) as $bw){
        $name = normName($bw['bowler']['name'] ?? '');
        if(!$name) continue;

        $lbw = (int)($bw['lbw'] ?? 0);
        if($lbw > 0){
          $map[$name] = ($map[$name] ?? 0) + $lbw;
        }
      }
    }
    return $map;
  }

  $lbwMap = buildLbwMap($scorecard);

  // 🔥 GET WEEK (use match date ideally)
  $matchDate = $match['date'] ?? date('Y-m-d');

  // get Monday of that match week (same as frontend)
  $ts = strtotime($matchDate);
  $day = date('w', $ts); // 0=Sun

  $diff = ($day == 0) ? -6 : (1 - $day);
  $week = date('Y-m-d', strtotime("$diff days", $ts));

  // 🔥 FETCH WEEKLY CAPTAINS
  $wcStmt = $pdo->prepare("
    SELECT team_id, captain_id, vc_id
    FROM weekly_captains
    WHERE tournament_id=? AND week_key=?
  ");
  $wcStmt->execute([$tid, $week]);

  $wcMap = [];
  foreach($wcStmt->fetchAll() as $w){
    $wcMap[$w['team_id']] = [
      'captain' => (string)$w['captain_id'],
      'vc'      => (string)$w['vc_id']
    ];
  }

    foreach($allPlayers as $p){
      $pname    = normName($p['name']);
      $cricTeam = $p['cricket_team'] ?? '';

      // ── Raw stats per player ────────────────────────────────────────────────
      $runs = 0; $balls = 0; $fours = 0; $sixes = 0; $sr = 0; $notout = false; $duck = false;
      $wkts = 0; $maidens = 0; $runsConceded = 0; $ovDec = 0.0; $eco = 0.0;
      $catches = 0; $runouts = 0; $stumpings = 0;
      $bat = 0; $bowl = 0; $field = 0;
      $batFound = false; $bowlFound = false; $fieldFound = false;

      foreach($scorecard as $inn){
        $innTeam = trim(preg_replace('/\s*(\d+\w*)?\s*(inning|innings).*/i', '', $inn['inning'] ?? ''));

        // ── Batting ──────────────────────────────────────────────────────────
        foreach(($inn['batting'] ?? []) as $b){
          $bn = normName($b['batsman']['name'] ?? $b['name'] ?? '');
          if($bn !== $pname) continue;
          if(!$cricTeam && $innTeam) $cricTeam = $innTeam;

          $runs   = (int)($b['r']   ?? 0);
          $balls  = (int)($b['b']   ?? 0);
          $fours  = (int)($b['4s']  ?? 0);
          $sixes  = (int)($b['6s']  ?? 0);
          $sr     = isset($b['sr']) ? (float)$b['sr'] : ($balls > 0 ? $runs / $balls * 100 : 0);
          $duck   = $runs === 0 && $balls > 0;
          $notout = str_contains(strtolower($b['dismissal-text'] ?? ''), 'not out');
          $bat    = calcBat($runs, $balls, $fours, $sixes, $sr, $duck, $notout);
          $batFound = true;
        }

        // ── Bowling ──────────────────────────────────────────────────────────

          foreach(($inn['bowling'] ?? []) as $bw){
              $bn = normName($bw['bowler']['name'] ?? $bw['name'] ?? '');
              if($bn !== $pname) continue;

              $wkts         = (int)($bw['w'] ?? 0);
              $maidens      = (int)($bw['m'] ?? 0);
              $runsConceded = (int)($bw['r'] ?? 0);
              $ovDec        = parseOvers((string)($bw['o'] ?? '0'));
              $eco          = isset($bw['eco']) ? (float)$bw['eco'] : ($ovDec > 0 ? $runsConceded / $ovDec : 0);

              // 🔥 ADD THESE 3 LINES
              $wides   = (int)($bw['wd'] ?? 0);
              $noballs = (int)($bw['nb'] ?? 0);
              $lbwBowled = $lbwMap[$pname] ?? 0;

              // 🔥 UPDATED CALL
              $bowl = calcBowl(
                $wkts,
                $maidens,
                $runsConceded,
                $ovDec,
                $eco,
                $wides,
                $noballs,
                $lbwBowled
              );
              $bowlFound = true;
            }

        // ── Fielding ─────────────────────────────────────────────────────────
        foreach(($inn['catching'] ?? []) as $c){
          $cn = normName($c['catcher']['name'] ?? $c['name'] ?? '');
          if($cn !== $pname) continue;

          $catches   += (int)($c['catch']   ?? 0);
          $runouts   += (int)($c['runout']  ?? 0);
          $stumpings += (int)($c['stumped'] ?? 0);
          $fieldFound = true;
        }
      }

      $field = ($catches * 10) + ($runouts * 10) + ($stumpings * 10);
      $basePts = $bat + $bowl + $field;

  // 🔥 APPLY CAPTAIN / VC
  $teamId = $p['team_id'];
  $multiplier = 1;

  if(isset($wcMap[$teamId])){
    $wc = $wcMap[$teamId];

    if((string)$p['id'] === $wc['captain']){
      $multiplier = 2;
    }
    elseif((string)$p['id'] === $wc['vc']){
      $multiplier = 1.5;
    }
  }

  $newPts = $basePts * $multiplier;

      $totalNewPts += $newPts;

      // ── Build NESTED match_points structure (matches frontend expectation) ─
      // Frontend reads: mp.batting.points, mp.bowling.points, mp.fielding.points
      // NOT flat mp.batting (number)
      $existMp = !empty($p['match_points']) ? json_decode($p['match_points'], true) : [];

      // Never overwrite if already scored (extra safety on top of is_scored flag)
      if(isset($existMp[$mid])) continue;

      $existMp[$mid] = [
        'batting' => [
          'points'      => $bat,
          'runs'        => $runs,
          'balls'       => $balls,
          'strikeRate'  => round($sr, 1),
          'fours'       => $fours,
          'sixes'       => $sixes,
        ],
        'bowling' => [
          'points'   => $bowl,
          'wickets'  => $wkts,
          'overs'    => round($ovDec, 2),
          'economy'  => round($eco, 2),
          'maidens'  => $maidens,
        ],
        'fielding' => [
          'points'    => $field,
          'catches'   => $catches,
          'runouts'   => $runouts,
          'stumpings' => $stumpings,
        ],
        'bonus' => [
          'captain'  => $multiplier === 2 ? $basePts : 0,
          'vc'       => $multiplier === 1.5 ? ($basePts * 0.5) : 0,
          'milestone'=> 0,
          'mom'      => 0,
          'manual'   => 0,
        ]
      ];

      $updateP->execute([
        $p['total_points']    + $newPts,
        $p['batting_points']  + $bat,
        $p['bowling_points']  + $bowl,
        $p['fielding_points'] + $field,
        json_encode($existMp, JSON_UNESCAPED_SLASHES),
        $cricTeam,
        $p['id']
      ]);
    }

    // ── Mark match as scored — prevents ANY future re-scoring ────────────────
    $pdo->prepare(
      'UPDATE matches
      SET is_scored=1, status=?, result=?, scorecard_raw=?, team_info=?
      WHERE id=?'
    )->execute([
      'completed',
      $data['status'] ?? '',
      json_encode($data, JSON_UNESCAPED_SLASHES),
      json_encode($data['teamInfo'] ?? [], JSON_UNESCAPED_SLASHES),
      $dbId
    ]);

    $matchesScored++;
    $log[] = "    ✅ +{$totalNewPts} pts distributed";
  }

  logRun($pdo, $startTime, $matchesFound, $matchesScored, $hitsUsed, $errors);
  $log[] = "Done. Scored {$matchesScored}/{$matchesFound}. API hits used: {$hitsUsed}";

  echo json_encode([
    'status'         => 'success',
    'matches_found'  => $matchesFound,
    'matches_scored' => $matchesScored,
    'api_hits_used'  => $hitsUsed,
    'errors'         => $errors,
    'log'            => $log,
  ], JSON_UNESCAPED_SLASHES);

  // ── Helpers ──────────────────────────────────────────────────────────────────
  function normName(string $s): string {
    return preg_replace('/[^a-z]/', '', strtolower($s));
  }

  function parseOvers(string $s): float {
    $p = explode('.', $s);
    return (int)$p[0] + ((int)($p[1] ?? 0)) / 6;
  }

  function calcBat(int $r, int $b, int $fs, int $ss, float $sr, bool $duck, bool $no): int {
    $J = $duck ? -10 : $r;
    $K = 0;
    foreach([25, 50, 75, 100, 125, 150, 175, 200] as $t){
      if($r >= $t) $K += 25;
    }
    $L = 0;
    if($sr < 50)        $L = -60;
    elseif($sr < 75)    $L = -40;
    elseif($sr < 100)   $L = -20;
    elseif($sr < 125)   $L = -10;
    elseif($sr <= 150)  $L = 0;
    elseif($sr <= 175)  $L = 10;
    elseif($sr <= 200)  $L = 20;
    elseif($sr <= 250)  $L = 40;
    elseif($sr <= 300)  $L = 60;
    elseif($sr <= 350)  $L = 80;
    else                $L = 100;

    $M          = ($r > 20 || $b >= 10) ? $L : 0;
    $notOutBonus = $no ? 10 : 0;
    return $J + $K + $M + ($fs * 1) + ($ss * 2) + $notOutBonus;
  }

  function calcBowl(
    int $w,
    int $m,
    int $r,
    float $ov,
    float $eco,
    int $wd = 0,
    int $nb = 0,
    int $lbw = 0
  ): int {

    $pts = $w * 25;

    if($w >= 8)      $pts += 175;
    elseif($w === 7) $pts += 150;
    elseif($w === 6) $pts += 125;
    elseif($w === 5) $pts += 100;
    elseif($w === 4) $pts += 75;
    elseif($w === 3) $pts += 50;

    $pts += $m * 40;

    if($ov >= 2){
      if($eco < 1)        $pts += 120;
      elseif($eco < 2)    $pts += 80;
      elseif($eco < 4)    $pts += 40;
      elseif($eco < 6)    $pts += 20;
      elseif($eco < 8)    $pts += 10;
      elseif($eco <= 10)  $pts += 0;
      elseif($eco > 16)   $pts -= 60;
      elseif($eco > 14)   $pts -= 40;
      elseif($eco > 12)   $pts -= 20;
      elseif($eco > 10)   $pts -= 10;
    }

    // 🔥 NEW (MATCH JS)
    $pts -= ($wd * 1);
    $pts -= ($nb * 2);
    $pts += ($lbw * 8);

    return $pts;
  }

  function logRun(PDO $pdo, DateTime $s, int $f, int $sc, int $h, array $e): void {
    try{
      $pdo->prepare(
        'INSERT INTO nightly_job_log
          (run_date, started_at, finished_at, matches_found, matches_scored, api_hits_used, errors, created_at)
            VALUES (CURDATE(), ?, NOW(), ?, ?, ?, ?, ?)'
          )->execute([
            $s->format('Y-m-d H:i:s'),
            $f, $sc, $h,
            $e ? implode("\n", $e) : null,
            time()
          ]);
        } catch(Exception $e){}
        }