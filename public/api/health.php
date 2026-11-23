<?php
require __DIR__ . '/../../src/config.php';
header('Content-Type: application/json');
try {
    db();
    echo json_encode(['status' => 'ok']);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['status' => 'error']);
}
