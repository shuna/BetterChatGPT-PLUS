# Local Stream Proxy Testing

This guide adds a local-only proxy harness for verifying streaming status UI without touching the production Cloudflare Worker.

## Why this exists

The deployed proxy can fail in ways that still look like a successful stream in the UI. This harness helps reproduce those cases locally so we can verify:

- a normal completion shows as completed
- `finish_reason=length` shows the truncated/max-tokens warning
- stopping an in-flight stream shows interrupted
- proxy-side failures surface as failures instead of silent success

## Scope

The local harness lives under [`scripts/mock-stream-proxy.cjs`](/Users/suzuki/weavelet-canvas/scripts/mock-stream-proxy.cjs). It does **not** modify anything under [`worker/`](/Users/suzuki/weavelet-canvas/worker), so it will not trigger the Cloudflare Worker deploy workflow by itself.

## Start the app

Run the app normally:

```bash
yarn dev
```

In a second terminal, start the mock proxy:

```bash
yarn dev:mock-proxy
```

Defaults:

- endpoint: `http://127.0.0.1:8790`
- bearer token: `local-test-token`

You can override them:

```bash
MOCK_PROXY_PORT=8791 MOCK_PROXY_AUTH_TOKEN=my-token yarn dev:mock-proxy
```

## Configure the app

Open the app in Chrome and point Proxy Settings at the local harness:

- Proxy URL: `http://127.0.0.1:8790`
- Proxy auth token: `local-test-token`

Use any valid model selection in the UI. The mock proxy ignores the upstream endpoint and model, but the editor still requires a valid model before it enables generation.

## Prompt triggers

The mock proxy chooses its behavior from the prompt text.

- `complete-case`
  - sends a normal streamed completion
- `length-case`
  - finishes with `finish_reason=length`
- `interrupt-case`
  - streams slowly enough that you can click stop
- `error-case`
  - emits a proxy error event after a few chunks

## Suggested checks

### 1. Max tokens / truncated completion

Send:

```text
length-case
```

Expected:

- streamed text appears
- after completion, the message shows the max-tokens/truncated warning

### 2. User interruption

Send:

```text
interrupt-case
```

Click stop while the message is still streaming.

Expected:

- streaming stops
- the message shows the interrupted status

### 3. Proxy error visibility

Send:

```text
error-case
```

Expected:

- the stream does not silently appear successful
- error UI or recovery affordance appears, depending on the active flow

## Notes

- This harness intentionally focuses on UI/status behavior, not perfect proxy parity.
- Recovery is stubbed just enough to avoid breaking local flows; it is not intended as a full Worker replacement.
- If you need browser automation on top of this, add a separate local-only E2E layer rather than coupling it to the Cloudflare Worker.
