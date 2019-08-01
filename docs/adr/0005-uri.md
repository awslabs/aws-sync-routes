# 5. URI

Date: 2019-05-27

## Status

Accepted

## Context

The requested functionality was to synchronize a specified route (either add or replace) from the main route table to the custom route tables, triggered from a log event, which would have limited information available to construct the request.
There isn't an obvious fit for this in the official REST API URI specifications.

## Decision

The `/vpcs/{vpcId}/route-tables/{routeTableId}` URI will be used.

* `{vpcId}` is the VPC ID.
* `{routeTableId}` is the main route table ID

## Consequences

End users must know the VPC ID and the main route table ID to construct the URI.
