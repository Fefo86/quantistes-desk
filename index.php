<?php
declare(strict_types=1);
define('QUANTISTES_GATEWAY', true);
$config = require __DIR__ . '/private/config.php';
require __DIR__ . '/private/access.php';
require __DIR__ . '/private/welcome.php';
header('Cache-Control: private, no-store, max-age=0');
header('X-LiteSpeed-Cache-Control: no-cache');
header('Referrer-Policy: no-referrer');
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: SAMEORIGIN');
header('X-Robots-Tag: noindex, nofollow');
header('Vary: Cookie, Accept-Encoding');
$origin = $config['desk_origin'];
$scheme = isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off';
if (!$scheme || !hash_equals($origin, 'https://' . ($_SERVER['HTTP_HOST'] ?? ''))) {
    qd_redirect($origin . '/');
}
if (!in_array($_SERVER['REQUEST_METHOD'], ['GET','HEAD','POST'], true)) {
    header('Allow: GET, HEAD, POST');
    http_response_code(405);
    exit;
}
ini_set('session.use_strict_mode', '1');
ini_set('session.use_only_cookies', '1');
ini_set('session.gc_maxlifetime', '28800');
session_name('__Host-QuantistesDesk');
session_set_cookie_params(['lifetime' => 0, 'path' => '/', 'secure' => true, 'httponly' => true, 'samesite' => 'Lax']);
session_cache_limiter('');
session_start();
$path = explode('?', $_SERVER['REQUEST_URI'], 2)[0];
try {
    if ($path === '/auth/start' && $_SERVER['REQUEST_METHOD'] === 'GET') { qd_begin($config); }
    if ($path === '/auth/callback' && $_SERVER['REQUEST_METHOD'] === 'GET') { qd_callback($config); }
    if ($path === '/auth/logout') {
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') { header('Allow: POST'); http_response_code(405); exit; }
        if (empty($_SESSION['csrf']) || !is_string($_POST['csrf'] ?? null) || !hash_equals($_SESSION['csrf'], $_POST['csrf'])) {
            http_response_code(403); exit;
        }
        $ticket = $_SESSION['ticket'] ?? '';
        qd_clear();
        if ($ticket) {
            try { qd_remote($config, ['action' => 'qdesk_revoke', 'ticket' => $ticket]); }
            catch (RuntimeException $e) { /* The local session is already closed. */ }
        }
        qd_redirect('/');
    }
    if ($_SERVER['REQUEST_METHOD'] === 'POST') { http_response_code(405); exit; }
    if (!qd_admitted($config)) {
        if ($path === '/' || $path === '/index.php' || $path === '/index.html') { qd_login(); }
        http_response_code(401);
        exit;
    }
    $csrf = $_SESSION['csrf'];
    session_write_close();
    if ($path === '/auth/session') {
        header('Content-Type: application/json');
        echo json_encode(['csrf' => $csrf], JSON_THROW_ON_ERROR);
        exit;
    }
    $index = require __DIR__ . '/private/assets.php';
    $key = $path === '/' || $path === '/index.php' ? '/index.html' : $path;
    if (!isset($index[$key])) { http_response_code(404); exit; }
    [$file, $mime, $size, $packed, $gzip] = $index[$key];
    $stream = fopen(__DIR__ . '/private/files/' . $file . '.php', 'rb');
    if (!$stream) { http_response_code(503); exit; }
    // Every payload begins with an executable PHP denial, even on a misrouted request.
    fgets($stream);
    $acceptsGzip = preg_match('/(?:^|,)[ \t]*gzip(?:[ \t]*;[ \t]*q=(?!0(?:\.0*)?[ \t]*(?:,|$))[0-9.]+)?[ \t]*(?:,|$)/i', $_SERVER['HTTP_ACCEPT_ENCODING'] ?? '');
    $encoded = $gzip && $acceptsGzip;
    $etag = '"' . $file . ($encoded ? '-gz' : '-raw') . '"';
    if ($key !== '/index.html') {
        header('Cache-Control: private, no-cache, must-revalidate');
        header('ETag: ' . $etag);
        if (($_SERVER['HTTP_IF_NONE_MATCH'] ?? '') === $etag) { http_response_code(304); fclose($stream); exit; }
    }
    header('Content-Type: ' . $mime);
    header('Content-Length: ' . ($encoded ? $packed : $size));
    if ($encoded) { header('Content-Encoding: gzip'); }
    elseif ($gzip) { stream_filter_append($stream, 'zlib.inflate', STREAM_FILTER_READ, ['window' => 31]); }
    if ($_SERVER['REQUEST_METHOD'] !== 'HEAD') { fpassthru($stream); }
    fclose($stream);
} catch (Throwable $e) {
    qd_login(503, 'Il collegamento con WordPress è temporaneamente indisponibile. Riprova tra poco.');
}
