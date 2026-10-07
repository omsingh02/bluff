# Security policy

## Reporting a vulnerability

Please **do not open a public issue** for security problems.

Use GitHub's private reporting instead: **[Report a vulnerability](https://github.com/omsingh02/leery/security/advisories/new)**
(Security tab → *Report a vulnerability*). You'll get an acknowledgement within a few days, and a fix or a clear
answer as soon as it can be reproduced.

## What is in scope

Leery runs all game rules inside Postgres, so the interesting surface is the database API (`public.leery_*` functions)
and the client that talks to it. Examples of things worth reporting:

- seeing another player's hand, or the face-down pile, before it is revealed
- acting out of turn, acting as another player, or faking a result
- getting a room into a state that cannot advance (a stuck game) or that nobody can leave
- reading or writing anything in the private `game` schema, or calling anything except the 13 documented functions
- anything that makes the server leak internals (Postgres errors, tokens, other players' data)
- XSS / CSP bypasses in the web app

## What is not a vulnerability

- The Supabase URL and publishable key in the client bundle are public by design; access is enforced by the database
  functions, not by that key.
- Volumetric denial-of-service and spam (rate limits exist, but a determined botnet needs an edge rate-limiter).
- Look-alike player names that use different alphabets.

## Supported versions

Only the latest commit on `main` (the deployed version) is supported.
