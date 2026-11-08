# QuickPoll client

Start the QuickPoll API on port 3001 and apply the required [database migrations](../db/README.md). Run this command from the repository root.

```sh
npm --prefix client run dev
```

Open the Vite URL. Development and preview proxy `/api` to the local API. Set `QUICKPOLL_API_PROXY_TARGET` when starting Vite if the local API uses a different port. When deploying the production build, serve `/api` from the API and configure the web host to serve `index.html` for client routes such as `/join` and `/organizer/123`. A separate API origin can be set with `VITE_API_BASE_URL` at build time if the API permits the web origin.

Organizer and participant access are stored per poll in the current tab's session storage. Organizers can refresh results from the dashboard. The participant flow stops at the ready-to-vote screen.

```sh
npm --prefix client exec -- tsc -b client
npm --prefix client run lint
npm --prefix client run build
```
