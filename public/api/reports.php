<?php
require __DIR__ . '/../../src/auth.php';
$u = require_login();
$admin = $u['role'] === 'admin';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $d = input();
    $desc = trim($d['description'] ?? '');
    $loc = trim($d['location'] ?? '');
    if ($desc === '' || $loc === '' || mb_strlen($desc) > 2000 || mb_strlen($loc) > 255)
        out(['error' => 'A valid description and location are required'], 422);
    db()->prepare('INSERT INTO reports (user_id, description, location_text) VALUES (?, ?, ?)')
        ->execute([$u['id'], $desc, $loc]);
    $id = (int)db()->lastInsertId();
    db()->prepare("INSERT INTO status_history (report_id, user_id, from_status, to_status) VALUES (?, ?, NULL, 'Submitted')")
        ->execute([$id, $u['id']]);
    out(['id' => $id, 'code' => sprintf('R-%03d', $id)], 201);
}

// Residents get only their own reports and no AI internals (mismatch flags, reasons)
$cols = "r.id, CONCAT('R-', LPAD(r.id, 3, '0')) AS code, r.description, r.location_text, r.status, r.category, r.priority, (SELECT p.id FROM report_photos p WHERE p.report_id = r.id LIMIT 1) AS photo_id, CASE WHEN r.ai_status = 'done' AND r.ai_consistency = 'mismatch' THEN 'If safe, add a clearer photo that shows the issue you described.' WHEN r.ai_status = 'done' AND r.ai_consistency IN ('partial','unclear') THEN 'A clearer photo may help staff review this report. Add one if it is safe and useful.' ELSE NULL END AS add_photo_hint, r.created_at, r.updated_at, r.ai_status"
    . ($admin ? ", u.name AS resident, r.ai_summary, r.ai_category, r.ai_priority, r.ai_visible_issue, r.ai_consistency, r.ai_confidence, r.ai_reason, r.needs_verification" : '');
$where = '1=1';
$params = [];
if (!$admin) { $where .= ' AND r.user_id = ?'; $params[] = $u['id']; }
if (isset($_GET['id'])) { $where .= ' AND r.id = ?'; $params[] = (int)$_GET['id']; }

$s = db()->prepare("SELECT $cols FROM reports r JOIN users u ON u.id = r.user_id WHERE $where ORDER BY r.id DESC");
$s->execute($params);
$rows = $s->fetchAll();
$history = db()->prepare('SELECT h.from_status, h.to_status, h.created_at, u.name AS actor FROM status_history h JOIN users u ON u.id = h.user_id WHERE h.report_id = ? ORDER BY h.id');
$comments = db()->prepare("SELECT c.id, c.body, c.created_at, u.name AS author FROM comments c JOIN users u ON u.id = c.user_id WHERE c.report_id = ? AND u.role = 'admin' ORDER BY c.id");
foreach ($rows as &$row) {
    $history->execute([$row['id']]);
    $row['history'] = $history->fetchAll();
    $comments->execute([$row['id']]);
    $row['comments'] = $comments->fetchAll();
}
unset($row);
out(isset($_GET['id']) ? ($rows[0] ?? out(['error' => 'Not found'], 404)) : $rows);
