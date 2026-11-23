<?php
declare(strict_types=1);
function qd_random(): string {
    return rtrim(strtr(base64_encode(random_bytes(32)), '+/', '-_'), '=');
}
function qd_redirect(string $url): never {
    header('Location: ' . $url, true, 303);
    exit;
}
function qd_remote(array $config, array $fields): array {
    $ch = curl_init($config['wp_endpoint']);
    curl_setopt_array($ch, [
        CURLOPT_POST => true, CURLOPT_POSTFIELDS => http_build_query($fields),
        CURLOPT_RETURNTRANSFER => true, CURLOPT_CONNECTTIMEOUT => 4, CURLOPT_TIMEOUT => 12,
        CURLOPT_FOLLOWLOCATION => false, CURLOPT_PROTOCOLS => CURLPROTO_HTTPS,
        CURLOPT_SSL_VERIFYPEER => true, CURLOPT_SSL_VERIFYHOST => 2,
        CURLOPT_HTTPHEADER => ['Accept: application/json', 'Cache-Control: no-store'],
    ]);
    $body = curl_exec($ch);
    $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $data = is_string($body) ? json_decode($body, true) : null;
    if ($status === 401 || $status === 403) { return ['active' => false]; }
    if ($status !== 200 || !is_array($data) || !array_key_exists('active', $data)) {
        throw new RuntimeException('Servizio di accesso temporaneamente indisponibile.');
    }
    return $data;
}
function qd_begin(array $config): never {
    session_regenerate_id(true);
    $state = qd_random();
    $verifier = qd_random();
    $_SESSION['pending'] = ['state' => $state, 'verifier' => $verifier, 'until' => time() + 600];
    $challenge = rtrim(strtr(base64_encode(hash('sha256', $verifier, true)), '+/', '-_'), '=');
    session_write_close();
    qd_redirect($config['wp_endpoint'] . '?' . http_build_query(['action' => 'qdesk_authorize', 'state' => $state, 'code_challenge' => $challenge]));
}
function qd_callback(array $config): never {
    $p = $_SESSION['pending'] ?? null;
    unset($_SESSION['pending']);
    if (!$p || $p['until'] < time() || !is_string($_GET['state'] ?? null) ||
        !hash_equals($p['state'], $_GET['state']) || !is_string($_GET['code'] ?? null) ||
        !preg_match('/\A[A-Za-z0-9_-]{43}\z/D', $_GET['code'])) {
        qd_login(400, 'Il collegamento è scaduto o appartiene a un’altra sessione.');
    }
    $result = qd_remote($config, ['action' => 'qdesk_exchange', 'code' => $_GET['code'], 'verifier' => $p['verifier']]);
    if (($result['active'] ?? false) !== true || !is_string($result['ticket'] ?? null) ||
        !preg_match('/\A[A-Za-z0-9_-]{43}\z/D', $result['ticket']) || ($result['expires'] ?? 0) <= time()) {
        qd_login(401, 'Accedi di nuovo con il tuo account WordPress.');
    }
    session_regenerate_id(true);
    $_SESSION = ['ticket' => $result['ticket'], 'expires' => (int) $result['expires'], 'checked' => time(), 'csrf' => qd_random()];
    session_write_close();
    qd_redirect('/');
}
function qd_clear(): void {
    $_SESSION = [];
    session_destroy();
    setcookie(session_name(), '', ['expires' => time()-3600, 'path' => '/', 'secure' => true, 'httponly' => true, 'samesite' => 'Lax']);
}
function qd_admitted(array $config): bool {
    if (empty($_SESSION['ticket'])) { return false; }
    if ($_SESSION['expires'] <= time()) { qd_clear(); return false; }
    if ($_SESSION['checked'] + 60 <= time()) {
        $result = qd_remote($config, ['action' => 'qdesk_session', 'ticket' => $_SESSION['ticket']]);
        if ($result['active'] !== true) { qd_clear(); return false; }
        $_SESSION['checked'] = time();
    }
    return true;
}
