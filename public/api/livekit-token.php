<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$body     = json_decode(file_get_contents('php://input'), true) ?? [];
$room     = $body['roomName'] ?? 'Main';
$userId   = $body['userId']   ?? ('viewer-' . bin2hex(random_bytes(6)));
$canPub   = !empty($body['canPublish']);

$key    = 'APIS4TDYBFuAEeg';
$secret = 'oyZuq3vRyAG8Y69MnUB7yhQJIx9dVOX3pobk6U65AoD';
$now    = time();

$payload = [
    'video' => [
        'room'           => $room,
        'roomJoin'       => true,
        'canPublish'     => $canPub,
        'canPublishData' => $canPub,
        'canSubscribe'   => true,
    ],
    'iss' => $key,
    'exp' => $now + 7200,
    'nbf' => $now,
    'sub' => $userId,
];

function b64u(string $data): string {
    return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
}

$h   = b64u(json_encode(['alg' => 'HS256']));
$c   = b64u(json_encode($payload, JSON_UNESCAPED_SLASHES));
$sig = b64u(hash_hmac('sha256', "$h.$c", $secret, true));

echo json_encode(['token' => "$h.$c.$sig"]);
