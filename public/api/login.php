<?php
require __DIR__ . '/../../src/auth.php';
$d = input();
$email = strtolower(trim($d['email'] ?? ''));
$password = (string)($d['password'] ?? '');
$ip = (string)($_SERVER['REMOTE_ADDR'] ?? 'unknown');
$bucket = hash('sha256', $ip . "\0" . $email);
$pdo = db();
$pdo->beginTransaction();
$pdo->prepare('INSERT INTO login_attempts (bucket_key, window_started) VALUES (?, NOW()) ON DUPLICATE KEY UPDATE bucket_key = VALUES(bucket_key)')->execute([$bucket]);
$limit = $pdo->prepare("SELECT failed_attempts, CASE WHEN blocked_until > NOW() THEN 1 ELSE 0 END AS is_blocked,
    CASE WHEN window_started < DATE_SUB(NOW(), INTERVAL 15 MINUTE) THEN 1 ELSE 0 END AS is_expired
    FROM login_attempts WHERE bucket_key = ? FOR UPDATE");
$limit->execute([$bucket]);
$attempt = $limit->fetch();
if ((int)$attempt['is_blocked']) {
    $pdo->commit();
    header('Retry-After: 900');
    out(['error' => 'Too many sign-in attempts. Wait 15 minutes and try again.'], 429);
}
$s = $pdo->prepare('SELECT id, password_hash FROM users WHERE email = ?');
$s->execute([$email]);
$u = $s->fetch();
$valid = $u && password_verify($password, $u['password_hash']);
if (!$valid) {
    $failures = (int)$attempt['is_expired'] ? 1 : (int)$attempt['failed_attempts'] + 1;
    $update = $pdo->prepare("UPDATE login_attempts SET window_started = IF(? = 1, NOW(), window_started),
        failed_attempts = ?, blocked_until = IF(? >= 5, DATE_ADD(NOW(), INTERVAL 15 MINUTE), NULL) WHERE bucket_key = ?");
    $update->execute([(int)$attempt['is_expired'], $failures, $failures, $bucket]);
    $pdo->commit();
    out(['error' => 'Invalid email or password'], 401);
}
$pdo->prepare('DELETE FROM login_attempts WHERE bucket_key = ?')->execute([$bucket]);
$pdo->commit();
session_regenerate_id(true);
$_SESSION['uid'] = (int)$u['id'];
out(user());
