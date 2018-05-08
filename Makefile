# Copyright 2017 The WPT Dashboard Project. All rights reserved.
# Use of this source code is governed by a BSD-style license that can be
# found in the LICENSE file.

# Make targets in this file are intended to be run inside the Docker container
# environment.

# Make targets can be run in a host environment, but that requires ensuring
# the correct version of tools are installed and environment variables are
# set appropriately.

SHELL := /bin/bash

export GOPATH=$(shell go env GOPATH)

REPO ?= github.com/web-platform-tests/results-analysis
REPO_PATH ?= $(GOPATH)/src/$(REPO)

GO_FILES := $(wildcard $(REPO_PATH)/**/*.go)

build: deps

lint: deps
	go get -u golang.org/x/lint/golint
	golint -set_exit_status $(GO_FILES)
	# Print differences between current/gofmt'd output, check empty.
	! gofmt -d $(GO_FILES) 2>&1 | read

test: deps
	cd $(REPO_PATH); go test -v ./...

fmt: deps
	gofmt -w $(GO_FILES)

deps: $(GO_FILES)
	cd $(REPO_PATH); go get -t ./...
