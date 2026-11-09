# QuickPoll client

Start the QuickPoll API on port 3001 and apply the required [database migrations](../db/README.md). Run this command from the repository root.

```sh
npm --prefix client run dev
```

Open the Vite URL. Development and preview proxy `/api` and `/socket.io` to the local API. Set `QUICKPOLL_API_PROXY_TARGET` when starting Vite if the local API uses a different port. For production, route `/api` and `/socket.io` to the API, enable WebSocket upgrades, and serve `index.html` for client routes such as `/join` and `/organizer/123`. If the API permits the web origin, set `VITE_API_BASE_URL` at build time for a separate API origin. Socket.IO connects to that origin's `/socket.io` path.

Register and sign in to save new polls to your account. Open **My Polls** to manage them on another device. Account sessions use a server-managed HttpOnly cookie. Anonymous and older polls still use their original tab-specific organizer access and are not added to your account automatically.

Open **My Sessions** to prepare and run a multi-question session. Add your questions in order, start the session to allow joining, then open and close each question. Open the public session presentation for a stable join QR and live results. Participants keep their session access when refreshing the same tab, and the final summary is available after the last question closes. Vote totals are shown per question. The API does not provide a count of joined participants.

Participants can join without an account and submit one vote while a poll is active. The tab remembers server-confirmed votes. Without a saved receipt, the server checks for duplicates on submission. Organizers receive live result updates and can refresh manually as a fallback.

For account actions over HTTP on a trusted development LAN, add the exact frontend origin, including port, to `QUICKPOLL_ALLOWED_ORIGINS` in the server environment and restart the API. Keep `/api` on the same browser origin through the Vite proxy. Cookies are scoped to their host, so sign in separately when switching between localhost and the LAN address. HTTP development traffic is unencrypted. Production account sessions require HTTPS and an explicitly allowed HTTPS origin. See the [server auth guide](../server/README.md).

## Presentation and joining over Wi-Fi

Choose **Open Presentation** in the organizer dashboard to open the public `/present?code=…` route in a separate tab. The page fetches public poll data and generates its QR code locally. For production, include `/present` in the same `index.html` fallback as other client routes.

For a LAN rehearsal, put the host computer and phone on the same trusted Wi-Fi network. Find the host computer's LAN IP, replace the example IP below, and run this from the repository root. The `--host` flag deliberately makes the Vite dev server reachable on the LAN.

```sh
VITE_PUBLIC_APP_URL=http://192.168.1.42:5173 npm --prefix client run dev -- --host 0.0.0.0 --port 5173 --strictPort
```

`VITE_PUBLIC_APP_URL` is the public client origin, including its port when needed. Set it before starting Vite or building for deployment. Without it, QuickPoll uses the browser's current origin and warns when that address is local-only. Keep the backend behind the Vite proxy during LAN testing. Review the existing proxy and backend CORS settings if you use a separate API origin. The phone must be able to reach the client port, and the proxy must forward both `/api` and `/socket.io`.

Open the configured client URL on your phone first. Then create a poll on the host computer, open Presentation, scan the QR, and check that the phone opens the same public join page. Activate the poll and cast a vote from the phone to verify live results.

## Checks

```sh
npm --prefix client exec -- tsc -b client
npm --prefix client test
npm --prefix client run lint
npm --prefix client run build
```
