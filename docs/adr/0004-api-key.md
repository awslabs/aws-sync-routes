# 4. API key

Date: 2019-05-24

## Status

Accepted

## Context

The requested functionality was to synchronize a specified route (either add or replace) from the main route table to the custom route tables, triggered from a log event.
Access to the API endpoint should be restricted since it can modify, custom route tables, but needs to be very simplistic and either accepts or rejects the call on the first request given the nature of the trigger.
Optimally, the Lambda proxy function should not be called if the user does not present the proper information to minimize costs.

## Decision

API Gateway API keys will be used to limit access given the constraints.

## Consequences

The end user must have the API key value to successfully call the endpoint.
