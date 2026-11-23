<?php
require __DIR__ . '/../../src/auth.php';
$u = require_login();
$dir = __DIR__ . '/../../storage/uploads/';

function saveStrippedPhoto(string $source, string $destination, string $mime): bool
{
    $raw = @file_get_contents($source);
    $image = $raw === false ? false : @imagecreatefromstring($raw);
    if (!$image) return false;

    if ($mime === 'image/jpeg' && function_exists('exif_read_data')) {
        $meta = @exif_read_data($source);
        $orientation = (int)($meta['Orientation'] ?? 1);
        if ($orientation === 2 || $orientation === 4) {
            imageflip($image, $orientation === 2 ? IMG_FLIP_HORIZONTAL : IMG_FLIP_VERTICAL);
        } elseif ($orientation === 3 || $orientation === 6 || $orientation === 8) {
            $rotated = @imagerotate($image, $orientation === 3 ? 180 : ($orientation === 6 ? -90 : 90), 0);
            if ($rotated) { imagedestroy($image); $image = $rotated; }
        } elseif ($orientation === 5 || $orientation === 7) {
            imageflip($image, IMG_FLIP_HORIZONTAL);
            $rotated = @imagerotate($image, $orientation === 5 ? -90 : 90, 0);
            if ($rotated) { imagedestroy($image); $image = $rotated; }
        }
    }

    if ($mime === 'image/png') {
        imagealphablending($image, false);
        imagesavealpha($image, true);
        $saved = @imagepng($image, $destination, 6);
    } elseif ($mime === 'image/webp') {
        $saved = function_exists('imagewebp') && @imagewebp($image, $destination, 90);
    } else {
        $saved = @imagejpeg($image, $destination, 90);
    }
    imagedestroy($image);
    if (!$saved) @unlink($destination);
    return (bool)$saved;
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $rid = (int)($_POST['report_id'] ?? 0);
    $s = db()->prepare("SELECT r.id, r.status, r.ai_status, p.id AS photo_id, p.file_name AS old_file_name
        FROM reports r LEFT JOIN report_photos p ON p.report_id = r.id WHERE r.id = ? AND r.user_id = ?");
    $s->execute([$rid, $u['id']]);
    $report = $s->fetch();
    if (!$report) out(['error' => 'Report not found'], 404);
    if (in_array($report['status'], ['Resolved', 'Rejected'], true)) out(['error' => 'Closed reports cannot accept a new photo'], 409);
    if ($report['ai_status'] === 'running') out(['error' => 'AI is reviewing this report. Please retry the photo after review finishes.'], 409);

    $f = $_FILES['photo'] ?? null;
    if (!$f || $f['error'] !== UPLOAD_ERR_OK || !is_uploaded_file($f['tmp_name'])) out(['error' => 'Upload failed'], 400);
    if ($f['size'] > 5 * 1024 * 1024) out(['error' => 'Photo must be 5 MB or less'], 413);
    // Trust the file's content, not its name or the browser-sent type
    $mime = (new finfo(FILEINFO_MIME_TYPE))->file($f['tmp_name']);
    $imageInfo = getimagesize($f['tmp_name']);
    if (!in_array($mime, ['image/jpeg', 'image/png', 'image/webp'], true) || !$imageInfo)
        out(['error' => 'JPEG, PNG or WebP images only'], 415);
    if (($imageInfo[0] * $imageInfo[1]) > 12000000) out(['error' => 'Photo dimensions must be 12 megapixels or less'], 413);

    $h = bin2hex(random_bytes(16));
    $name = substr($h, 0, 8) . '-' . substr($h, 8, 4) . '-' . substr($h, 12, 4) . '-' . substr($h, 16, 4) . '-' . substr($h, 20);
    // Decode and re-encode the image so EXIF metadata (including GPS) is not retained.
    if (!saveStrippedPhoto($f['tmp_name'], $dir . $name, $mime)) {
        out(['error' => 'Could not save photo'], 500);
    }
    $pdo = db();
    if ($report['photo_id']) {
        $s = $pdo->prepare('UPDATE report_photos SET file_name = ?, mime = ?, sha256 = ? WHERE id = ? AND report_id = ?');
        $s->execute([$name, $mime, hash_file('sha256', $dir . $name), $report['photo_id'], $rid]);
        if (!$s->rowCount()) { @unlink($dir . $name); out(['error' => 'Could not replace photo'], 500); }
        @unlink($dir . $report['old_file_name']);
        $pid = (int)$report['photo_id'];
    } else {
        try {
            $pdo->prepare('INSERT INTO report_photos (report_id, file_name, mime, sha256) VALUES (?, ?, ?, ?)')
                ->execute([$rid, $name, $mime, hash_file('sha256', $dir . $name)]);
        } catch (PDOException $e) {
            @unlink($dir . $name);
            out(['error' => 'Could not attach photo'], 409);
        }
        $pid = (int)$pdo->lastInsertId();
    }
    // A retry after a failed photo upload must cause triage to inspect the newly attached image.
    db()->prepare("UPDATE reports SET ai_status = 'pending', ai_category = NULL, ai_priority = NULL, ai_summary = NULL,
        ai_visible_issue = NULL, ai_consistency = NULL, ai_confidence = NULL, ai_reason = NULL, needs_verification = 0
        WHERE id = ? AND user_id = ? AND ai_status IN ('done', 'failed')")
        ->execute([$rid, $u['id']]);
    out(['id' => $pid], 201);
}

// Serve a photo only to its owner or an admin
$s = db()->prepare('SELECT p.file_name, p.mime, r.user_id FROM report_photos p JOIN reports r ON r.id = p.report_id WHERE p.id = ?');
$s->execute([(int)($_GET['id'] ?? 0)]);
$p = $s->fetch();
if (!$p || ($u['role'] !== 'admin' && $p['user_id'] != $u['id'])) out(['error' => 'Not found'], 404);
header('Content-Type: ' . $p['mime']);
header('X-Content-Type-Options: nosniff');
header('Cache-Control: private, max-age=3600');
readfile($dir . $p['file_name']);
