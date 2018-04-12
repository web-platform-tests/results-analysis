#!/bin/bash

pushd "$(dirname ${BASH_SOURCE})" > /dev/null
HOST_DIR=$(pwd)
popd > /dev/null
source "${HOST_DIR}/logging.sh"
source "${HOST_DIR}/docker_env.sh"

info "Building ${IMAGE_NAME} from ${HOST_DIR}"

docker build -t "${IMAGE_NAME}" "${HOST_DIR}"

info "Finished: build ${IMAGE_NAME} from ${HOST_DIR}"
