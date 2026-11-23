<?php
// Usage: php database/seed_admin.php "Full Name" email@example.com
require __DIR__ . '/../src/config.php';
if (PHP_SAPI !== 'cli') exit("CLI only\n");
[, $name, $email] = $argv + [null, null, null];
if (!$name || !filter_var($email, FILTER_VALIDATE_EMAIL)) exit("Usage: php seed_admin.php \"Name\" email@example.com\n");
if ((int)db()->query("SELECT COUNT(*) FROM users WHERE role = 'admin'")->fetchColumn()) exit("An admin account already exists\n");
fwrite(STDOUT, 'Admin password (12+ characters): ');
$pass = rtrim((string)fgets(STDIN), "\r\n");
if (strlen($pass) < 12) exit("Password must be at least 12 characters\n");
db()->prepare("INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, 'admin')")
    ->execute([$name, $email, password_hash($pass, PASSWORD_DEFAULT)]);
echo "Initial admin account created.\n";
