# QuickPoll client

Start the QuickPoll API on port 3001 and apply the required [database migrations](../db/README.md). Run this command from the repository root.

```sh
npm --prefix client run dev
```

Open the Vite URL. Development and preview proxy `/api` and `/socket.io` to the local API. Set `QUICKPOLL_API_PROXY_TARGET` when starting Vite if the local API uses a different port. For production, route `/api` and `/socket.io` to the API, enable WebSocket upgrades, and serve `index.html` for client routes such as `/join` and `/organizer/123`. If the API permits the web origin, set `VITE_API_BASE_URL` at build time for a separate API origin. Socket.IO connects to that origin's `/socket.io` path.

Organizer and participant access are stored per poll in the current tab's session storage. Participants can submit one vote while a poll is active. The tab remembers server-confirmed votes. Without a saved receipt, the server checks for duplicates on submission. Organizers receive live result updates and can refresh manually as a fallback.

```sh
npm --prefix client exec -- tsc -b client
npm --prefix client test
npm --prefix client run lint
npm --prefix client run build
```
