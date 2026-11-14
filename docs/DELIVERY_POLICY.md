# CMG Connect — Delivery Policy Contract

## Scope

This module defines deterministic delivery identity and retry decisions. It does not perform network delivery, schedule retries, persist receipts, or connect to Discord or an ATLAS server.

## Idempotency identity

`createDeliveryIdempotencyKey(messageId, destination)` produces a stable key for one message and one destination. The destination is identified by platform and channel ID. Length-prefixed fields avoid ambiguous concatenation. A delivery worker should persist a unique constraint on this key and use it for every retry of the same delivery.

A different destination receives a different key. Replaying the same message to the same destination reuses the key. Do not include attempt number or retry time in the key.

## Failure classification

`evaluateDeliveryFailure` is a pure policy function:

- Transport failures (`statusCode: null`) are retryable.
- HTTP 408, 425, 429, and 5xx responses are retryable.
- Other HTTP failures, including ordinary 4xx responses and redirects, are permanent.
- The default maximum is five total attempts, including the initial attempt.
- Retry delay grows exponentially from one second and is capped at 60 seconds.
- A supplied retry-after delay is honored but capped at 60 seconds.
- When the attempt limit is reached, the result is exhausted and no retry is requested.

The caller must persist attempt counts and delivery outcomes, schedule the returned delay, handle provider-specific rate-limit semantics, and ensure duplicate attempts use the same idempotency key. This policy does not promise exactly-once delivery; that requires provider support and durable storage.

## Safety

No credentials, network clients, timers, persistence, Discord calls, native ATLAS callbacks, RCON, or game-state writes are included.
