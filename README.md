# Quantistes Institutional Desk

Applicazione Next.js e React con export statico. Il gateway PHP autentica sul sottodominio anche le richieste dirette a script, dataset, risorse OCR e file della build. WordPress gestisce le credenziali e le sue estensioni di login. Il sottodominio preconfigurato è `desk.quantistes.pro`.

Apri **INSTALLAZIONE.html** per la procedura Hostinger, la configurazione del dominio e le verifiche dopo il caricamento.

## Sviluppo e build

Servono Node.js 22 o successivo, npm e Python 3.10 o successivo per creare gli ZIP. L’hosting esegue PHP 8.1 o successivo e richiede cURL, OpenSSL, zlib, sessioni PHP e riscrittura URL Apache/LiteSpeed. Il server Hostinger riceve la build completa.

```sh
npm ci
npm run build
npm run verify
node scripts/check-export.mjs
python3 scripts/package-hostinger.py --output release
```

La build genera `out/` per il confezionamento e `dist/` per l’anteprima privata. Usa `release/Quantistes-Hostinger.zip` per la pubblicazione su Hostinger. Le cartelle statiche intermedie presuppongono un controllo degli accessi esterno. Per ispezionare modifiche in sviluppo puoi servire `dist/` soltanto sul loopback, ad esempio con `python3 -m http.server 4173 --bind 127.0.0.1 --directory dist`.

## Modificare un blocco

| Parte | Dove si modifica |
| --- | --- |
| Navigazione, intestazione, struttura React | `src/ui/Navigation.jsx`, `src/ui/Masthead.jsx`, `src/pages/index.jsx` |
| Nomi delle sette sezioni | `src/ui/sections.js` |
| Materiali, colori, spaziature e font | `src/styles/tokens.css`, `chrome.css`, `workspace.css`, `mobile.css` |
| Superficie illustrativa Three.js e fallback vettoriale | `src/ui/QuantSurface.jsx` |
| Scoreboard, playbook e attribuzione | `desk/scoreboard/` |
| Mark CVI, greche, term structure e tail risk | `desk/volatility/` |
| Dealer flow e coperture | `desk/dealer/` |
| Percorsi, distribuzioni e replay | `desk/probability/` |
| Ricerca, modelli e audit | `desk/research/` |
| Report, estrazione PDF/OCR e serie | `desk/reports/` |
| Ladder, scalp e strike | `desk/scalping/` |
| Catalogo dinamico dei tool, portali delle viste | `desk/terminal/`, in particolare `quantistes-v25-flat-runtime.js` |
| Viste HTML, CSS originali e payload | `desk/views/`, `desk/styles/`, `desk/data/` |
| Accesso, pagina di login e configurazione del desk | `hosting/desk/` |
| Autorizzazione su WordPress | `wordpress/quantistes-desk-access/` |

Il router originale espone 32 strumenti e conserva le scelte di vista. React gestisce la cornice, i comandi principali e la navigazione responsive. Grafici e controlli analitici usano direttamente i motori e gli eventi della piattaforma. I blocchi condividono lo stesso documento. Gli script che alimentano i Web Worker mantengono ID, ordine e testo. Il lettore PDF riceve le risorse originali alla prima apertura di un documento. I dati degli import continuano a usare il browser e le modalità di archiviazione previste dal sorgente.

## Parità

`desk/document.json` descrive l’ordine originario e le impronte SHA-256. `npm run verify` ricostruisce l’impronta dell’intero HTML. `node scripts/check-export.mjs` controlla byte e ordine dei 111 programmi e dei 20 blocchi dati nell'export, compresi gli asset PDF/OCR su richiesta. Esegue i casi numerici di riferimento per ES, CVI/SPXW e ladder.

Per importare deliberatamente una nuova edizione, parti da un checkout separato ed esegui `python3 scripts/import-html.py /percorso/nuova-edizione.html`. Verifica le differenze in `desk/` e i riferimenti di parità prima di aggiornare la build. Le modifiche alla sola veste grafica si applicano in `src/`.

Le licenze dei caratteri, delle librerie e i notice presenti nel documento originale sono inclusi in `licenses/` e `desk/data/`.
