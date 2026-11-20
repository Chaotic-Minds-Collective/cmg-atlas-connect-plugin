# CMG Connect — Implementation Plan

## Purpose

Cross-grid chat, scheduled announcements, MOTDs, rules, invite links and Discord relays.

## Feature scope

- Global/grid chat with origin labels
- Tribe chat gated by membership
- Scheduled announcements and maintenance notices
- Login MOTDs, rules and invite links
- Discord relay with allowlists, anti-loop controls and rate limits
- Scoped admin broadcasts and audit

## Dependencies

- Core identity, scoped RBAC, server registry and outbox
- ATLAS adapter: verified connect/disconnect/chat callbacks
- CMG ATLAS Tribes for membership
- Discord service integration; Discord roles are not Core permissions

## Data ownership

Core owns identity, authorization, audit and durable events. Connect owns channels, schedules, templates, receipts, preferences and relay cursors. Preserve cluster/grid/server context.

## Milestones

1. Define message envelope and anti-loop contract.
2. Confirm Core event and outbox contracts for public chat and announcement workflows.
3. Build a read-only adapter with synthetic events.
4. Implement announcements/MOTD/rules/invite links, then tribe chat and Discord relay.
5. Test reconnects, duplicates, rate limits and cross-grid routing.

### Implemented: public message and relay-policy contract

- Added an immutable schema-v1 envelope for global, grid, tribe and announcement messages.
- Required explicit cluster/grid/server scope and origin channel identity.
- Required a provider tribe ID for tribe messages and excluded private/direct messages.
- Added explicit destination allowlisting, origin/visited-destination loop checks, a two-hop limit and immutable relay-trace recording after successful delivery.
- Added strict timestamp, identifier and message-length validation.
- Added dependency-free Node.js tests and a Node 22 GitHub Actions workflow.

This milestone only validates message metadata and relay eligibility. It does not send messages, connect to Discord, persist state, schedule announcements or claim native ATLAS callback compatibility.

### Implemented: Core public chat event adapter

- Normalize Core's documented `game.event.received` outbox wrapper for `chat.global` and `chat.tribe`.
- Require Core event record ID, provider event ID, timestamp, cluster/server scope and ATLAS game identity.
- Preserve nullable legacy grid/correlation metadata without inventing values.
- Preserve the provider-specific inner payload as detached, immutable JSON.
- Add tests for supported event types, unsupported types, missing metadata, timestamp normalization and payload immutability.

Core's current published contract does not specify canonical inner chat fields or Connect origin/destination channel mapping. This adapter deliberately does not invent message body, author, channel or Discord routing. Those contracts must be defined before delivery work.

## Technical gates and risks

- Core currently accepts normalized `chat.global` and `chat.tribe` game events. Durable announcement events, channel preferences and delivery receipts still need an explicit Core contract.
- ATLAS chat/login hooks are unverified; no in-game UI claim before isolated tests.
- Choose native popup or chat fallback only after callback and UI capabilities are verified.
- Never relay private messages or unapproved channels.
- Discord roles are not a substitute for Core scoped authorization.

## Shared engineering requirements

- Use authenticated, least-privilege Core APIs; no direct database credentials in plugins.
- Preserve provider identifiers as strings; display names are not identifiers.
- Carry cluster, grid and server context on applicable records/events.
- Use stable event IDs, idempotency keys and correlation IDs.
- Keep network work off game-critical threads; use bounded timeouts, retries and circuit breakers.
- Keep secrets out of source control and separate credentials per server/integration.
- Add unit tests, fake-adapter contract tests and isolated runtime compatibility tests.
- Gate unsupported features behind explicit capabilities; fail closed for privileged actions.
- Do not deploy to production or change live server configuration during repository planning.

## Current readiness

The public message envelope, pure relay policy and Core public-chat outbox wrapper adapter are implemented. The Core outbox client now exposes fenced lease renewal and enforces one-event claims until a worker can heartbeat every outstanding lease concurrently. Canonical chat payload fields, Connect channel routing, durable delivery receipts, Discord delivery and native ATLAS callback compatibility remain future work.
