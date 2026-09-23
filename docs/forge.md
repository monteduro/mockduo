# Deploy su Laravel Forge

MockDuo ha due parti: i file statici generati da Vite in `dist/` e il server
Node che inoltra e memorizza le immagini di ScreenshotOne su `/shot.png`.
La barra del browser viene disegnata nel canvas del visitatore. Nginx serve
`dist/` e inoltra solo `/shot.png` al processo Node su `127.0.0.1:8787`.

## 1. Sorgente e sito

Il progetto è un repository Git. Pubblicalo senza `.env`, `node_modules/`,
`dist/` e `server/cache/` (sono già in `.gitignore`), quindi crea in Forge un sito di
tipo **Static HTML** collegato al repository e al branch di rilascio.

- Dominio: `mockduo.stemonte.io`.
- Web directory nelle impostazioni avanzate: `/dist`.
- Mantieni il deploy zero downtime proposto da Forge.
- Collega il DNS al server e abilita il certificato TLS dal pannello Domains.

Il build richiede Node.js 22 o 24 LTS. Non avviare Vite come server di produzione.

## 2. Deploy script

Nel Deploy Script di Forge, conserva i macro del deploy zero downtime e usa:

```bash
$CREATE_RELEASE()
cd "$FORGE_RELEASE_DIRECTORY"
npm ci --include=dev
npm test
npm run build
$ACTIVATE_RELEASE()
sudo supervisorctl restart daemon-DAEMON_ID:*
```

Sostituisci `DAEMON_ID` con l'ID del processo creato al passo 4. Per il
primo deploy, prima che il processo esista, ometti temporaneamente l'ultima
riga. Se scegli un deploy standard, conserva invece il comando Git che Forge
genera e aggiungi `npm ci --include=dev` e `npm run build` dopo l'aggiornamento
del codice.

## 3. Variabili

Non serve installare Chromium o altri browser sul VPS. Prepara solo una
directory scrivibile per la cache, se vuoi conservarla fuori dalle release:

```bash
mkdir -p /home/forge/mockduo.stemonte.io/shot-cache
```

Nel file `.env` del sito su Forge imposta:

```dotenv
SCREENSHOTONE_ACCESS_KEY=INSERISCI_LA_CHIAVE
SHOT_CACHE_DIR=/home/forge/mockduo.stemonte.io/shot-cache
SHOT_TRUST_PROXY=1
```

`SCREENSHOTONE_ACCESS_KEY` è obbligatoria per nuove catture. Non pubblicare
la chiave nel repository.
`SHOT_TRUST_PROXY=1` usa `X-Real-IP` per i limiti per client: impostalo solo
quando Nginx sostituisce sempre quell'header, come nella configurazione sotto.

## 4. Processo screenshot

In Forge, **Processes → Add background process**:

- Name: `mockduo-shots`
- Command: `node --env-file-if-exists=.env server/screenshot-server.mjs`
- Working directory: `/home/forge/mockduo.stemonte.io/current`
- User: `forge`
- Processes: `1`

Il processo ascolta solo su `127.0.0.1:8787`. Prendi l'ID assegnato da Forge
e aggiungilo alla riga di riavvio del deploy script.

## 5. Nginx

Nella configurazione Nginx del dominio, mantieni le direttive gestite da
Forge e inserisci queste `location` nel blocco `server` HTTPS:

```nginx
location = /shot.png {
    proxy_pass http://127.0.0.1:8787;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_read_timeout 90s;
}

location = /health {
    proxy_pass http://127.0.0.1:8787;
}
```

La root del sito deve puntare a `dist/`, non a `public/` o alla root del repo.

## 6. Verifica

```bash
curl -I https://mockduo.stemonte.io/
curl https://mockduo.stemonte.io/health
curl -I https://mockduo.stemonte.io/social/og-image.png
```

La pagina e l'immagine OG devono rispondere 200; `/health` deve restituire
`ok`. Apri poi il sito e verifica una cattura con **Preview**.

Il server applica limiti per IP e globali alle nuove catture, limita la coda e
la cache, e rifiuta le destinazioni locali o private. Solo ScreenshotOne
cattura le pagine; il processo Node non apre un browser.
Puoi applicare un ulteriore limite per IP a `/shot.png` con `limit_req` di
Nginx; `limit_req_zone` va dichiarato nel blocco `http`, non nella `location`.

Documentazione: [siti](https://laravel.com/forge/docs/sites/the-basics),
[deploy](https://laravel.com/forge/docs/sites/deployments),
[processi](https://laravel.com/forge/docs/resources/background-processes).
