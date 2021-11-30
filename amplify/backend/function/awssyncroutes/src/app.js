/*!
Copyright 2017 - 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in compliance with the License. A copy of the License is located at
    http://aws.amazon.com/apache2.0/
or in the "license" file accompanying this file. This file is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and limitations under the License.
*/

const start = new Date();
const AWS = require('aws-sdk');
const each = require('async-each');
const express = require('express');
const bodyParser = require('body-parser');
const awsServerlessExpressMiddleware = require('aws-serverless-express/middleware');

// EC2 client for managing route tables
const ec2 = new AWS.EC2();

// SNS client for sending notifications
const sns = new AWS.SNS();

// declare a new express app
const app = express();
app.use(bodyParser.json());
app.use(awsServerlessExpressMiddleware.eventContext());

// Enable CORS for all methods
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'OPTIONS,PATCH');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

/**
 * Retrieves the route tables in the specified VPC with a blocking request.
 * Failure triggers a SNS message to be published to the given topic.
 * @param {string} vpcId Previously validated VPC resource ID with a 'vpc-' prefix and either 8 or 17 character hexadecimal suffix.
 * @returns {object} Description of the route tables in the specified VPC.
 */
async function getRouteTableDescriptions(vpcId) {
  const params = {
    DryRun: false,
    Filters: [
      {
        Name: 'vpc-id',
        Values: [vpcId], // Only evaluate route tables in the specified VPC
      },
    ],
  };

  const routeTableDescriptions = await ec2.describeRouteTables(params).promise()
    .catch((err) => {
      const params = {
        Subject: `FAILED: Describe route tables in VPC: '${vpcId}'`,
        Message: err.message,
        TopicArn: process.env.SNS_TOPIC_ARN
      };

      sns.publish(params);
    });

  return routeTableDescriptions;
}

/**
 * Retrieves the main route table from the given array of route tables.
 * @param {object[]} routeTables Array of route tables to filter.
 * @returns {object|null} The main route table or null.
 */
function getMainRouteTable(routeTables) {
  const mainRouteTables = routeTables.filter((routeTable) => {
    const isMainRouteTableAssociation = routeTable.Associations.filter((routeTableAssociation) => {
      return routeTableAssociation.Main === true;
    }).length === 1;

    return isMainRouteTableAssociation;
  });

  return mainRouteTables.length === 1 ? mainRouteTables[0] : null;
}

/**
 * Retrieves the route from the the given route table that contains the specified destination IPv4 CIDR block.
 * @param {object} routeTable Route table object.
 * @param {string} DestinationCidrBlock The destination IPv4 CIDR block to identify the route.
 * @returns {object|null} The specified route or null.
 */
function getRoute(routeTable, DestinationCidrBlock) {
  const routes = routeTable.Routes.filter((route) => {
    let isDestinationCidrBlock = false;

    if (route.DestinationCidrBlock) {
      if (route.DestinationCidrBlock === DestinationCidrBlock) {
        isDestinationCidrBlock = true;
      }
    }

    return isDestinationCidrBlock;
  });

  return routes.length === 1 ? routes[0] : null;
}

/**
 * Retrieves the custom route tables from the given array of route tables.
 * @param {object[]} routeTables Array of route tables.
 * @param {string} mainRouteTableId The ID of the main route table.
 * @returns {object[]} Array of custom route tables.
 */
function getCustomRouteTables(routeTables, mainRouteTableId) {
  const customRouteTables = routeTables.filter((routeTable) => {
    let isCustomRouteTable = false;

    // Exclude the default route table in this VPC
    if (routeTable.RouteTableId !== mainRouteTableId) {
      isCustomRouteTable = routeTable.Associations.filter((routeTableAssociation) => {
        return routeTableAssociation.Main === true;
      }).length === 0;
    }

    return isCustomRouteTable;
  });

  return customRouteTables;
}

/**
 * HTTP Patch method to sync routes from a main/default route table to custom route tables
 */
