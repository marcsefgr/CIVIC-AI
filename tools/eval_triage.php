<?php
// CLI: runs samples/manifest.csv through the real API (create report, upload photo, triage) and prints accuracy.
// Usage: set CIVIC_EMAIL=admin@x.com & set CIVIC_PASS=... & php tools\eval_triage.php [--keep] [--limit=N]
// Test reports are owned by the account you log in as and are deleted at the end unless --keep is given.
if (PHP_SAPI !== 'cli') exit('CLI only');
require __DIR__ . '/../src/config.php';

$base = rtrim(getenv('CIVIC_BASE') ?: 'http://civicai.test', '/');
$keep = in_array('--keep', $argv, true);
$failedOnly = in_array('--failed-only', $argv, true);
$limit = 999;
foreach ($argv as $a) if (str_starts_with($a, '--limit=')) $limit = (int)substr($a, 8);
$jar = tempnam(sys_get_temp_dir(), 'ck');

function call(string $method, string $url, $body = null, bool $json = true): array
{
    global $jar;
    $ch = curl_init($url);
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 90, CURLOPT_COOKIEJAR => $jar, CURLOPT_COOKIEFILE => $jar, CURLOPT_CUSTOMREQUEST => $method]);
    if ($body !== null) {
        curl_setopt($ch, CURLOPT_POSTFIELDS, $json ? json_encode($body) : $body);
        if ($json) curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
    }
    $res = curl_exec($ch);
    return [curl_getinfo($ch, CURLINFO_HTTP_CODE), json_decode((string)$res, true) ?? []];
}

[$c, $me] = call('POST', "$base/api/login.php", ['email' => getenv('CIVIC_EMAIL'), 'password' => getenv('CIVIC_PASS')]);
if ($c !== 200) exit("Login failed ($c). Set CIVIC_EMAIL and CIVIC_PASS.\n");
if ($me['role'] !== 'admin') exit("Log in as an admin: residents don't receive the AI fields needed for scoring.\n");

$f = fopen(__DIR__ . '/../samples/manifest.csv', 'r');
$hdr = array_map(fn($h) => trim($h, "\xEF\xBB\xBF \r\n"), fgetcsv($f));
$cases = [];
while (($r = fgetcsv($f)) !== false) if (count($r) === count($hdr)) $cases[] = array_combine($hdr, $r);
fclose($f);
if ($failedOnly) {
    $priorPath = __DIR__ . '/../samples/results.csv';
    if (!is_file($priorPath)) exit("No previous results.csv to select failed cases from.\n");
    $prior = fopen($priorPath, 'r');
    $priorHdr = array_map(fn($h) => trim($h, "\xEF\xBB\xBF \r\n"), fgetcsv($prior));
    $failedIds = [];
    while (($row = fgetcsv($prior)) !== false) {
        if (count($row) !== count($priorHdr)) continue;
        $item = array_combine($priorHdr, $row);
        if (($item['ai_status'] ?? '') === 'failed') $failedIds[$item['test_id']] = true;
    }
    fclose($prior);
    $cases = array_values(array_filter($cases, fn($case) => isset($failedIds[$case['test_id']])));
    if (!$cases) exit("No failed cases found in the previous results.csv.\n");
}
$cases = array_slice($cases, 0, $limit);

$used = (int)db()->query('SELECT calls FROM ai_usage WHERE day = CURDATE()')->fetchColumn();
$left = (int)env('AI_DAILY_CAP', '50') - $used;
if ($left < count($cases) * 2) exit("Daily cap: $left calls left; up to " . (count($cases) * 2) . " may be needed with automatic retries. Use --limit=" . intdiv($left, 2) . ".\n");

$resultsPath = __DIR__ . '/../samples/' . ($failedOnly ? 'results-retry.csv' : 'results.csv');
$out = fopen($resultsPath, 'w');
if (!$out) exit("Could not open results output file: $resultsPath\n");
fputcsv($out, ['test_id', 'exp_category', 'ai_category', 'exp_priority', 'ai_priority', 'exp_consistency', 'ai_consistency', 'confidence', 'needs_verification', 'ai_status', 'ai_reason']);
$ids = [];
$n = ['cat' => [0, 0], 'pri' => [0, 0], 'pri1' => 0, 'valid_ok' => [0, 0], 'mis_ok' => [0, 0], 'mis_flag' => 0, 'tricky_ok' => [0, 0], 'failed' => 0, 'urgent_flagged' => 0];
$lv = ['Low' => 0, 'Medium' => 1, 'High' => 2, 'Urgent' => 3];

