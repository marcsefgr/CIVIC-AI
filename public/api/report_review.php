<?php
require __DIR__ . '/../../src/auth.php';
$admin = require_admin();
$d = input();
$id = (int)($d['id'] ?? 0);
$comment = trim((string)($d['comment'] ?? ''));
if ($id < 1 || mb_strlen($comment) > 2000) out(['error' => 'A valid report and a comment of at most 2000 characters are required'], 422);
$allowed = [
    'status'   => ['Submitted', 'In Review', 'In Progress', 'Resolved', 'Rejected'],
    'category' => ['Infrastructure', 'Public Safety', 'Sanitation', 'Environment', 'Public Spaces', 'Other'],
    'priority' => ['Low', 'Medium', 'High', 'Urgent'],
];
$set = [];
foreach ($allowed as $field => $values) {
    if (!array_key_exists($field, $d)) continue;
    if (!in_array($d[$field], $values, true)) out(['error' => "Invalid $field"], 422);
    $set[$field] = $d[$field];
}
$clearVerification = ($d['verified'] ?? false) === true;
if ($clearVerification) $set['needs_verification'] = 0;
if (!$set && $comment === '') out(['error' => 'Nothing to update'], 422);

$pdo = db();
$pdo->beginTransaction();
$s = $pdo->prepare('SELECT status, category, priority FROM reports WHERE id = ? FOR UPDATE');
$s->execute([$id]);
$report = $s->fetch();
if (!$report) { $pdo->rollBack(); out(['error' => 'Not found'], 404); }
$old = $report['status'];
$next = $set['status'] ?? $old;
if (isset($set['status']) && $set['status'] === 'Submitted' && $old !== 'Submitted') {
    $pdo->rollBack();
    out(['error' => 'Submitted is the initial status and cannot be restored after review begins'], 409);
}
if (isset($set['status']) && $next !== $old && $next !== 'Rejected') {
    $rank = ['Submitted' => 0, 'In Review' => 1, 'In Progress' => 2, 'Resolved' => 3, 'Rejected' => 3];
    if ($rank[$next] < $rank[$old]) {
        $pdo->rollBack();
        out(['error' => 'Report status cannot move backward'], 409);
    }
}
if (isset($set['status']) && $next !== $old) {
    $category = $set['category'] ?? $report['category'];
    $priority = $set['priority'] ?? $report['priority'];
    if ($category === null || $priority === null) {
        $pdo->rollBack();
        out(['error' => 'Choose a final category and priority before changing the report status'], 422);
    }
}
if (in_array($old, ['Resolved', 'Rejected'], true) && ($set || $comment !== '')) {
    $pdo->rollBack();
    out(['error' => 'Final admin values are locked for resolved and rejected reports'], 409);
}

$cols = implode(', ', array_map(fn($f) => "$f = ?", array_keys($set))); // names come from the whitelist above
if ($set) $pdo->prepare("UPDATE reports SET $cols WHERE id = ?")->execute([...array_values($set), $id]);
if (isset($set['status']) && $set['status'] !== $old)
    $pdo->prepare('INSERT INTO status_history (report_id, user_id, from_status, to_status) VALUES (?, ?, ?, ?)')
        ->execute([$id, $admin['id'], $old, $set['status']]);
$commentId = null;
if ($comment !== '') {
    $pdo->prepare('INSERT INTO comments (report_id, user_id, body) VALUES (?, ?, ?)')
        ->execute([$id, $admin['id'], $comment]);
    $commentId = (int)$pdo->lastInsertId();
}
$pdo->commit();
out(['ok' => true, 'comment_id' => $commentId]);
