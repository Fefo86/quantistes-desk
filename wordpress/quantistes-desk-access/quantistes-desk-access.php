<?php
/**
 * Plugin Name: Quantistes Desk Access
 * Description: Collega il login WordPress al sottodominio privato di Institutional Desk.
 * Version: 1.0.0
 * Requires at least: 6.0
 * Requires PHP: 8.1
 * Author: Quantistes
 */
defined('ABSPATH') || exit;

function qdesk_table() {
    global $wpdb;
    return $wpdb->prefix . 'quantistes_desk_grants';
}

function qdesk_install() {
    global $wpdb;
    require_once ABSPATH . 'wp-admin/includes/upgrade.php';
    $table = qdesk_table();
    $collation = $wpdb->get_charset_collate();
    dbDelta("CREATE TABLE $table (
        digest char(64) NOT NULL,
        kind char(1) NOT NULL,
        challenge varchar(64) NOT NULL,
        user_id bigint(20) unsigned NOT NULL,
        proof text NOT NULL,
        deadline bigint(20) unsigned NOT NULL,
        PRIMARY KEY  (digest),
        KEY deadline (deadline)
    ) $collation;");
    if (!wp_next_scheduled('qdesk_prune')) {
        wp_schedule_event(time() + HOUR_IN_SECONDS, 'daily', 'qdesk_prune');
    }
}
register_activation_hook(__FILE__, 'qdesk_install');
register_deactivation_hook(__FILE__, static function () { wp_clear_scheduled_hook('qdesk_prune'); });
add_action('qdesk_prune', static function () {
    global $wpdb;
    $wpdb->query($wpdb->prepare('DELETE FROM ' . qdesk_table() . ' WHERE deadline <= %d', time()));
});