foreach ($cases as $i => $t) {
    $path = __DIR__ . "/../samples/{$t['photo_folder']}/{$t['photo_file']}";
    [$c, $rep] = call('POST', "$base/api/reports.php", ['description' => $t['description'], 'location' => $t['location'], 'synthetic_confirm' => true]);
    if ($c !== 201) { echo "{$t['test_id']}: create failed ($c)\n"; continue; }
    $ids[] = $rid = $rep['id'];
    [$c] = call('POST', "$base/api/photo.php", ['report_id' => $rid, 'photo' => new CURLFile($path)], false);
    if ($c !== 201) { echo "{$t['test_id']}: photo failed ($c)\n"; continue; }
    [$c, $ai] = call('POST', "$base/api/triage.php", ['report_id' => $rid]);
    $st = $ai['ai_status'] ?? 'error';
    fputcsv($out, [$t['test_id'], $t['expected_category'], $ai['ai_category'] ?? '', $t['expected_priority_hint'], $ai['ai_priority'] ?? '', $t['expected_consistency'], $ai['ai_consistency'] ?? '', $ai['ai_confidence'] ?? '', $ai['needs_verification'] ?? '', $st, $ai['ai_reason'] ?? '']);
    printf("%s %-14s %-9s %-9s %s\n", $t['test_id'], $ai['ai_category'] ?? '-', $ai['ai_priority'] ?? '-', $ai['ai_consistency'] ?? '-', $st);
    if ($st !== 'done') { $n['failed']++; sleep(7); continue; }

    $exp = $t['expected_consistency'];
    if ($exp === 'match') {
        $n['valid_ok'][1]++; $n['valid_ok'][0] += $ai['ai_consistency'] === 'match';
        if ($t['expected_category'] !== '') { $n['cat'][1]++; $n['cat'][0] += $ai['ai_category'] === $t['expected_category']; }
        if ($t['expected_priority_hint'] !== '') {
            $n['pri'][1]++; $d = abs($lv[$ai['ai_priority']] - $lv[$t['expected_priority_hint']]);
            $n['pri'][0] += $d === 0; $n['pri1'] += $d <= 1;
        }
    } elseif ($exp === 'mismatch') {
        $n['mis_ok'][1]++; $n['mis_ok'][0] += $ai['ai_consistency'] === 'mismatch';
        $n['mis_flag'] += (int)$ai['needs_verification'];
        $n['urgent_flagged'] += ($ai['needs_verification'] && $ai['ai_priority'] === 'Urgent');
    } else {   // tricky: unclear or partial both acceptable
        $n['tricky_ok'][1]++; $n['tricky_ok'][0] += in_array($ai['ai_consistency'], ['unclear', 'partial'], true);
    }
    sleep(7);   // stay under free-tier requests per minute
}

if (!$keep && $ids) {
    $in = implode(',', array_map('intval', $ids));
    $files = db()->query("SELECT file_name FROM report_photos WHERE report_id IN ($in)")->fetchAll(PDO::FETCH_COLUMN);
    foreach ($files as $fn) @unlink(__DIR__ . '/../storage/uploads/' . $fn);
    db()->exec("DELETE FROM reports WHERE id IN ($in)");   // photos, history, comments cascade
}

$p = fn($a) => $a[1] ? sprintf('%d/%d (%.0f%%)', $a[0], $a[1], 100 * $a[0] / $a[1]) : 'n/a';
echo "\n=== RESULTS ===\n";
echo "Category correct (valid cases):        " . $p($n['cat']) . "\n";
echo "Priority exact (valid cases):          " . $p($n['pri']) . "\n";
echo "Priority within one level:             " . $p([$n['pri1'], $n['pri'][1]]) . "\n";
echo "Valid cases judged 'match':            " . $p($n['valid_ok']) . "\n";
echo "Mismatch cases judged 'mismatch':      " . $p($n['mis_ok']) . "\n";
echo "Mismatch cases flagged for human:      " . $p([$n['mis_flag'], $n['mis_ok'][1]]) . "\n";
echo "Tricky cases unclear/partial:          " . $p($n['tricky_ok']) . "\n";
echo "Flagged cases left at Urgent (must be 0): {$n['urgent_flagged']}\n";
echo "AI failures: {$n['failed']}\n";
echo "Per-case results: samples\\" . basename($resultsPath) . ($keep ? "\nTest reports kept (ids " . implode(',', $ids) . ")\n" : "\nTest reports deleted.\n");
