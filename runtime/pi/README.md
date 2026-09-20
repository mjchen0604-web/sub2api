# Native Pi runtime for Sub2API

This is the private execution component of the existing Sub2API product. The account UI's **Native Pi** OAuth option uses the pinned official `@earendil-works/pi-ai@0.85.1` package for login, refresh, and `openai-codex-responses`. Standard accounts retain their existing route.

The admin starts authorization with a Sub2API owner user ID. The runtime owns PKCE and state; the completed credentials carry `harness_kind=pi` and `pi_owner_user_id`. Only API keys owned by that user can use the account. Use a dedicated group to avoid unrelated users selecting this account. Per-account proxies and compact requests are currently rejected on this route.

Requests enter the same `/v1/responses` endpoint. Sub2API obtains the account's token under its existing refresh/cache lock and calls the private runtime. Pi constructs its native headers, including `originator=pi`. Incoming Codex turn metadata and caller-supplied `previous_response_id` are rejected. This route does not relabel an arbitrary Codex request. It accepts Responses input plus function tools, reasoning and output options; it forces `stream=true` and `store=false` upstream. The gateway can still return an ordinary JSON response when the downstream request is nonstreaming.

The session key is an HMAC over the owner, credential record, OAuth account, model and caller session. It is stable across token refresh and isolated across those bindings. A stable caller session header/cache key is required. Concurrent turns in one session return a conflict; serialize them. Pi owns cached WebSocket continuation, selecting delta input with `previous_response_id` only when all other request options and the previous input prefix match. Changing options legitimately causes full-context fallback. `pi_transport` in credentials accepts `auto`, `sse`, `websocket`, or `websocket-cached` (default `sse`).

## Run locally

Use Node 24 or newer. Install with `npm ci --prefix runtime/pi`. Create a private file containing at least 32 random secret characters and set `PI_RUNTIME_SECRET_FILE` in both processes. Start `npm start --prefix runtime/pi`; it binds `127.0.0.1:8091` by default. Set `PI_RUNTIME_URL=http://127.0.0.1:8091` in the gateway. Keep the secret outside the repository.

For Docker, build from the repository root:

```sh
docker build -f runtime/pi/Dockerfile -t local/sub2api-pi-runtime:0.85.1 .
```

Merge `deploy/docker-compose.pi.yml` with the existing Compose deployment. The secret file must be mode 0600 and readable by UID 1000 in both containers. The runtime needs outbound HTTPS/WSS but has no published host port. Browser OAuth runs through the existing admin form; paste the localhost callback URL back into that form. OAuth login sessions expire after ten minutes; only one pending browser login is supported by the SDK's fixed callback listener.

The private runtime API is bearer authenticated:

- `GET /health`: pinned adapter and health.
- `POST /oauth/start`: owner ID; returns authorization URL/session ID.
- `POST /oauth/complete`: matching owner/session and callback URL; returns credentials to the authenticated admin workflow.
- `POST /oauth/refresh`: refresh token plus expected owner/account; rejects a changed account.
- `POST /responses`: bound account credential and Responses input; returns raw upstream SSE, or SSE frames representing native WebSocket events.

Do not publish these endpoints directly. The gateway does not follow redirects or use ambient HTTP proxies when communicating with this private service.

## Evidence and tests

`npm test --prefix runtime/pi` verifies native SDK request formation, raw SSE bytes, real local WebSocket reuse/delta behavior, OAuth state/owner checks, credential isolation, and concurrent-turn rejection. The Go service tests cover API-key ownership, invalid ingress, native refresh routing and refresh-binding validation. The frontend composable test checks that both OAuth steps preserve the same owner and runtime.

`PI_AUTH_FILE=/private/path/auth.json node runtime/pi/verify-live.mjs` opts into two real requests using an existing local OAuth access token. This tests request execution; it does **not** prove a new browser OAuth login. It requests `gpt-6-astra` by default, exercises a function call and result continuation, and independently checks the models declared in upstream response events. Use `PI_TRANSPORT=websocket-cached` to test connection reuse and delta continuation. Tokens, prompts, responses, state values and raw identifiers are never written by this runner.

The passive observer requires complete SSE frames and exact terminal event types. `[DONE]`, EOF, comments and incomplete frames cannot become success. It records terminal status and interruption independently; an interrupted stream with no terminal serializes status as `null`. Duplicate terminal events are idempotent and conflicting evidence remains a conflict. Its buffers and model set are bounded.

`responses_upstream_audit` records ordinary gateway HTTP boundary evidence; `pi_upstream_audit` records the Pi SDK's actual final outbound evidence. Header and body turn metadata are inspected independently. Logs contain field presence, known identifier names, model declarations and turn-state presence/length, never credentials or original identifier/state values. These new audit fields are structured server logs, not a new dashboard screen.

## Live acceptance on 2026-09-20

Native Pi SSE and WebSocket both returned complete responses and passed the function-call/tool-result exercise using the existing local OAuth access token. Both requested `gpt-6-astra`; the observed response model was `gpt-5.6-luna`. The runner correctly failed model acceptance. Do not treat HTTP 200, `originator=pi`, or a completed stream as proof of GPT-6 access. A fresh browser authorization and long-duration refresh still need live acceptance.

