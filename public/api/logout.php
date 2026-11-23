<?php
require __DIR__ . '/../../src/auth.php';
input();
session_destroy();
out(['ok' => true]);
