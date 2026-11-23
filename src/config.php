<?php
// Loads .env and returns a shared PDO connection.
$env = parse_ini_file(__DIR__ . '/../.env') ?: [];

function env(string $key, string $default = ''): string
{
    global $env;
    return $env[$key] ?? $default;
}

function db(): PDO
{
    static $pdo;
    return $pdo ??= new PDO(
        'mysql:host=' . env('DB_HOST', '127.0.0.1') . ';dbname=' . env('DB_NAME', 'civicai_app') . ';charset=utf8mb4',
        env('DB_USER', 'root'),
        env('DB_PASS'),
        [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]
    );
}
