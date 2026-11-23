<?php
require __DIR__ . '/../../src/auth.php';
$admin = require_admin();
$d = input();
$id = (int)($d['report_id'] ?? 0);
$body = trim($d['body'] ?? '');
if ($id < 1 || $body === '' || mb_strlen($body) > 2000) out(['error' => 'Report and comment (max 2000) required'], 422);
$s = db()->prepare('SELECT id FROM reports WHERE id = ?');
$s->execute([$id]);
if (!$s->fetch()) out(['error' => 'Report not found'], 404);
db()->prepare('INSERT INTO comments (report_id, user_id, body) VALUES (?, ?, ?)')->execute([$id, $admin['id'], $body]);
out(['id' => (int)db()->lastInsertId()], 201);
