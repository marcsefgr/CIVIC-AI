<?php
require __DIR__ . '/../../src/auth.php';
$d = input();
$name = trim($d['name'] ?? '');
$email = strtolower(trim($d['email'] ?? ''));
$pass = (string)($d['password'] ?? '');
if (mb_strlen($name) < 2 || mb_strlen($name) > 100 || !filter_var($email, FILTER_VALIDATE_EMAIL) ||
    strlen($pass) < 10 || !preg_match('/[a-z]/', $pass) || !preg_match('/[A-Z]/', $pass) ||
    !preg_match('/[0-9]/', $pass) || !preg_match('/[^A-Za-z0-9]/', $pass) ||
    ($d['adult_confirm'] ?? false) !== true)
    out(['error' => 'Use a name with at least 2 characters, a valid email, a 10+ character password with uppercase and lowercase letters, a number and a symbol, and confirm you are an adult.'], 422);
try { // role is not inserted: the schema default makes every signup a resident
    db()->prepare('INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)')
        ->execute([$name, $email, password_hash($pass, PASSWORD_DEFAULT)]);
} catch (PDOException $e) {
    $dup = $e->getCode() == 23000;
    out(['error' => $dup ? 'Email already registered' : 'Server error'], $dup ? 409 : 500);
}
out(['ok' => true], 201);
