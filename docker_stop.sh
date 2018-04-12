#!/bin/bash

set -e

pushd "$(dirname ${BASH_SOURCE})" > /dev/null
HOST_DIR=$(pwd)
popd > /dev/null

source "${HOST_DIR}/logging.sh"
source "${HOST_DIR}/docker_env.sh"

info "Stopping ${INSTANCE_NAME}"

docker stop "${INSTANCE_NAME}"

info "${INSTANCE_NAME} stopped"
info "Removing ${INSTANCE_NAME}"

docker rm "${INSTANCE_NAME}"

info "${INSTANCE_NAME} removed"
