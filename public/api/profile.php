<?php
require __DIR__ . '/../../src/auth.php';
$u = require_login();
if ($_SERVER['REQUEST_METHOD'] !== 'POST') out(['error' => 'POST only'], 405);
$d = input();
$address = trim((string)($d['permanent_address'] ?? ''));
if (mb_strlen($address) > 255) out(['error' => 'Address must be 255 characters or fewer'], 422);
try {
    db()->prepare('UPDATE users SET permanent_address = ? WHERE id = ?')->execute([$address !== '' ? $address : null, $u['id']]);
} catch (PDOException $e) {
    out(['error' => 'Apply the profile address database migration before saving an address'], 503);
}
out(['permanent_address' => $address]);
