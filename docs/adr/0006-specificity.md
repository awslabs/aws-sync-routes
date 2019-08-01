# 6. Specificity

Date: 2019-07-23

## Status

Accepted

## Context

Feature requests for both summary routes and dynamic route discovery have been proposed so that new routes are automatically discovered and synchronized in order to reduce the risk of new routes being missed.

## Decision

Programmatically making changes to a production routing table is serious business that has the potential to cause network outages.
Only specified routes will be synchronized to prevent unintentional changes.

## Consequences

End users must update their request configuration when they add new routes that they want to sync or remove routes that should no longer be synced.
