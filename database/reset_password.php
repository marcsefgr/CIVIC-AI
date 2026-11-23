<?php
// Secure operator-assisted password recovery. Pass the new password through the environment.
if (PHP_SAPI !== 'cli') exit("CLI only\n");
require __DIR__ . '/../src/config.php';
$email = strtolower(trim($argv[1] ?? ''));
$password = (string)getenv('CIVIC_NEW_PASSWORD');
if (!filter_var($email, FILTER_VALIDATE_EMAIL)) exit("Usage: php database/reset_password.php account@example.org\n");
if (strlen($password) < 12) exit("Set CIVIC_NEW_PASSWORD to a password of at least 12 characters before running this command.\n");
$s = db()->prepare('UPDATE users SET password_hash = ? WHERE email = ?');
$s->execute([password_hash($password, PASSWORD_DEFAULT), $email]);
if (!$s->rowCount()) exit("No account was updated. Check the email address and try again.\n");
echo "Password updated. Sign in with the new password.\n";
