# CMG Connect

Cross-grid chat, scheduled announcements, MOTDs, rules, invite links and Discord relays.

This Chaotic Minds Gaming (CMG) module extends [CMG Core](https://github.com/Chaotic-Minds-Collective/cmg-atlas-core-plugin) and the [ATLAS integration adapter](https://github.com/Chaotic-Minds-Collective/cmg-atlas-plugin); it does not replace either foundation.

## Feature scope

- Global/grid chat with origin labels
- Tribe chat gated by membership
- Scheduled announcements and maintenance notices
- Login MOTDs, rules and invite links
- Discord relay with allowlists, anti-loop controls and rate limits
- Scoped admin broadcasts and audit

## Current implementation

- `src/message.js`: immutable schema-v1 public message envelope and pure relay policy. It validates scope, origin, channel type, provider tribe ID, content, allowlists, loop history and a two-hop ceiling. It does not send messages.
- `src/core-event.js`: normalizes Core's documented `game.event.received` outbox wrapper for `chat.global` and `chat.tribe`. It preserves the Core record/event IDs, timestamp, correlation ID, cluster/grid/server scope and an immutable copy of the provider payload.

Core's published contract defines the outbox wrapper and normalized event types, but does not define a canonical inner chat payload, player display identity, or Connect destination/origin channel mapping. The adapter therefore preserves the inner payload as opaque JSON and does not fabricate message content, author identity, or channel routing.

## Architecture and dependencies

- Core identity, scoped RBAC, server registry and outbox
- ATLAS adapter: intended source of connect/disconnect/chat callbacks; live callback behavior remains unverified (see [native validation issue #11](https://github.com/Chaotic-Minds-Collective/cmg-atlas-plugin/issues/11))
- CMG Tribes for membership
- Discord service integration; Discord roles are not Core permissions

Core remains authoritative for shared identity, authorization and platform records. ATLAS-native calls pass through the shared adapter. This module owns its domain state and must not connect directly to PostgreSQL.

## Package API

The package exposes a stable ESM root entrypoint for the existing message envelope, relay policy, Core event normalizer, retry helpers and Core outbox client. Explicit subpath exports are also available for those modules.

This repository is a private Git-based dependency and is not published to npm. Internal consumers should pin a reviewed Git commit SHA. The package root does not invent native chat payload fields or Discord channel routing; callers must supply a normalized message and an explicitly allowlisted destination.

## Development

Requires Node.js 22 or newer.

```sh
npm run check
npm test
```

GitHub Actions runs the same checks for pushes and pull requests.

## Safety and compatibility

- Only explicitly allowlisted public destinations may be considered for relay.
- Never relay private messages or unapproved channels.
- Relay history prevents immediate loops; production delivery still needs durable deduplication, bounded retries and reconnect tests.
- Native ATLAS chat/login hooks are unverified; no in-game UI or live relay capability is claimed.
- No production deployment, Discord connection, credential, database access or live server change is included.
