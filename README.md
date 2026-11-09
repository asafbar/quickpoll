# QuickPoll development

Start Docker Desktop and make sure Node.js, npm, and the project's existing dependencies are available. The launcher expects readable `.env`, `server/.env`, and `client/.env.local` files. Apply any required database migrations separately as described in the [database guide](db/README.md).

From the project root, run this command.

```sh
./dev.sh
```

The script starts the Compose `db` service, waits for PostgreSQL to become healthy, then starts the API on port 3001 and Vite on port 5173. It prints the local frontend URL and a LAN URL when it can detect a suitable IPv4 address. PostgreSQL is available to the host on port 5434.

Press **Ctrl+C** in the launcher terminal to stop its frontend and backend processes. PostgreSQL stays running and its data persists in the Compose `postgres_data` volume. If you deliberately want to stop PostgreSQL, use `docker compose stop db`.

## iPhone access over Wi-Fi

Connect the Mac and iPhone to the same trusted Wi-Fi network and open the printed frontend LAN URL on the iPhone. If the Mac's address changes, update the existing `VITE_PUBLIC_APP_URL` entry in `client/.env.local` to that origin, such as `http://192.168.1.42:5173`, then restart the launcher so join links and QR codes use the new address. The launcher leaves the environment file untouched. If a VPN or another interface affects detection, use the Mac's Wi-Fi IPv4 address from Network settings.

## Occupied ports

The launcher refuses to start a second service on port 3001 or 5173 and prints the listeners it finds. Inspect them with this command.

```sh
lsof -nP -iTCP:3001 -iTCP:5173 -sTCP:LISTEN
```

Stop the existing service through the terminal or app that started it, then rerun `./dev.sh`. If Compose reports a conflict on port 5434, identify the listener with `lsof -nP -iTCP:5434 -sTCP:LISTEN` and resolve it before retrying.
