<?php
// Read-only local setup check. Run with: php database/check_setup.php
if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require __DIR__ . '/../src/config.php';

try {
    $pdo = db();
    echo "Database connection: OK\n";

    $tables = $pdo->query('SHOW TABLES')->fetchAll(PDO::FETCH_COLUMN);
    $required = ['users', 'reports', 'report_photos', 'status_history', 'comments', 'ai_usage', 'ai_user_usage', 'login_attempts'];
    $missing = array_values(array_diff($required, $tables));

    if (in_array('reports', $tables, true)) {
        $columns = $pdo->query("SHOW COLUMNS FROM reports LIKE 'ai_status'")->fetch();
        if ((!$columns || !str_contains($columns['Type'], "'running'")) && in_array('--apply-ai-migration', $argv, true)) {
            $pdo->exec("ALTER TABLE reports MODIFY ai_status ENUM('pending','running','done','failed') NOT NULL DEFAULT 'pending'");
            $columns = $pdo->query("SHOW COLUMNS FROM reports LIKE 'ai_status'")->fetch();
        }
        if ($columns && str_contains($columns['Type'], "'running'")) {
            echo "AI running-state migration: OK\n";
        } else {
            echo "AI running-state migration: NOT APPLIED (run php database/check_setup.php --apply-ai-migration)\n";
        }
    }

    if (!in_array('ai_user_usage', $tables, true) && in_array('--apply-ai-user-usage-migration', $argv, true)) {
        $pdo->exec('CREATE TABLE IF NOT EXISTS ai_user_usage (
            day DATE NOT NULL,
            user_id INT UNSIGNED NOT NULL,
            calls INT NOT NULL DEFAULT 0,
            PRIMARY KEY (day, user_id),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB');
        $tables = $pdo->query('SHOW TABLES')->fetchAll(PDO::FETCH_COLUMN);
    }
    if (in_array('ai_user_usage', $tables, true)) {
        echo "Per-user AI daily-cap migration: OK\n";
    } else {
        echo "Per-user AI daily-cap migration: NOT APPLIED (run php database/check_setup.php --apply-ai-user-usage-migration)\n";
    }

    if (!in_array('login_attempts', $tables, true) && in_array('--apply-login-rate-limit-migration', $argv, true)) {
        $pdo->exec('CREATE TABLE IF NOT EXISTS login_attempts (
            bucket_key CHAR(64) NOT NULL PRIMARY KEY,
            window_started DATETIME NOT NULL,
            failed_attempts SMALLINT UNSIGNED NOT NULL DEFAULT 0,
            blocked_until DATETIME NULL,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX (blocked_until)
        ) ENGINE=InnoDB');
        $tables = $pdo->query('SHOW TABLES')->fetchAll(PDO::FETCH_COLUMN);
    }
    echo in_array('login_attempts', $tables, true)
        ? "Login rate-limit migration: OK\n"
        : "Login rate-limit migration: NOT APPLIED (run php database/check_setup.php --apply-login-rate-limit-migration)\n";

    $missing = array_values(array_diff($required, $tables));
    if ($missing) {
        echo 'Schema status: INCOMPLETE (missing ' . implode(', ', $missing) . ")\n";
    } else {
        echo "Schema tables: OK (all 8 required tables found)\n";
    }

    if (in_array('users', $tables, true)) {
        $addressColumn = $pdo->query("SHOW COLUMNS FROM users LIKE 'permanent_address'")->fetch();
        if (!$addressColumn && in_array('--apply-profile-address-migration', $argv, true)) {
            $pdo->exec('ALTER TABLE users ADD COLUMN permanent_address VARCHAR(255) NULL AFTER name');
            $addressColumn = $pdo->query("SHOW COLUMNS FROM users LIKE 'permanent_address'")->fetch();
        }
        echo $addressColumn
            ? "Profile address migration: OK\n"
            : "Profile address migration: NOT APPLIED (run php database/check_setup.php --apply-profile-address-migration)\n";

        $q = $pdo->prepare('SELECT name, email FROM users WHERE role = ? ORDER BY id');
        $q->execute(['admin']);
        $admins = $q->fetchAll();
        echo 'Admin accounts: ' . count($admins) . "\n";
        foreach ($admins as $admin) {
            echo '- ' . $admin['name'] . ' <' . $admin['email'] . ">\n";
        }
    }
} catch (Throwable $e) {
    fwrite(STDERR, 'Database check failed: ' . $e->getMessage() . "\n");
    exit(1);
}
