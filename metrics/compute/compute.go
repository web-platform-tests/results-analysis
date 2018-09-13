// Copyright 2017 The WPT Dashboard Project. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

package compute

import (
	"context"
	"strings"

	"github.com/web-platform-tests/results-analysis/metrics"
)

type TestRunsStatus map[metrics.TestID]map[string]metrics.CompleteTestStatus

// Type for decision problem: "What does it mean for a test result to 'pass'"?
type Passes func(*metrics.CompleteTestStatus) bool

//
// Passes functions
//

func OkAndUnknownOrPasses(status *metrics.CompleteTestStatus) bool {
	return status.Status == metrics.TestStatusOK &&
		(status.SubStatus ==
			metrics.SubTestStatusUnknown ||
			status.SubStatus == metrics.SubTestStatusPass)
}

func OkOrPassesAndUnknownOrPasses(status *metrics.CompleteTestStatus) bool {
	return (status.Status == metrics.TestStatusOK ||
		status.Status == metrics.TestStatusPass) &&
		(status.SubStatus ==
			metrics.SubTestStatusUnknown ||
			status.SubStatus == metrics.SubTestStatusPass)
}

// Gather results from test runs into input format for Compute* functions in
// this module.
func GatherResultsById(ctx context.Context, allResults *[]metrics.TestRunResults) (
	resultsById TestRunsStatus) {
	logger := metrics.GetLogger(ctx)
	resultsById = make(TestRunsStatus)

	for _, results := range *allResults {
		result := results.Res
		run := *results.Run
		TestID := metrics.TestID{Test: result.Test}
		_, ok := resultsById[TestID]
		if !ok {
			resultsById[TestID] = make(map[string]metrics.CompleteTestStatus)

		}
		_, ok = resultsById[TestID][run.BrowserName]
		if ok {
			logger.Warningf("Duplicate results for TestID:%v  in "+
				"TestRun:%v.  Overwriting.\n", TestID, run)
		}
		newStatus := metrics.CompleteTestStatus{
			Status: metrics.TestStatusFromString(result.Status),
		}
		resultsById[TestID][run.BrowserName] = newStatus

		for _, subResult := range result.Subtests {
			TestID := metrics.TestID{
				Test: result.Test,
				Name: subResult.Name,
			}
			_, ok := resultsById[TestID]
			if !ok {
				resultsById[TestID] = make(map[string]metrics.CompleteTestStatus)
			}
			_, ok = resultsById[TestID][run.BrowserName]
			if ok {
				logger.Warningf("Duplicate sub-results for "+
					"TestID:%v  in TestRun:%v.  "+
					"Overwriting.\n", TestID, run)
			}
			newStatus := metrics.CompleteTestStatus{
				Status: metrics.TestStatusFromString(
					result.Status),
				SubStatus: metrics.SubTestStatusFromString(
					subResult.Status),
			}
			resultsById[TestID][run.BrowserName] = newStatus
		}
	}

	return resultsById
}

// Compute {"test/path": number of tests} for all test directory and/or file
// names included in results.
func ComputeTotals(results *TestRunsStatus) (metrics map[string]int) {
	metrics = make(map[string]int)

	for TestID := range *results {
		pathParts := strings.Split(TestID.Test, "/")
		for i := range pathParts {
			subPath := strings.Join(pathParts[:i+1], "/")
			_, ok := metrics[subPath]
			if !ok {
				metrics[subPath] = 0
			}
			metrics[subPath] = metrics[subPath] + 1
		}
	}

	return metrics
}

// Compute:
// [
//  [TestIDs of tests browserName + 0 other browsers fail],
//  [TestIDs of tests browserName + 1 other browsers fail],
//  ...
//  [TestIDs of tests browserName + n other browsers fail],
// ]
func ComputeBrowserFailureList(numRuns int, browserName string,
	results *TestRunsStatus, passes Passes) (failures [][]metrics.TestID) {
	failures = make([][]metrics.TestID, numRuns)

	for TestID, runStatuses := range *results {
		numOtherFailures := 0
		browserFailed := false
		for runBrowser, status := range runStatuses {
			if !passes(&status) {
				if runBrowser == browserName {
					browserFailed = true
				} else {
					numOtherFailures++
				}
			}
		}
		if !browserFailed {
			continue
		}
		failures[numOtherFailures] = append(failures[numOtherFailures], TestID)
	}

	return failures
}

// Compute:
// {
//   "test/path": [
//     Number of tests passed by 0 test runs,
//     Number of tests passed by 1 test run,
//     Number of tests passed by 2 test runs,
//     ...
//     Number of tests passed by n test runs,
//   ],
// }
func ComputePassRateMetric(numRuns int,
	results *TestRunsStatus, passes Passes) (
	metrics map[string][]int) {
	metrics = make(map[string][]int)

	for TestID, runStatuses := range *results {
		passCount := 0
		for _, status := range runStatuses {
			if passes(&status) {
				passCount++
			}
		}
		pathParts := strings.Split(TestID.Test, "/")
		for i := range pathParts {
			subPath := strings.Join(pathParts[:i+1], "/")
			_, ok := metrics[subPath]
			if !ok {
				metrics[subPath] = make([]int, numRuns+1)
			}
			metrics[subPath][passCount] =
				metrics[subPath][passCount] + 1
		}
	}

	return metrics
}