app.patch('/vpcs/:vpcId(vpc-[0-9a-f]{8}|vpc-[0-9a-f]{17})/route-tables/:routeTableId(rtb-[0-9a-f]{8}|rtb-[0-9a-f]{17})', async (req, res) => {
  //#region Set request data to constants to prevent manipulation
  const vpcId = req.params.vpcId.toLowerCase();
  const routeTableId = req.params.routeTableId.toLowerCase();
  const destinationCidrBlock = req.body['destination-cidr-block'];
  const dryRun = req.body['dry-run'] || false;
  //#endregion

  //#region Get VPC route table descriptions & validate
  const routeTableDescriptions = await getRouteTableDescriptions(vpcId);
  if (typeof routeTableDescriptions !== 'object') {
    res.statusCode = 500;
    res.statusMessage = 'Internal Server Error';
    res.json({ message: `Failed to describe route tables for VPC: '${vpcId}'.`, routeTableDescriptions: routeTableDescriptions });
    return;
  } else if (!Array.isArray(routeTableDescriptions.RouteTables)) {
    res.statusCode = 500;
    res.statusMessage = 'Internal Server Error';
    res.json({ message: `Failed to describe route tables for VPC: '${vpcId}'.`, routeTableDescriptions: routeTableDescriptions });
    return;
  } else if (routeTableDescriptions.RouteTables.length < 1) {
    res.statusCode = 404;
    res.statusMessage = 'Not Found';
    res.json({ message: `VPC: '${vpcId}' not found.` });
    return;
  } else if (routeTableDescriptions.RouteTables.length < 2) {
    res.statusCode = 200;
    res.statusMessage = 'OK';
    res.json({ message: 'Route synchronization not necessary.' });
    return;
  }
  //#endregion

  //#region Get the main route table & validate
  const mainRouteTable = await getMainRouteTable(routeTableDescriptions.RouteTables);
  if (mainRouteTable === null) {
    res.statusCode = 404;
    res.statusMessage = 'Not Found';
    res.json({ message: `Route table: '${routeTableId}' not found in VPC: '${vpcId}'.` });
    return;
  } else if (routeTableId !== mainRouteTable.RouteTableId) {
    res.statusCode = 422;
    res.statusMessage = 'Unprocessable Entity';
    res.json({ message: `Route table: '${routeTableId}' does not have a main route table association.` });
    return;
  }
  //#endregion

  //#region Get the specified route in the main route table & validate
  const mainRouteTableRoute = await getRoute(mainRouteTable, destinationCidrBlock);
  if (mainRouteTableRoute === null) {
    res.statusCode = 404;
    res.statusMessage = 'Not Found';
    res.json({
      message: (
        `A route with destination CIDR block: '${destinationCidrBlock}' ` +
        `not found in main route table: '${routeTableId}'.`
      )
    });
    return;
  } else if (mainRouteTableRoute.State !== 'active') {
    res.statusCode = 422;
    res.statusMessage = 'Unprocessable Entity';
    res.json({
      message: (
        `The route with destination CIDR block: '${destinationCidrBlock}' ` +
        `in main route table: '${routeTableId}' ` +
        `is not in an 'active' state: '${mainRouteTableRoute.State}'.`
      )
    });
    return;
  } else if (mainRouteTableRoute.Origin !== 'CreateRoute') {
    // Only evaluate if the route did not exist at route table creation (CreateRouteTable)
    // and not propagated from an AWS vGW (EnableVgwRoutePropagation)
    res.statusCode = 422;
    res.statusMessage = 'Unprocessable Entity';
    res.json({
      message: (
        `The route with destination CIDR block: '${destinationCidrBlock}' ` +
        `in main route table: '${routeTableId}' ` +
        `has an origin value that is not 'CreateRoute': '${mainRouteTableRoute.Origin}'.`
      )
    });
  } else if (mainRouteTableRoute.NetworkInterfaceId) {
    if (!mainRouteTableRoute.NetworkInterfaceId.match(/^eni-[a-f0-9]{8}(?:[a-f0-9]{9})?$/)) {
      res.statusCode = 422;
      res.statusMessage = 'Unprocessable Entity';
      res.json({
        message: (
          `The route with destination CIDR block: '${destinationCidrBlock}' ` +
          `in main route table: '${routeTableId}' ` +
          `has an unacceptable ENI target: '${mainRouteTableRoute.NetworkInterfaceId}'.`
        )
      });
      return;
    } else {
      // console.log(
      //   `The route with destination CIDR block: '${destinationCidrBlock}' ` +
      //   `in main route table: '${routeTableId}' is acceptable.`
      // );
    }
  } else {
    res.statusCode = 400;
    res.statusMessage = 'Bad Request';
    res.json({
      message: (
        `The route with destination CIDR block: '${destinationCidrBlock}' ` +
        `in main route table: '${routeTableId}' does not have an ENI target.`
      )
    });
    return;
  }
  //#endregion

  //#region Get the custom route table & validate
  const customRouteTables = await getCustomRouteTables(routeTableDescriptions.RouteTables, routeTableId);
  if (customRouteTables.length < 1) {
    res.statusCode = 200;
    res.statusMessage = 'OK';
    res.json({ message: 'Route synchronization not necessary.' });
  }
  //#endregion

  //#region Update the custom route tables asynchronously
  const snsSubjectLengthLimit = 99;

  let updatedCustomRouteTableCount = 0;

  await each(
    customRouteTables,
    async (customRouteTable, next) => {
      const customRouteTableRoute = await getRoute(customRouteTable, destinationCidrBlock);

      let snsParams = {
        Subject: (
          `{{status}}: {{action}} '${destinationCidrBlock}' from: '${mainRouteTable.RouteTableId}' ` +
          `to '${customRouteTable.RouteTableId}'`
        ),
        Message: (
          'NOTICE:\r\n' +
          `* Main route table ID: '${mainRouteTable.RouteTableId}'\r\n` +
          `* Custom route table ID: '${customRouteTable.RouteTableId}'\r\n` +
          `* Destination CIDR block: '${destinationCidrBlock}'\r\n`
        ),
        TopicArn: process.env.SNS_TOPIC_ARN
      };

      if (customRouteTableRoute === null) {
        // console.log('Create route in custom route table.');
        const params = {
          RouteTableId: customRouteTable.RouteTableId,
          DestinationCidrBlock: destinationCidrBlock,
          NetworkInterfaceId: mainRouteTableRoute.NetworkInterfaceId,
          DryRun: dryRun,
        };

        snsParams.Subject = snsParams.Subject.replace(/{{action}}/, 'Add');
        snsParams.Message +=
          `* Target ENI: '${mainRouteTableRoute.NetworkInterfaceId}'\r\n` +
          `* Start: ${start.toISOString()}\r\n` +
          `* End: ${new Date().toISOString()}\r\n`;

        await ec2.createRoute(params).promise()
          .then(async () => {
            updatedCustomRouteTableCount++;

            snsParams.Subject = snsParams.Subject
              .replace(/^{{status}}/, 'SUCCESS')
              .substring(0, snsSubjectLengthLimit);

            await sns.publish(snsParams).promise()
              .then(() => { next(); })
              .catch((snsErr) => { next(snsErr); });
          })
          .catch(async (err) => {
            const status = err.code === 'DryRunOperation' ? 'DRYRUN' : 'FAILED';
            snsParams.Subject = snsParams.Subject
              .replace(/^{{status}}/, status)
              .substring(0, snsSubjectLengthLimit);
            snsParams.Message += `\r\n\r\n${err}`;

            await sns.publish(snsParams).promise()
              .then(() => { next(err); })
              .catch((snsErr) => { next(snsErr); });
          });
      } else if (!(customRouteTableRoute.NetworkInterfaceId)) {
        // console.error(
        //   `The route with destination CIDR block: '${destinationCidrBlock}' ` +
        //   `in custom route table: '${customRouteTable.RouteTableId}' does not have an ENI target.`
        // );
        next();
      } else if (customRouteTableRoute.NetworkInterfaceId === mainRouteTableRoute.NetworkInterfaceId) {
        // console.log('Route synchronization not necessary.');
        next();
      } else if (!customRouteTableRoute.NetworkInterfaceId.match(/^eni-[a-f0-9]{8}(?:[a-f0-9]{9})?$/)) {
        // console.error(
        //   `The route with destination CIDR block: '${destinationCidrBlock}' ` +
        //   `in main route table: '${routeTableId}' ` +
        //   `has an unacceptable ENI target: '${networkInterfaceId}'.`
        // );
        next();
      } else {
        // console.log('Update route in custom route table.');
        const params = {
          RouteTableId: customRouteTable.RouteTableId,
          DestinationCidrBlock: destinationCidrBlock,
          NetworkInterfaceId: mainRouteTableRoute.NetworkInterfaceId,
          DryRun: dryRun,
        };

        snsParams.Subject = snsParams.Subject.replace(/{{action}}/, 'Sync');
        snsParams.Message +=
          `* Old target ENI: '${customRouteTableRoute.NetworkInterfaceId}'\r\n` +
          `* New target ENI: '${mainRouteTableRoute.NetworkInterfaceId}'\r\n` +
          `* Start: ${start.toISOString()}\r\n` +
          `* End: ${new Date().toISOString()}\r\n`;

        await ec2.replaceRoute(params).promise()
          .then(async () => {
            updatedCustomRouteTableCount++;

            snsParams.Subject = snsParams.Subject
              .replace(/^{{status}}/, 'SUCCESS')
              .substring(0, snsSubjectLengthLimit);

            await sns.publish(snsParams).promise()
              .then(() => { next(); })
              .catch((snsErr) => { next(snsErr); });
          })
          .catch(async (err) => {
            const status = err.code === 'DryRunOperation' ? 'DRYRUN' : 'FAILED';
            snsParams.Subject = snsParams.Subject
              .replace(/^{{status}}/, status)
              .substring(0, snsSubjectLengthLimit);

            snsParams.Message += `\r\n\r\n${err}`;

            await sns.publish(snsParams).promise()
              .then(() => { next(err); })
              .catch((snsErr) => { next(snsErr); });
          });
      }
    },
    (err) => {
      if (err) {
        // console.error(err, err.stack);

        if (err.code === 'DryRunOperation') {
          res.statusCode = 200;
          res.statusMessage = 'OK';
        } else {
          res.statusCode = 500;
          res.statusMessage = 'Internal Server Error';
        }
        res.json({ message: err.message });
      } else {
        // console.log('All custom route tables have been evaluated.');

        res.statusCode = 200;
        res.statusMessage = 'OK';

        if (updatedCustomRouteTableCount < 1) {
          res.json({ message: 'Route synchronization not necessary.' });
        } else {
          res.json({ message: 'Success!' });
        }
      }
    }
  );
  //#endregion
});

/**
 * Reject all other requests
 */
app.all('/*', (req, res) => {
  res.statusCode = 400;
  res.statusMessage = 'Bad Request';
  res.json({ message: 'Invalid request.' });
});

/**
 * Start the application server
 */
app.listen(3000, () => {
  console.log('App started');
});

// Export the app object. When executing the application local this does nothing. However,
// to port it to AWS Lambda we will create a wrapper around that will load the app from
// this file
module.exports = app;
