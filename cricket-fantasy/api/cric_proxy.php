<?php

header('Content-Type: application/json');

// 🔥 GET API KEY FROM FRONTEND (fallback to default)
$API_KEY = $_GET['apikey'] ?? "2bd89ac8-389f-4b4c-8ded-8b50fc6dc179";

// Params
$type   = $_GET['type']   ?? '';
$id     = $_GET['id']     ?? '';
$search = $_GET['search'] ?? '';

// Validate
if (!$type) {
    echo json_encode(["status"=>"error","reason"=>"Missing type"]);
    exit;
}

// Build URL
if ($type === 'series') {
    $url = "https://api.cricapi.com/v1/series_info?apikey=$API_KEY&id=$id";
}
else if ($type === 'scorecard') {
    $url = "https://api.cricapi.com/v1/match_scorecard?apikey=$API_KEY&id=$id";
}
else if ($type === 'players') {
    $url = "https://api.cricapi.com/v1/players?apikey=$API_KEY&search=" . urlencode($search);
}
else {
    echo json_encode(["status"=>"error","reason"=>"Invalid type"]);
    exit;
}

// 🔥 Fetch (better with error handling)
$opts = [
    "http" => [
        "method"  => "GET",
        "timeout" => 10
    ]
];

$context = stream_context_create($opts);
$response = @file_get_contents($url, false, $context);

if (!$response) {
    echo json_encode([
        "status"=>"error",
        "reason"=>"API request failed",
        "url"=>$url // helpful debug
    ]);
    exit;
}

// Return response
echo $response;