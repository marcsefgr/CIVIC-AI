<?php
require __DIR__ . '/config.php';
session_set_cookie_params([
    'secure' => env('APP_ENV', 'local') === 'production',
    'httponly' => true,
    'samesite' => 'Lax',
]);
session_start();
header('Content-Type: application/json');

function out($data, int $code = 200) {
    http_response_code($code);
    exit(json_encode($data));
}

// POST + JSON only: blocks plain cross-site form posts
function input(): array {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') out(['error' => 'POST only'], 405);
    if (!str_contains($_SERVER['CONTENT_TYPE'] ?? '', 'application/json')) out(['error' => 'JSON required'], 415);
    $j = json_decode(file_get_contents("php://input"), true);
    return is_array($j) ? $j : [];
}

// Role always comes from the database, never from the client
function user(): ?array {
    if (empty($_SESSION['uid'])) return null;
    try {
        $s = db()->prepare('SELECT id, name, email, role, permanent_address FROM users WHERE id = ?');
        $s->execute([$_SESSION['uid']]);
        return $s->fetch() ?: null;
    } catch (PDOException $e) {
        // Keep existing installations usable until the profile-address migration is applied.
        $s = db()->prepare('SELECT id, name, email, role FROM users WHERE id = ?');
        $s->execute([$_SESSION['uid']]);
        $row = $s->fetch();
        if ($row) $row['permanent_address'] = null;
        return $row ?: null;
    }
    $s->execute([$_SESSION['uid']]);
    return $s->fetch() ?: null;
}

function require_login(): array { return user() ?? out(['error' => 'Not signed in'], 401); }

function require_admin(): array {
    $u = require_login();
    return $u['role'] === 'admin' ? $u : out(['error' => 'Forbidden'], 403);
}
