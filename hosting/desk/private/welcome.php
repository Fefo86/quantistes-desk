<?php
declare(strict_types=1);
function qd_login(int $status = 200, string $note = ''): never {
    http_response_code($status);
    header('Content-Type: text/html; charset=utf-8');
    if (session_status() === PHP_SESSION_ACTIVE) { session_write_close(); }
?>
<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark"><title>Accesso · Quantistes Institutional Desk</title>
<style>
<?php if (is_file(__DIR__.'/login-font.php')) { include __DIR__.'/login-font.php'; } ?>
*{box-sizing:border-box}body{margin:0;min-height:100svh;background:#060607;color:#eeeeef;font:16px/1.5 'Bloomberg Fixed U','Desk Mono','IBM Plex Mono',Consolas,ui-monospace,monospace}header{display:flex;align-items:center;gap:12px;padding:9px clamp(14px,2vw,45px);background:#101113;border-block:2px solid #f4982f;border-bottom:1px solid #3a3a3d}header svg{width:26px;height:26px;color:#ffa636}header b{font:700 22px Arial,sans-serif;letter-spacing:-.055em}header span{border-left:1px solid #535356;padding-left:15px;color:#c4c4c6;font-size:14px}main{min-height:calc(100svh - 94px);display:grid;place-items:center;padding:24px 14px}.login{width:min(100%,35rem);border:1px solid #4b4b4e;background:#101113}.bar{display:flex;gap:10px;align-items:center;background:#222326;border-bottom:1px solid #59595b;color:#ffab38;font-size:14px;padding:8px 15px}.bar svg{width:16px;height:16px}.body{padding:clamp(22px,4vw,42px)}h1{font-family:inherit;font-size:clamp(25px,3vw,39px);font-weight:600;line-height:1.15;letter-spacing:-.065em;margin:0 0 13px}p{font-size:15px;color:#c3c3c5;max-width:42ch;margin:0 0 24px}.notice{color:#ff9b9b}a{display:inline-block;background:#ffab38;color:#100d08;font-size:15px;font-weight:700;text-decoration:none;padding:9px 16px}a:hover{background:#ffc15d}a:focus-visible{outline:2px solid #71d8f5;outline-offset:4px}footer{border-top:1px solid #343436;color:#b9b9bd;font-size:13px;padding:10px clamp(14px,2vw,45px);display:flex;justify-content:space-between}
</style></head><body><header><svg viewBox="0 0 36 36" aria-hidden="true"><path d="M10 3h18l5 5-5 18-7 6H6l-4-5L7 8zm3 6-2 2-3 14h10l3-3-6-5h7l3-8zm9 16h7l5 8h-8z" fill="currentColor" fill-rule="evenodd"/></svg><b>Quantistes</b><span>Institutional Desk</span></header>
<main><section class="login"><div class="bar"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M7 10V7a5 5 0 0 1 10 0v3"/><rect x="4" y="10" width="16" height="11"/><path d="M12 14v3"/></svg>Area riservata</div><div class="body"><h1>Accedi al desk</h1><p>Usa il tuo account Quantistes per aprire il terminale SPX ed ES.</p>
<?php if ($note !== ''): ?><p class="notice" role="alert"><?= htmlspecialchars($note, ENT_QUOTES, 'UTF-8') ?></p><?php endif; ?>
<a href="/auth/start">Accedi con WordPress</a></div></section></main><footer><span>Quantistes.pro</span><span>SPX · ES</span></footer></body></html>
<?php exit;
}
