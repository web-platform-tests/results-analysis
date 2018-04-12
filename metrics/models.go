// Copyright 2017 The WPT Dashboard Project. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

package metrics

import (
	"time"

	base "github.com/w3c/wptdashboard/shared"
)

// ByCreatedDate sorts tests by run's CreatedAt date (descending)
// then by platform alphabetically (ascending).
type ByCreatedDate []base.TestRun

func (s ByCreatedDate) Len() int          { return len(s) }
func (s ByCreatedDate) Swap(i int, j int) { s[i], s[j] = s[j], s[i] }
func (s ByCreatedDate) Less(i int, j int) bool {
	if s[i].Revision != s[j].Revision {
		return s[i].CreatedAt.After(s[j].CreatedAt)
	}
	if s[i].BrowserName != s[j].BrowserName {
		return s[i].BrowserName < s[j].BrowserName
	}
	if s[i].BrowserVersion != s[j].BrowserVersion {
		return s[i].BrowserVersion < s[j].BrowserVersion
	}
	if s[i].OSName != s[j].OSName {
		return s[i].OSName < s[j].OSName
	}
	return s[i].OSVersion < s[j].OSVersion
}

// SubTest models a single test within a WPT test file.
type SubTest struct {
	Name    string  `json:"name"`
	Status  string  `json:"status"`
	Message *string `json:"message"`
}

// TestResults captures the results of running the tests in a WPT test file.
type TestResults struct {
	Test     string    `json:"test"`
	Status   string    `json:"status"`
	Message  *string   `json:"message"`
	Subtests []SubTest `json:"subtests"`
}

// TestRunResults binds a base.TestRun to a TestResults.
type TestRunResults struct {
	Run *base.TestRun
	Res *TestResults
}

// TestID uniquely identifies a test within the scope of its WPT revision.
type TestID struct {
	Test string `json:"test"`
	Name string `json:"name"`
}

// ByTestPath sorts test ids by their test path, then name, descending.
type ByTestPath []TestID

func (s ByTestPath) Len() int          { return len(s) }
func (s ByTestPath) Swap(i int, j int) { s[i], s[j] = s[j], s[i] }
func (s ByTestPath) Less(i int, j int) bool {
	if s[i].Test != s[j].Test {
		return s[i].Test < s[j].Test
	}
	return s[i].Name < s[j].Name
}

// TestStatus is an enum of test status, according to legitimate string values
// in WPT results reports.
type TestStatus int32

const (
	// TestStatus_TEST_STATUS_UNKNOWN is an uninitialized TestStatus and should
	// not be used.
	TestStatus_TEST_STATUS_UNKNOWN TestStatus = 0

	// TestStatus_TEST_OK indicates that all tests completed successfully.
	TestStatus_TEST_OK TestStatus = 1

	// TestStatus_TEST_ERROR indicates that some tests did not complete
	// successfully.
	TestStatus_TEST_ERROR TestStatus = 2

	// TestStatus_TEST_TIMEOUT indicates that some tests timed out.
	TestStatus_TEST_TIMEOUT TestStatus = 3
)

// TestStatus_name maps TestStatus values to names.
var TestStatus_name = map[int32]string{
	0: "TEST_STATUS_UNKNOWN",
	1: "TEST_OK",
	2: "TEST_ERROR",
	3: "TEST_TIMEOUT",
}

// TestStatus_value maps test names to TestStatus values.
var TestStatus_value = map[string]int32{
	"TEST_STATUS_UNKNOWN": 0,
	"TEST_OK":             1,
	"TEST_ERROR":          2,
	"TEST_TIMEOUT":        3,
}

// TestStatus_fromString produces a TestStatus value from a name.
func TestStatus_fromString(str string) (ts TestStatus) {
	value, ok := TestStatus_value["TEST_"+str]
	if !ok {
		return TestStatus_TEST_STATUS_UNKNOWN
	}
	return TestStatus(value)
}

// SubTestStatus is an enum of sub-test status, according to legitimate string
// values in WPT results reports.
type SubTestStatus int32

const (
	// SubTestStatus_SUB_TEST_STATUS_UNKNOWN is an uninitialized SubTestStatus
	// and should not be used.
	SubTestStatus_SUB_TEST_STATUS_UNKNOWN SubTestStatus = 0

	// SubTestStatus_SUB_TEST_PASS indicates that a test passed.
	SubTestStatus_SUB_TEST_PASS SubTestStatus = 1

	// SubTestStatus_SUB_TEST_FAIL indicates that a test failed.
	SubTestStatus_SUB_TEST_FAIL SubTestStatus = 2

	// SubTestStatus_SUB_TEST_TIMEOUT indicates that a test timed out.
	SubTestStatus_SUB_TEST_TIMEOUT SubTestStatus = 3

	// SubTestStatus_SUB_TEST_NOT_RUN indicates that a test was not run.
	SubTestStatus_SUB_TEST_NOT_RUN SubTestStatus = 4
)

// SubTestStatus_name maps SubTestStatus values to names.
var SubTestStatus_name = map[int32]string{
	0: "SUB_TEST_STATUS_UNKNOWN",
	1: "SUB_TEST_PASS",
	2: "SUB_TEST_FAIL",
	3: "SUB_TEST_TIMEOUT",
	4: "SUB_TEST_NOT_RUN",
}

// SubTestStatus_value maps test status names to SubTestStatus values.
var SubTestStatus_value = map[string]int32{
	"SUB_TEST_STATUS_UNKNOWN": 0,
	"SUB_TEST_PASS":           1,
	"SUB_TEST_FAIL":           2,
	"SUB_TEST_TIMEOUT":        3,
	"SUB_TEST_NOT_RUN":        4,
}

// SubTestStatus_fromString produces a SubTestStatus value from a name.
func SubTestStatus_fromString(str string) (ts SubTestStatus) {
	value, ok := SubTestStatus_value["SUB_TEST_"+str]
	if !ok {
		return SubTestStatus_SUB_TEST_STATUS_UNKNOWN
	}
	return SubTestStatus(value)
}

//
// Intermediate state representations for metrics computation
//

// CompleteTestStatus binds a TestStatus to a SubTestStatus.
type CompleteTestStatus struct {
	Status    TestStatus
	SubStatus SubTestStatus
}

// TestRunStatus binds a TestRun to a CompleteTestStatus.
type TestRunStatus struct {
	Run    *base.TestRun
	Status CompleteTestStatus
}

// PassRateMetadata constitutes metadata capturing:
// - When metric run was performed;
// - What test runs are part of the metric run;
// - Where the metric run results reside (a URL).
type PassRateMetadata struct {
	StartTime time.Time      `json:"start_time"`
	EndTime   time.Time      `json:"end_time"`
	TestRuns  []base.TestRun `json:"test_runs"`
	DataURL   string         `json:"url"`
}

// FailuresMetadata constitutes metadata capturing:
// - When failures report was gathered;
// - What test runs are part of the failures report;
// - Where the failures report resids (a URL);
// - What browser is described in the report.
type FailuresMetadata struct {
	StartTime   time.Time      `json:"start_time"`
	EndTime     time.Time      `json:"end_time"`
	TestRuns    []base.TestRun `json:"test_runs"`
	DataURL     string         `json:"url"`
	BrowserName string         `json:"browser_name"`
}

// RunData is the output type for metrics: Include runs as metadata, and
// arbitrary content as data.
type RunData struct {
	Metadata interface{} `json:"metadata"`
	Data     interface{} `json:"data"`
}
