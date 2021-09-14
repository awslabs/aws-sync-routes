# AWS Sync Routes

Synchronizes the specified route from the [main/default route table][rtb] to all [custom route tables][rtb] in the [VPC][vpc].

The primary use case is for [VMware Cloud on AWS (VMC)](https://aws.amazon.com/vmware/) [software-defined datacenter (SDDC)][sddc] managed routes, but this could also be used as-is for any scenario where syncing AWS VPC routes to custom route tables is desired.

This solution should only cost a few dollars per month to operate- depending on the number of routes managed and the number of API calls.
Please see the pricing guides for further details: [AWS Lambda](https://aws.amazon.com/lambda/pricing/), [AWS API Gateway](https://aws.amazon.com/api-gateway/pricing/), [Amazon SNS](https://aws.amazon.com/sns/pricing/), [Amazon S3](https://aws.amazon.com/s3/pricing/), [Amazon CloudWatch Logs](https://aws.amazon.com/cloudwatch/pricing/), & [CloudFormation](https://aws.amazon.com/cloudformation/pricing/).

This is also an infrastructure as code solution, meaning that it should only require a few commands to deploy once the prerequisites are installed & configured, and was designed so that it should not require much attention thereafter.

Once deployed, the endpoint generally takes 1-3 seconds to execute when called, and is [idempotent](https://en.wikipedia.org/wiki/Idempotence), so changes will only be implemented once when the specified route either does not exist in one or more custom route tables or the next hop value changes.
Routes will not be programmatically removed by this solution.

One customer success story to date is that this solution was used in [us-east-1](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/using-regions-availability-zones.html) to synchronize 26 production routes across 4 custom route tables (104 concurrent route synchronizations) with a 5 second polling interval.
In testing, all route targets updated successfully within 4 seconds.
This met the customer's requirement of completing all route synchronizations prior to timeout of a mission critical application at 15 seconds, and allowed them to complete a critical maintenance window.

Please test thoroughly.

## Architecture

### Architecture diagram

![architecture_diagram](./Architecture.png 'Architecture diagram')

### Infrastructure as code diagram

![infrastucture_as_code_diagram](./InfrastructureAsCode.png 'Infrastucture as code diagram')

## Prerequisites

* [NodeJS](https://nodejs.org/)
* [AWS CLI](https://docs.aws.amazon.com/cli/latest/userguide/cli-chap-install.html)
    * Configured [AWS CLI profile][profile]
* [AWS Amplify CLI toolchain](https://github.com/aws-amplify/amplify-cli)
    * NOTE: Interoperability between the AWS Amplify CLI and [AWS CLI Multi-Factor Authentication (MFA)](https://docs.aws.amazon.com/cli/latest/reference/sts/get-session-token.html), as well as [assume role with MFA](https://docs.aws.amazon.com/cli/latest/reference/sts/assume-role.html), have been validated in testing per request. Please also see this [AWS blog post](https://aws.amazon.com/premiumsupport/knowledge-center/authenticate-mfa-cli/) for a few great examples.

### For Windows users

* [Windows Subsystem for Linux](https://docs.microsoft.com/en-us/windows/wsl/install-win10)

## Getting Started

* Run `amplify env add`, which will:
    * Map your [AWS CLI profile][profile] to a new [AWS Amplify environment](https://aws-amplify.github.io/docs/cli/multienv#setting-up-master-and-dev-environments)
    * NOTE: The default AWS region specified for your AWS CLI profile will be used, such as `us-east-1`.
      Update the value (temporarily or otherwise) if you want the resources deployed elsewhere.
    * Deploy the root [CloudFormation stack][cfn_stack], which includes the following default resources for an AWS Amplify CLI managed project:
        * [S3 deployment bucket](https://docs.aws.amazon.com/AmazonS3/latest/dev/UsingBucket.html)
        * [CloudFormation root stack][cfn_stack]
        * [IAM AuthRole][iam_role]
        * [IAM UnauthRole][iam_role]
    * Create:
        * `./amplify/team-provider-info.json`:
            * Specifies the names and [ARNs](https://docs.aws.amazon.com/general/latest/gr/aws-arns-and-namespaces.html) of the resources in the root stack for ***your*** environment.
            * **IMPORTANT**: Do not submit pull requests with ***your*** `./amplify/team-provider-info.json` file. Again, it contains information about your environment's resources.
            * This file *should* be committed in ***your*** private repo and was intentionally excluded from `./.gitignore`.
            * If you updated the default region for your AWS CLI profile and want to change it back, you can do so once this file exists because all of the other resources will be deployed to the region specified in this file.
        * `./amplify/backend/amplify-meta.json`:
            * Compiled from `./amplify/backend/backend-config.json` and `./amplify/team-provider-info.json`.
            * Specifies:
                * The managed [backend categories](https://aws-amplify.github.io/docs/cli/concept?sdk=js#category-plugin)
                * Their dependencies
                * Deployment information
        * `./amplify/#current-cloud-backend/`: Directory containing the compiled version of the environment.
        * `./src/aws-exports.js`: Covered in the next step.
    * The example below specifies an environment name of `dev`, an editor of `None`, and the `default` AWS CLI profile.
      Adjust these for your use case.

      ```text
      $ amplify env add
      Note: It is recommended to run this command from the root of your app directory
      ? Enter a name for the environment dev
      ? Choose your default editor:
        Sublime Text
        Visual Studio Code
        Atom Editor
        IDEA 14 CE
        Vim (via Terminal, Mac OS only)
        Emacs (via Terminal, Mac OS only)
      ❯ None
      Using default provider  awscloudformation

      For more information on AWS Profiles, see:
      https://docs.aws.amazon.com/cli/latest/userguide/cli-multiple-profiles.html

      ? Do you want to use an AWS profile? (Y/n)
      ? Please choose the profile you want to use (Use arrow keys)
      ❯ default
      ⠼ Initializing project in the cloud...
      ```

* Review the API request throttling parameters: `burstLimit` & `rateLimit`, in `./amplify/backend/api/awssyncroutes/parameters.json` and update if necessary.

* Run `amplify push` to deploy the rest of the resources.

  ```text
  $ amplify push

  Current Environment: dev

  | Category | Resource name | Operation | Provider plugin   |
  | -------- | ------------- | --------- | ----------------- |
  | Function | awssyncroutes | Create    | awscloudformation |
  | Api      | awssyncroutes | Create    | awscloudformation |
  ? Are you sure you want to continue? (Y/n)
  ```

    * This will create:
        * `./src/aws-exports.js`: One place where you can find the root URL of the new API Gateway.
        * `./amplify/backend/awscloudformation/nested-cloudformation-stack.yml`: Nested CloudFormation stack specification.
    * Also, the `S3Bucket` will be automatically populated in `./amplify/backend/function/awssyncroutes/awssyncroutes-cloudformation-template.json`.
        * **IMPORTANT**: Do not submit pull requests with ***your*** S3 deployment bucket.

* Once complete, retrieve the [API key](https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-basic-concept.html#apigateway-definition-api-key).
    * One way to do this:
        * `aws apigateway get-api-keys`: Copy the `id` value for the next command.
        * `aws apigateway get-api-key --include-value --api-key <id>`: Copy the `value` value.

* Then [subscribe to the SNS topic](https://docs.aws.amazon.com/sns/latest/dg/sns-tutorial-create-subscribe-endpoint-to-topic.html#create-subscribe-endpoint-to-topic-aws-console) to opt-in for change notifications.

* Now, you are ready to test the API endpoint.
    * One way to do this:

      ```sh
      curl --data '{"destination-cidr-block":"<destination cidr block>", "dry-run": true}' --header "X-API-Key: <api key>" --header "Content-Type: application/json" --request PATCH https://<api gateway id>.execute-api.<region>.amazonaws.com/<stage name>/vpcs/<vpc id>/route-tables/<route table id>
      ```

## Request requirements

Requests will only be accepted if the specified destination CIDR block:

* Is not the default [local route][rtb].
* Is not a [propagated route][rtb].
* Has an [ENI](https://docs.aws.amazon.com/vpc/latest/userguide/VPC_ElasticNetworkInterfaces.html) target.
* Is in an `active` state in the main route table.

## Usage

There is only one API endpoint with two path parameters: `/vpcs/<vpc id>/route-tables/<route table id>` with a HTTP PATCH [request method](https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-basic-concept.html#apigateway-definition-method-request).

NOTE: This implementation does not follow all of the [RFC5789](https://tools.ietf.org/html/rfc5789) specifications for a HTTP PATCH method- it does not use a PATCH document and it is idempotent.

| Path parameter | Required | Description | Example 1 | Example 2 |
| - | - | - | - | - |
| `<vpc id>` | `true` | ID of the [VPC](https://docs.aws.amazon.com/vpc/latest/userguide/what-is-amazon-vpc.html). | `vpc-01234567` | `vpc-0123456789abcdef0` |
| `<route table id>` | `true` | ID of the VPC's [main route table](https://docs.aws.amazon.com/vpc/latest/userguide/VPC_Route_Tables.html#RouteTables). | `rtb-01234567` | `rtb-0123456789abcdef0` |

The request body schema has one required property: `destination-cidr-block`, and one optional property: `dry-run`.

| Property name | Required | Description | Example 1 | Example 2 |
| - | - | - | - | - |
| `destination-cidr-block` | `true` | The IPv4 destination [CIDR](https://en.wikipedia.org/wiki/Classless_Inter-Domain_Routing) block for the route. | `192.168.0.0/24` | `172.30.0.0/16` |
| `dry-run` | `false` | Checks whether you have the required permissions for the action, without actually making the request, and provides an error response.<br />If you have the required permissions, the error response is `DryRunOperation`; otherwise, it is `UnauthorizedOperation`. | `true` | `false` |

## Example

### cURL

```sh
curl --data '{"destination-cidr-block":"<destination cidr block>", "dry-run": true}' --header "X-API-Key: <api key>" --header "Content-Type: application/json" --request PATCH https://<api gateway id>.execute-api.<region>.amazonaws.com/<stage name>/vpcs/<vpc id>/route-tables/<route table id>
```

### PowerShell Invoke-RestMethod cmdlet

```powershell
Invoke-RestMethod -Method 'Patch' -Uri 'https://<api gateway id>.execute-api.<region>.amazonaws.com/<stage name>/vpcs/<vpc id>/route-tables/<route table id>' -Headers @{ 'Content-Type'='application/json'; 'X-API-Key'='<api key>'} -Body '{"destination-cidr-block":"172.30.0.0/16", "dry-run": false}'
```

## Client script

A bash script has been added, which can be used to call the API endpoint asynchronously for a comma-delimited list of destination CIDR blocks in an loop.
One way to implement this would be to call the script in a [screen](https://linux.die.net/man/1/screen) session so that the script can run without maintaining a SSH session and administrators can disconnect/reconnect as needed.

```sh
./scripts/aws-sync-routes-client.sh -i $api_gateway_id -k $api_key -r 'us-east-1' -c '172.30.0.0/16, 172.31.0.0/16' -s 5 -t rtb-01234567 -v vpc-01234567
```

```sh
./scripts/aws-sync-routes-client.sh --help
```

## Troubleshooting

### Too Many Requests

If you start receiving `Too Many Requests` error messages, this means that the configured rate & burst limits for your API Gateway instance are set too low for the frequency in which you are polling. Adjust the `burstLimit` & `rateLimit` values in [`parameters.json`](https://github.com/awslabs/aws-sync-routes/blob/master/amplify/backend/api/awssyncroutes/parameters.json), then run `amplify push` to deploy the changes, and try again.

Of note, the rate & burst limits are only configured in the API token usage plan as described in the [API Gateway CloudFormation template](https://github.com/awslabs/aws-sync-routes/blob/master/amplify/backend/api/awssyncroutes/awssyncroutes-cloudformation-template.json), not the API Gateway deployment stage. Throttling could be configured in both locations, but configuring this in both locations is unnecessary and the current configuration makes it easy to use additional API tokens if so desired.

### Request Limit Exceeded

If you are syncing a batch of routes and start receiving `Request Limit Exceeded` error messages, this means that the requests are being throttled due to the number of requests in this region in this account within a set period of time.

First try decreasing the frequency of API calls. If that is unteneble, please open an AWS Support ticket explaining the business case and request an increase to the limits for the following:

* [EC2 describe route tables](https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/EC2.html#describeRouteTables-property)
    * 1 call per request (sustained)
* [EC2 create route](https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/EC2.html#createRoute-property)
    * 1 call per custom route table per request where the route exists in the main route table, but not in the custom route table (burst)
    * In dry-run mode, this action will be called for every request since changes will not be executed, resulting in a higher likelihood of throttling
* [EC2 replace route](https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/EC2.html#replaceRoute-property)
    * 1 call per custom route table per request where the route exists in both the main & custom route table, but have different next hop values (burst)
    * In dry-run mode, this action will be called for every request since changes will not be executed, resulting in a higher likelihood of throttling

## Project tree

```text
.
├── .github/
│   └── PULL_REQUEST_TEMPLATE.md
├── amplify/
│   ├── #current-cloud-backend/
│   ├── .config/
│   │   ├── local-aws-info.json
│   │   ├── local-env-info.json
│   │   └── project-config.json
│   ├── backend/
│   │   ├── api/
│   │   │   └── awssyncroutes/
│   │   │       ├── awssyncroutes-cloudformation-template.json
│   │   │       └── parameters.json
│   │   ├── awscloudformation/
│   │   │   └── nested-cloudformation-stack.yml
│   │   ├── function/
│   │   │   └── awssyncroutes/
│   │   │       ├── dist/
│   │   │       ├── src/
│   │   │       │   ├── node_modules/
│   │   │       │   ├── app.js
│   │   │       │   ├── index.js
│   │   │       │   ├── package-lock.json
│   │   │       │   └── package.json
│   │   │       ├── awssyncroutes-cloudformation-template.json
│   │   │       └── parameters.json
│   │   ├── amplify-meta.json
│   │   └── backend-config.json
│   └── team-provider-info.json
├── docs/
│   ├── about/
│   │   ├── contributing.md -> ../../CONTRIBUTING.md
│   │   └── license.md -> ../../LICENSE
│   ├── adr/
│   │   ├── 0001-record-architecture-decisions.md
│   │   ├── 0002-aws-amplify-cli-toolchain.md
│   │   ├── 0003-http-patch-method.md
│   │   ├── 0004-api-key.md
│   │   ├── 0005-uri.md
│   │   └── 0006-specificity.md
│   ├── Architecture.png -> ../Architecture.png
│   ├── InfrastructureAsCode.png -> ../InfrastructureAsCode.png
│   └── index.md -> ../README.md
├── material/
│   ├── assets/
│   │   └── stylesheets/
│   │       ├── application-palette.css
│   │       └── application.css
│   ├── partials/
│   │   └── palette.html
│   └── main.html
├── scripts/
│   └── aws-sync-routes-client.sh*
├── src/
│   └── aws-exports.js
├── .adr-dir
├── .editorconfig
├── .eslintrc.js
├── .gitignore
├── .markdownlint.yml
├── Architecture.png
├── InfrastructureAsCode.png
├── LICENSE
├── NOTICE
├── README.md
└── mkdocs.yml
```

*The project tree was generated with the following command:*

```sh
tree -aFL 6 --dirsfirst --noreport -I ".git|site|*-latest-build.zip"
```

## License

This library is licensed under the [Apache 2.0 License](about/license).

[rtb]: https://docs.aws.amazon.com/vpc/latest/userguide/VPC_Route_Tables.html#RouteTables
[vpc]: https://docs.aws.amazon.com/vpc/latest/userguide/what-is-amazon-vpc.html
[sddc]: https://docs.vmware.com/en/VMware-Cloud-on-AWS/services/com.vmware.vmc-aws-operations/GUID-A0F15ABA-C2DF-46CD-B883-A9FABD892B75.html
[profile]: https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-profiles.html
[cfn_stack]: https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/stacks.html
[iam_role]: https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles.html
