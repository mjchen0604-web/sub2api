# Pi integration in Sub2API

This integration belongs to the existing Sub2API account/group/key gateway. The existing Codex session import owns upstream OAuth credentials and token refresh; Pi authenticates with a Sub2API API key through `/v1/responses`.

## Source basis

- Existing source baseline: `49a39b6dc1abed30fd227611e8af1108bc427610` in the user's `sub2api-0.2.6` repository. This is a source snapshot, not an official 0.2.6 release tag.
- Official 0.2.7 comparison: `aea725f2ea644d5592d0bbb1d63b607efa7e200a`. It has not been merged into this worktree. Byte comparisons confirmed `account_codex_import.go`, `openai_oauth_service.go`, and `openai_token_provider.go` match this worktree.
- Pi: `earendil-works/pi` v0.85.1, commit `d981de1229ef899957bbe968bc8dcda02a21f477`; the integration runner uses the published `@earendil-works/pi-ai` package pinned to 0.85.1 with a package lock.

Relevant upstream paths:

- Sub2API `backend/internal/handler/admin/account_codex_import.go`: native session normalization, duplicate identification, preservation of refresh credentials, expiry checks, account/group registration.
- Sub2API `backend/internal/service/openai_oauth_service.go`: refresh and credential update behavior.
- Pi `packages/coding-agent/docs/models.md`: custom provider configuration and literal/environment/command value semantics.
- Pi `packages/ai/src/api/openai-responses.ts` and `openai-responses-shared.ts`: actual request conversion and streaming/tool assembly used by the runner.
- Pi `packages/ai/src/api/openai-codex-responses.ts`: reviewed as the direct Codex provider; its connection-scoped WebSocket continuation is not used by this API-key gateway integration.

The OpenAI key dialog now includes Pi configuration, alongside the existing clients. Merge its `sub2api` provider into `~/.pi/agent/models.json`; retain other providers and keep the file private. The initial model is `gpt-5.5`, which must be enabled for the key's group; edit it to another available model as needed. An existing Codex model selection is reused if available.

## Verification

Install runner dependencies with `npm ci --prefix tools/pi-integration`. Set `SUB2API_KEY_FILE` to a private file containing a Sub2API API key, optionally `SUB2API_BASE_URL` and `SUB2API_MODEL`, then run `npm run verify --prefix tools/pi-integration`.

The runner uses Pi's real adapter, performs two requests with one session ID, validates a function call and its arguments, returns a synthetic tool result, and checks final text and successful stream termination. It disables retries and never logs credentials or raw provider responses.

Local verification on 2026-09-20:

- Native import updated the matching existing account: 1 updated, 0 created, 0 failed; original groups retained.
- Database booleans confirmed both access and refresh credentials present (no token values exported).
- Pi SDK 0.85.1 returned HTTP 200 twice: first `toolUse`, second `stop`; exact tool-result continuation passed.
- Pi CLI 0.85.1 with the configured provider returned exactly `PI_CLI_OK`.
- Frontend key-dialog and locale tests: 25 passed; TypeScript and production Vite build passed.

Scope: this verifies the existing HTTP Responses path, not Pi WebSocket continuation, all model entitlements, long-duration refresh behavior, or complete feature parity with every proposal in the source discussion. Frontend compilation is separate from updating the running server binary.
