// Copyright 2017 The WPT Dashboard Project. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

package main

import (
	"os"
	"strings"

	flags "github.com/jessevdk/go-flags"
	log "github.com/sirupsen/logrus"
	"github.com/web-platform-tests/results-analysis/metrics/run/api"
	"github.com/web-platform-tests/wpt.fyi/shared"
	"golang.org/x/net/context"
)

type labelsAndShortSHA struct {
	Labels   []string `long:"labels" description:"Labels to filter by when computing interop"`
	ShortSHA string   `long:"sha" description:"SHA[0:10] of the runs to use when computing interop"`
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

	labels := make([]string, 0, len(lass.Labels)+1)
	for _, label := range lass.Labels {
		splitLabels := strings.Split(label, ",")
		for _, lbl := range splitLabels {
			if lbl != "" {
				labels = append(labels, lbl)
			}
		}
	}
	lass.Labels = labels

	var ctx context.Context
	stdoutLogger := &log.Logger{
		Out:       os.Stderr,
		Formatter: new(log.TextFormatter),
		Hooks:     make(log.LevelHooks),
		Level:     log.WarnLevel,
	}
	logFileName := "current_metrics.log"
	logFile, err := os.OpenFile(logFileName, os.O_RDWR|os.O_CREATE|
		os.O_APPEND, 0666)
	if err != nil {
		log.Warningf("Failed to setup file-based logging: %v", err)
		ctx = context.WithValue(context.Background(), shared.DefaultLoggerCtxKey(), stdoutLogger)
	} else {
		defer logFile.Close()
		log.Printf("Detailed logs appended to %s\n", logFileName)

		ctx = context.WithValue(context.Background(), shared.DefaultLoggerCtxKey(), shared.SplitLogger{
			A: stdoutLogger,
			B: &log.Logger{
				Out:       logFile,
				Formatter: new(log.TextFormatter),
				Hooks:     make(log.LevelHooks),
				Level:     log.DebugLevel,
			},
		})
	}

	err = metricsAPI.Compute(ctx, lass.ShortSHA, lass.Labels)
	if err != nil {
		log.Fatal(err)
	}
}
