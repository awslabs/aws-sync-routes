# 3. HTTP PATCH method

Date: 2019-05-21

## Status

Accepted

## Context

The requested functionality was to synchronize a specified route (either add or replace) from the main route table to the custom route tables, triggered from a log event, which would have limited information available to construct the request.
Of the available HTTP methods, there isn't a perfect fit for this use case.
PUT & PATCH were generally recommended for similar scenarios.

## Decision

The HTTP PATCH method will be used.

## Consequences

This implementation will not follow all of the [RFC5789](https://tools.ietf.org/html/rfc5789) specifications for a HTTP PATCH method- it does not use a PATCH document and it is idempotent.
