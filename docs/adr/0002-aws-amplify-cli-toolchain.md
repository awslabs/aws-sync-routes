# 2. AWS Amplify CLI toolchain

Date: 2019-05-21

## Status

Accepted

## Context

The requested functionality was an API endpoint that would synchronize a specified route (either add or replace) from the main route table to the custom route tables, triggered from a log event.
All resources should be managed programmatically for an optimal possible user experience.

## Decision

The AWS Amplify CLI toolchain will be used for programmatically creating, updating, and destroying project resources.
The endpoint will be defined in an AWS API Gateway, and the synchronization functionality will be defined in a Lambda function.

## Consequences

End users will need the AWS CLI, NodeJS 8.11+, and the @aws-amplify/cli package installed.
Detailed instructions will be required.
