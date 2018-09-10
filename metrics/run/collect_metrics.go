// Copyright 2017 The WPT Dashboard Project. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

package main

import (
	"os"

	flags "github.com/jessevdk/go-flags"
	log "github.com/sirupsen/logrus"
	"github.com/web-platform-tests/results-analysis/metrics/run/api"
	"golang.org/x/net/context"
)

type labelsAndShortSHA struct {
	labels   []string `short:"label" description:"Labels to filter by when computing interop"`
	shortSHA string   `short:"sha" description:"SHA[0:10] of the runs to use when computing interop"`
}

func main() {
	metricsAPI, rest, err := api.NewMetricsComputerFromArgs(os.Args[1:])
	if err != nil {
		log.Fatal(err)
	}

	var lass labelsAndShortSHA
	rest, err = flags.ParseArgs(&lass, rest)
	if err != nil {
		log.Fatal(err)
	}
	if len(rest) > 0 {
		log.Fatalf("Not all arguments parsed; unparsed arguments: %v", rest)
	}

	/*
		// TODO(markdittmer): Re-introduce file-based logging.

		logFileName := "current_metrics.log"
		logFile, err := os.OpenFile(logFileName, os.O_RDWR|os.O_CREATE|
			os.O_APPEND, 0666)
		if err != nil {
			log.Fatalf("Error opening log file: %v", err)
		}
		defer logFile.Close()
		log.Printf("Logs appended to %s\n", logFileName)
		log.SetOutput(logFile)
	*/

	ctx := context.Background()
	err = metricsAPI.Compute(ctx, lass.shortSHA, lass.labels)
	if err != nil {
		log.Fatal(err)
	}
}
