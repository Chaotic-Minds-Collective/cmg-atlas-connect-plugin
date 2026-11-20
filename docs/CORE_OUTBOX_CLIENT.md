# Core Event Outbox Client

Connect exposes an explicitly invoked client for Core's server-scoped game-event outbox API.

```js
import { createCoreEventOutboxClient } from "./src/core-outbox-client.js";

const outbox = createCoreEventOutboxClient({
  baseUrl: process.env.CMG_CORE_ORIGIN,
  serviceToken: process.env.CMG_CORE_SERVICE_TOKEN,
  serverId: process.env.CMG_CORE_SERVER_ID
});

const events = await outbox.claim({ limit: 1, leaseSeconds: 120 });
for (const event of events) {
  // Keep the active lease alive while downstream work is running.
  const renewal = setInterval(() => {
    void outbox.renew(event, { leaseSeconds: 120 }).catch(() => {
      // Stop downstream work if renewal fails; do not acknowledge a stale lease.
    });
  }, 40_000);

  try {
    // Normalize and process the event in the caller.
    // Acknowledge only after the caller has durably completed its work.
    await outbox.acknowledge(event, "delivered");
  } finally {
    clearInterval(renewal);
  }
}
```

The client requires an HTTPS origin, a service token assigned the Core `game_event_consumer` role at the exact server scope, and that server's UUID. It uses bounded request timeouts, disables redirects and caching, and validates that every returned event belongs to the configured server.

Claiming and acknowledging are separate explicit operations. The client does not schedule polling or lease-renewal timers, retry HTTP requests, persist receipts, send chat, or connect to Discord. It intentionally claims one event at a time until a higher-level worker can renew every outstanding lease concurrently. The caller must schedule renewals while long-running work is active and must stop work if renewal fails. Callers must process idempotently using the stable Core outbox event ID, renew the active lease before expiry during long work, and acknowledge only after their own durable work succeeds. A failed attempt can be released with `acknowledge(event, "failed", errorMessage)`; Core applies the retry delay. A lease conflict is surfaced as an error and must not be treated as successful delivery.

The Core API provides at-least-once delivery. A crash after downstream work but before acknowledgement can cause redelivery. This client does not claim exactly-once processing or native ATLAS callback compatibility.