function qdesk_origin() {
    return rtrim(defined('QUANTISTES_DESK_ORIGIN') ? QUANTISTES_DESK_ORIGIN : 'https://desk.quantistes.pro', '/');
}
function qdesk_random() {
    return rtrim(strtr(base64_encode(random_bytes(32)), '+/', '-_'), '=');
}
function qdesk_value($input, $name) {
    $value = $input[$name] ?? '';
    return is_string($value) && preg_match('/\A[A-Za-z0-9_-]{43}\z/D', $value) ? $value : '';
}
function qdesk_headers() {
    nocache_headers();
    header('X-LiteSpeed-Cache-Control: no-cache');
    header('Referrer-Policy: no-referrer');
    if (!is_ssl()) {
        wp_die('Il collegamento al desk richiede HTTPS.', '', array('response' => 403));
    }
}
// Only WordPress can recover this proof. Its login cookie never leaves the issuer.
function qdesk_seal($cookie) {
    $iv = random_bytes(12);
    $tag = '';
    $cipher = openssl_encrypt($cookie, 'aes-256-gcm', hash('sha256', wp_salt('logged_in'), true), OPENSSL_RAW_DATA, $iv, $tag);
    return $cipher === false ? '' : base64_encode($iv . $tag . $cipher);
}
function qdesk_still_logged_in($row) {
    $bytes = base64_decode($row->proof, true);
    if ($bytes === false || strlen($bytes) <= 28) { return false; }
    $cookie = openssl_decrypt(substr($bytes, 28), 'aes-256-gcm', hash('sha256', wp_salt('logged_in'), true), OPENSSL_RAW_DATA, substr($bytes, 0, 12), substr($bytes, 12, 16));
    if (!$cookie) { return false; }
    $parts = wp_parse_auth_cookie($cookie, 'logged_in');
    return $parts && (int) $parts['expiration'] > time()
        && (int) wp_validate_auth_cookie($cookie, 'logged_in') === (int) $row->user_id;
}
function qdesk_authorize() {
    global $wpdb;
    qdesk_headers();
    $state = qdesk_value($_GET, 'state');
    $challenge = qdesk_value($_GET, 'code_challenge');
    if ($_SERVER['REQUEST_METHOD'] !== 'GET' || !$state || !$challenge) {
        wp_die('Richiesta di accesso non valida.', '', array('response' => 400));
    }
    if (!is_user_logged_in()) {
        $return = add_query_arg(array('action' => 'qdesk_authorize', 'state' => $state, 'code_challenge' => $challenge), admin_url('admin-post.php', 'https'));
        wp_redirect(wp_login_url($return), 302, 'Quantistes Desk');
        exit;
    }
    $cookie = isset($_COOKIE[LOGGED_IN_COOKIE]) ? wp_unslash($_COOKIE[LOGGED_IN_COOKIE]) : '';
    $uid = get_current_user_id();
    if (!$cookie || (int) wp_validate_auth_cookie($cookie, 'logged_in') !== $uid) {
        wp_die('Riapri la sessione WordPress per accedere al desk.', '', array('response' => 403));
    }
    $code = qdesk_random();
    $proof = qdesk_seal($cookie);
    $saved = $proof && $wpdb->insert(qdesk_table(), array('digest' => hash('sha256', $code), 'kind' => 'C',
        'challenge' => $challenge, 'user_id' => $uid, 'proof' => $proof, 'deadline' => time() + 90));
    if (!$saved) { wp_die('Accesso temporaneamente indisponibile.', '', array('response' => 503)); }
    // The redirect target is configuration owned by the WordPress administrator.
    $url = add_query_arg(array('code' => $code, 'state' => $state), qdesk_origin() . '/auth/callback');
    wp_redirect($url, 303, 'Quantistes Desk');
    exit;
}
function qdesk_backchannel() {
    global $wpdb;
    qdesk_headers();
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') { wp_send_json(array('active' => false), 405); }
    $action = (string) ($_POST['action'] ?? '');
    $exchange = $action === 'qdesk_exchange';
    $credential = qdesk_value($_POST, $exchange ? 'code' : 'ticket');
    if (!$credential) { wp_send_json(array('active' => false), 401); }
    $table = qdesk_table();
    $digest = hash('sha256', $credential);
    $row = $wpdb->get_row($wpdb->prepare("SELECT * FROM $table WHERE digest = %s AND kind = %s AND deadline > %d", $digest, $exchange ? 'C' : 'S', time()));
    if (!$row) { wp_send_json(array('active' => false), 401); }
    if ($action === 'qdesk_revoke') {
        $wpdb->delete($table, array('digest' => $digest, 'kind' => 'S'));
        wp_send_json(array('active' => false));
    }
    if (!qdesk_still_logged_in($row)) {
        $wpdb->delete($table, array('digest' => $digest));
        wp_send_json(array('active' => false), 401);
    }
    if (!$exchange) { wp_send_json(array('active' => true, 'expires' => (int) $row->deadline)); }
    $verifier = qdesk_value($_POST, 'verifier');
    $expected = rtrim(strtr(base64_encode(hash('sha256', $verifier, true)), '+/', '-_'), '=');
    if (!$verifier || !hash_equals($row->challenge, $expected)) { wp_send_json(array('active' => false), 401); }
    $ticket = qdesk_random();
    $expires = time() + 8 * HOUR_IN_SECONDS;
    // One conditional change also consumes the code when two requests race.
    $updated = $wpdb->query($wpdb->prepare("UPDATE $table SET digest = %s, kind = 'S', challenge = '', deadline = %d WHERE digest = %s AND kind = 'C' AND deadline > %d",
        hash('sha256', $ticket), $expires, $digest, time()));
    if ($updated !== 1) { wp_send_json(array('active' => false), 401); }
    wp_send_json(array('active' => true, 'ticket' => $ticket, 'expires' => $expires));
}
foreach (array('admin_post_', 'admin_post_nopriv_') as $prefix) {
    add_action($prefix . 'qdesk_authorize', 'qdesk_authorize');
    foreach (array('qdesk_exchange', 'qdesk_session', 'qdesk_revoke') as $action) {
        add_action($prefix . $action, 'qdesk_backchannel');
    }
}
