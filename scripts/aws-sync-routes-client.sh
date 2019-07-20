#!/bin/bash

# Exit on error
set -e

dry_run=false

function usage () {
  printf "\nSynchronize AWS VPC routes from the main/default route table to all custom route tables.\n"
  printf "\nUsage: $0 -i <api gateway id> -k <api key> -r <aws region> -c <ipv4 destination cidr blocks> -s <sleep seconds> -t <route table id> -v <vpc id> [-d <dry run?>]\n\n"
  printf "\t-c, --destination-cidr-blocks\n\t\tA comma-delimited list of IPv4 destination CIDR blocks for each route to sync.\n\n"
  printf "\t-d, --dry-run\n\t\tChecks whether you have the required permissions for the action, without actually making the request, and provides an error response.\n\n"
  printf "\t-h, --help\n\t\tUsage help. This lists all current command line options with a short description.\n\n"
  printf "\t-i, --api-gateway-id\n\t\tThe ID of the AWS API Gateway.\n\n"
  printf "\t-k, --api-key\n\t\tThe API key for the API Gateway.\n\n"
  printf "\t-r, --aws-region\n\t\tThe AWS region hosting the API Gateway.\n\n"
  printf "\t-s, --seconds\n\t\tThe number of seconds to pause between API calls.\n\n"
  printf "\t-t, --route-table-id\n\t\tThe ID of the main/default route table for the VPC.\n\n"
  printf "\t-v, --vpc-id\n\t\tThe ID of the the VPC.\n\n"
}

while (( "$#" ))
do
  case "$1" in
    -c|--destination-cidr-blocks)
      destination_cidr_blocks=$(printf "$2" | tr -d '[:space:]' | tr ',' '\n')
      shift 2
      for destination_cidr_block in $destination_cidr_blocks
      do
        if [[ ! ${destination_cidr_block} =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}(\/([0-9]|[1-2][0-9]|3[0-2]))?$ ]]
        then
          usage
          printf "Error: Invalid IPv4 destination CIDR block: '$destination_cidr_block'.\n" >&2
          exit 1
        fi
      done
      ;;
    -d|--dry-run)
      if [[ ${2} =~ ^(true|false)$ ]]
      then
        dry_run=$2
        shift 2
      else
        printf "Error: Dry run must be set to either 'true' or 'false': '$2'.\n" >&2
        usage
        exit 1
      fi
      ;;
    -h|--help)
      usage
      exit
      ;;
    -i|--api-gateway-id)
      if [ -z "$2" ]
      then
        usage
        printf "Error: API Gateway ID required: '$2'.\n" >&2
        exit 1
      else
        api_gateway_id=$2
        shift 2
      fi
      ;;
    -k|--api-key)
      if [ -z "$2" ]
      then
        usage
        printf "Error: API key required.\n" >&2
        exit 1
      else
        api_key=$2
        shift 2
      fi
      ;;
    -r|--aws-region)
      if [ -z "$2" ]
      then
        usage
        printf "Error: AWS region required.\n" >&2
        exit 1
      else
        aws_region=$2
        shift 2
      fi
      ;;
    -s|--seconds)
      if [[ ${2} =~ ^[0-9]+$ ]]
      then
        sleep_seconds=$2
        shift 2
      else
        usage
        printf "Error: Invalid sleep seconds value: '$2'.\n" >&2
        exit 1
      fi
      ;;
    -t|--route-table-id)
      if [[ ${2} =~ ^rtb-([0-9a-f]{8}|[0-9a-f]{17})$ ]]
      then
        route_table_id=$2
        shift 2
      else
        usage
        printf "Error: Invalid route table ID: '$2'.\n" >&2
        exit 1
      fi
      ;;
    -v|--vpc-id)
      if [[ ${2} =~ ^vpc-([0-9a-f]{8}|[0-9a-f]{17})$ ]]
      then
        vpc_id=$2
        shift 2
      else
        usage
        printf "Error: Invalid VPC ID: '$2'.\n" >&2
        exit 1
      fi
      ;;
    -*)
      usage
      printf "Error: Invalid parameter: '$1'.\n" >&2
      exit 1
      ;;
  esac
done

if [ -z "$api_gateway_id" ] || [ -z "$api_key" ] || [ -z "$aws_region" ] || [ -z "$destination_cidr_blocks" ] || [ -z "$route_table_id" ] || [ -z "$vpc_id" ] || [ -z "$sleep_seconds" ]
then
  usage
else
  api_endpoint="https://$api_gateway_id.execute-api.$aws_region.amazonaws.com/v1/vpcs/$vpc_id/route-tables/$route_table_id"
  while true
  do
    printf "\n$(date +"%Y-%m-%d %H:%M:%S ")\tPress [CTRL+C] to stop...\n"
    for destination_cidr_block in $destination_cidr_blocks
    do
      request_body="{\"destination-cidr-block\": \"$destination_cidr_block\", \"dry-run\": $dry_run}"
      printf "$(curl --silent --show-error --data "$request_body" --header 'Content-Type: application/json' --header "X-API-Key: $api_key" --request 'PATCH' $api_endpoint)\n" &
    done
    sleep $sleep_seconds
  done
fi