Live cached-WebSocket continuation also passed after using Pi's own replay representation and excluding its synthetic missing-tool-result placeholders: `connectionsCreated=1`, `connectionsReused=1`, `deltaRequests=1`, `fullContextRequests=1`, `sseFallbacks=0`. The second outbound request had `previous_response_id`, and both turns had `terminal_status=completed` and `stream_interrupted=false`. GPT-6 model acceptance still failed independently. The runtime snapshots caller input so later array mutations cannot corrupt Pi's cached request baseline. SSE remains the default; enable `websocket-cached` explicitly when required.

Pi's SSE parser deliberately cancels its reader after the first terminal event. If EOF was not observed, the passive audit records `stream_interrupted=true` even when `terminal_status=completed`; this must not be rewritten as a fully observed transport. The native live runner checks semantic completion/tool behavior separately from this transport flag. The standard gateway runner continues to require a non-interrupted stream.

## Local deployment and full gateway acceptance

The local service at `http://127.0.0.1:8080` now runs `0.2.6-pi.2`, source `5b2251fa0`, image `local/sub2api:pi-5b2251fa0`, with private runtime image `local/sub2api-pi-runtime:5b2251fa0`. The runtime has no published host port and shares a mode-0600 secret in the private `sub2api_pi_runtime_secret` Docker volume. The served frontend entry assets matched the production build. PostgreSQL and Redis retained their existing containers/data.

A temporary owner-bound account using the authorized local OAuth access token, a group and an API key exercised the actual product path: Pi `openai-responses` client → Sub2API `/v1/responses` → native Pi runtime → upstream. Both requests returned HTTP 200; function arguments, tool-result continuation, final text, complete downstream terminal frames and non-interrupted downstream EOF passed. Runtime audit confirmed `originator=pi`, absent header/body Codex turn metadata, `store=false`, `stream=true`, and a turn-state value present with length 312 (value not logged). The upstream SDK's early SSE reader cancellation remains independently recorded.

Both upstream responses declared `gpt-5.6-luna` for requested `gpt-6-astra`, so the runner exited 1 with `protocolPassed=true, modelPassed=false`. The temporary account, group and key were deleted after acceptance. The deployed admin OAuth-start endpoint also generated a real Pi authorization URL with PKCE/state. The pending test authorization session was cleared; a new browser login was not completed and no live refresh token was rotated for this test.

The prior gateway image `local/sub2api:pi-aae631525` is retained. Deployment configuration before this update is backed up at `~/docker/sub2api/backups/pi-native-20260920/docker-compose.override.yml.before`; restoring that override and recreating only `sub2api` rolls the gateway back without replacing database contents. The latest repository commit also includes live replay-runner corrections; production runtime/backend source remains `5b2251fa0`.

## Takeover verification on 2026-09-20

The runtime now records `outbound.modelMatchesRequest` at the final SDK HTTP/WS boundary. This is a boolean comparison against the caller's requested model, so it adds no raw credential, identifier, or request content to logs. Local fixture tests exercise both transports.

The live runner now separately asserts outbound model preservation, semantic protocol completion, transport behavior, and response model acceptance. For cached WebSocket turn two, acceptance requires one created connection, connection reuse, delta input, `previous_response_id`, one full-context request, no SSE fallback, and uninterrupted terminal evidence. Merely printing debug counters or receiving final text no longer passes WS acceptance. A response-model failure no longer overwrites the other result flags.

Fresh requests using the authorized local access token reproduced:

| Requested model / route | Final SDK model preserved | Tools and continuation | Response declaration | Model acceptance |
| --- | --- | --- | --- | --- |
| `gpt-6-astra` / direct native SSE | yes | passed | `gpt-5.6-luna` | failed |
| `gpt-6-astra` / direct cached WS | yes | passed; reused connection and delta, no fallback | `gpt-5.6-luna` | failed |
| `gpt-5.6-luna` / direct native SSE control | yes | passed | `gpt-5.6-luna` | passed |

Both direct paths bypass Sub2API account selection and model mapping. This isolates the reproduced mismatch beyond that gateway boundary; it does not establish the provider's internal model identity or the reason for its declaration. No model alias, response rewrite, or relaxed GPT-6 expectation was introduced. Full GPT-6 acceptance remains blocked on an upstream response declaring the requested model family. Fresh browser login and long-duration token refresh remain unverified; these checks used the existing authorized token.

Validation: 10 runtime/acceptance tests and 12 integration/observer tests passed. Only the runtime needs rebuilding for the new outbound audit; the gateway binary is unchanged.

The local runtime has been rebuilt from `86d87ee75` and deployed as `local/sub2api-pi-runtime:takeover-20260920`. Both it and the existing gateway are healthy. A fresh temporary owner-bound account/group/key exercised the deployed gateway twice: HTTP 200, complete downstream SSE, tool arguments, tool result, and exact final text passed; both model declarations remained `gpt-5.6-luna`, and the runner correctly exited 1. Deployed runtime logs confirmed `modelMatchesRequest=true` for both turns. All temporary entities were removed. No OAuth login or refresh-token rotation was performed.

The previous runtime image remains available. The Compose override before this update is saved at `~/docker/sub2api/backups/pi-takeover-20260920/docker-compose.override.yml.before`. To roll back only this change, restore that file and recreate only `pi-runtime` with `docker compose up -d --no-deps --pull never pi-runtime` in the existing deployment directory; no database restore is required.
