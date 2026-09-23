# Duo Simulator — agent instructions

## Running the project (do not run `npm run dev` directly)

This project runs through the **unlocalhost CLI**, not directly through `npm run dev` on localhost:

```bash
unlocalhost up duosimulator      # start or restart the saved processes
unlocalhost restart duosimulator # restart after changes
unlocalhost list                 # verify that the project is registered
```

Generated URLs (the processes must already be running, including when started manually in Locale):

- App: `https://duosimulator.localhost:8443` → 127.0.0.1:5173 (vite)
- Screenshot server: `https://duosimulator-shots.localhost:8443` → 127.0.0.1:8787 (`/shot` and `/health` are used by the 3D viewer)

Comandi salvati per endpoint (`unlocalhost endpoint list duosimulator`):

- `web` → `npm run dev` (porta 5173, strictPort)
- `shots` → `npm run shots` (porta 8787; proxy `/shot` e `/health` di vite)

Notes:

- If `vite.config.ts` changes or new endpoints are needed, use `unlocalhost endpoint add` / `set-command`.
- Deployment builds use `npm run build` (output in `dist/`); local execution still goes through unlocalhost.
