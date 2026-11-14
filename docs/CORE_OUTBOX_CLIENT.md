# Core Event Outbox Client

Connect exposes an explicitly invoked client for Core's server-scoped game-event outbox API.

```js
import { createCoreEventOutboxClient } from "./src/core-outbox-client.js";

const outbox = createCoreEventOutboxClient({
  baseUrl: process.env.CMG_CORE_ORIGIN,
  serviceToken: process.env.CMG_CORE_SERVICE_TOKEN,
  serverId: process.env.CMG_CORE_SERVER_ID
});

const events = await outbox.claim({ limit: 25, leaseSeconds: 120 });
for (const event of events) {
  // Normalize and process the event in the caller.
  // Acknowledge only after the caller has durably completed its work.
  await outbox.acknowledge(event, "delivered");
}
```

The client requires an HTTPS origin, a service token assigned the Core `game_event_consumer` role at the exact server scope, and that server's UUID. It uses bounded request timeouts, disables redirects and caching, and validates that every returned event belongs to the configured server.

Claiming and acknowledging are separate explicit operations. The client does not schedule polling, retry HTTP requests, persist receipts, send chat, or connect to Discord. Callers must process idempotently using the stable Core outbox event ID and acknowledge only after their own durable work succeeds. A failed attempt can be released with `acknowledge(event, "failed", errorMessage)`; Core applies the retry delay. A lease conflict is surfaced as an error and must not be treated as successful delivery.

The Core API provides at-least-once delivery. A crash after downstream work but before acknowledgement can cause redelivery. This client does not claim exactly-once processing or native ATLAS callback compatibility.
