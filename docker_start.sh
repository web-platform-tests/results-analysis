#!/bin/bash

set -e

pushd "$(dirname ${BASH_SOURCE})" > /dev/null
HOST_DIR=$(pwd)
popd > /dev/null

source "${HOST_DIR}/logging.sh"
source "${HOST_DIR}/docker_env.sh"

info "Starting ${IMAGE_NAME} as ${INSTANCE_NAME} with volume mapping: ${HOST_DIR}:${CONTAINER_DIR}"

docker run -t -d --entrypoint /bin/bash \
    -v "${HOST_DIR}":"${CONTAINER_DIR}" \
    -u $(id -u $USER):$(id -g $USER) \
    --name wpt-results-analysis-instance wpt-results-analysis

OWNERSHIP="$(id -u ${USER}):$(id -g ${USER})"
info "Setting ownership for container GOPATH=${CONTAINER_GOPATH} to ${OWNERSHIP}"
docker exec -u 0:0 "${INSTANCE_NAME}" chown -R "${OWNERSHIP}" "${CONTAINER_GOPATH}"

info "Docker instance ${INSTANCE_NAME} ready"
