# ENV GOPATH="/go"
FROM golang:alpine

USER root

ENV REPO="github.com/web-platform-tests/results-analysis"
ENV USER_HOME="/home/user"
ENV GO_REPO_PATH="${GOPATH}/src/${REPO}"
ENV WPT_PATH="${HOME}/web-platform-tests"

RUN mkdir -p "${GO_REPO_PATH}"
RUN mkdir -p "${WPT_PATH}"

# Ensure golang cache is in /go, which will be chowned to unprivileged $USER on
# instance start.`
ENV GOCACHE="/go/.cache"

RUN apk update
RUN apk add bash build-base git make

WORKDIR "${GO_REPO_PATH}"
