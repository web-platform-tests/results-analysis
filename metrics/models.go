// Copyright 2017 The WPT Dashboard Project. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

package metrics

import (
	"context"
	"encoding/json"
	"time"

	"github.com/web-platform-tests/wpt.fyi/shared"
)

// ByCreatedDate sorts tests by run's CreatedAt date (descending)
// then by platform alphabetically (ascending).
type ByCreatedDate []TestRunLegacy

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

// TestResultsReport models the `wpt run` results report JSON file format.
type TestResultsReport struct {
	Results []*TestResults `json:"results"`
}

// TestRunResults binds a shared.TestRun to a TestResults.
type TestRunResults struct {
	Run *TestRunLegacy
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
	// TestStatusUnknown is an uninitialized TestStatus and should
	// not be used.
	TestStatusUnknown TestStatus = 0

	// TestStatusOK indicates that all tests completed successfully.
	TestStatusOK TestStatus = 1

	// TestStatusError indicates that some tests did not complete
	// successfully.
	TestStatusError TestStatus = 2

	// TestStatusTimeout indicates that some tests timed out.
	TestStatusTimeout TestStatus = 3

	// TestStatusPass indicates that all tests completed successfully and passed.
	TestStatusPass TestStatus = 4
)

var testStatusNames = map[int32]string{
	0: "TEST_STATUS_UNKNOWN",
	1: "TEST_OK",
	2: "TEST_ERROR",
	3: "TEST_TIMEOUT",
	4: "TEST_PASS",
}

var testStatusValues = map[string]int32{
	"TEST_STATUS_UNKNOWN": 0,
	"TEST_OK":             1,
	"TEST_ERROR":          2,
	"TEST_TIMEOUT":        3,
	"TEST_PASS":           4,
}

// TestStatusFromString produces a TestStatus value from a name.
func TestStatusFromString(str string) (ts TestStatus) {
	value, ok := testStatusValues["TEST_"+str]
	if !ok {
		return TestStatusUnknown
	}
	return TestStatus(value)
}

// TestStatusName produces a name from a TestStatus value.
func TestStatusName(ts TestStatus) string {
	name, ok := testStatusNames[int32(ts)]
	if !ok {
		return testStatusNames[0]
	}
	return name
}

// SubTestStatus is an enum of sub-test status, according to legitimate string
// values in WPT results reports.
type SubTestStatus int32

const (
	// SubTestStatusUnknown is an uninitialized SubTestStatus
	// and should not be used.
	SubTestStatusUnknown SubTestStatus = 0

	// SubTestStatusPass indicates that a test passed.
	SubTestStatusPass SubTestStatus = 1

	// SubTestStatusFail indicates that a test failed.
	SubTestStatusFail SubTestStatus = 2

	// SubTestStatusTimeout indicates that a test timed out.
	SubTestStatusTimeout SubTestStatus = 3

	// SubTestStatusNotRun indicates that a test was not run.
	SubTestStatusNotRun SubTestStatus = 4
)

var subTestStatusNames = map[int32]string{
	0: "SUB_TEST_STATUS_UNKNOWN",
	1: "SUB_TEST_PASS",
	2: "SUB_TEST_FAIL",
	3: "SUB_TEST_TIMEOUT",
	4: "SUB_TEST_NOT_RUN",
}

var subTestStatusValues = map[string]int32{
	"SUB_TEST_STATUS_UNKNOWN": 0,
	"SUB_TEST_PASS":           1,
	"SUB_TEST_FAIL":           2,
	"SUB_TEST_TIMEOUT":        3,
	"SUB_TEST_NOT_RUN":        4,
}

// SubTestStatusFromString produces a SubTestStatus value from a name.
func SubTestStatusFromString(str string) (ts SubTestStatus) {
	value, ok := subTestStatusValues["SUB_TEST_"+str]
	if !ok {
		return SubTestStatusUnknown

	}
	return SubTestStatus(value)
}

// SubTestStatusName produces a SubTestStatus value from a name.
func SubTestStatusName(ts SubTestStatus) string {
	name, ok := subTestStatusNames[int32(ts)]
	if !ok {
		return subTestStatusNames[0]

	}
	return name
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
	Run    *shared.TestRun
	Status CompleteTestStatus
}

// TestRunsMetadata is a struct for metadata derived from a group of TestRun entities.
type TestRunsMetadata struct {
	// TestRuns are the TestRun entities, loaded from the TestRunIDs
	TestRuns   shared.TestRuns   `json:"test_runs,omitempty" datastore:"-"`
	TestRunIDs shared.TestRunIDs `json:"-"`
	StartTime  time.Time         `json:"start_time"`
	EndTime    time.Time         `json:"end_time"`
	DataURL    string            `json:"url"`
}

// TODO(lukebjerring): Remove TestRunLegacy when old format migrated.

// TestRunLegacy is a copy of the TestRun struct, before the `Labels` field
// was added (which causes an array of array and breaks datastore).
type TestRunLegacy struct {
	ID int64 `json:"id" datastore:"-"`

	shared.ProductAtRevision

	// URL for summary of results, which is derived from raw results.
	ResultsURL string `json:"results_url"`

	// Time when the test run metadata was first created.
	CreatedAt time.Time `json:"created_at"`

	// URL for raw results JSON object. Resembles the JSON output of the
	// wpt report tool.
	RawResultsURL string `json:"raw_results_url"`
}

// ConvertRuns converts TestRuns into the legacy format.
func ConvertRuns(runs shared.TestRuns) (converted []TestRunLegacy, err error) {
	if serialized, err := json.Marshal(runs); err != nil {
		return nil, err
	} else if err = json.Unmarshal(serialized, &converted); err != nil {
		return nil, err
	}
	return converted, nil
}

// TODO(lukebjerring): Remove TestRunsMetadataLegacy when old format migrated.

// TestRunsMetadataLegacy is a struct for loading legacy TestRunMetadata entities,
// which may have nested TestRun entities.
type TestRunsMetadataLegacy struct {
	TestRuns   []TestRunLegacy   `json:"test_runs"`
	TestRunIDs shared.TestRunIDs `json:"-"`
	StartTime  time.Time         `json:"start_time"`
	EndTime    time.Time         `json:"end_time"`
	DataURL    string            `json:"url"`
}

// LoadTestRuns fetches the TestRun entities for the PassRateMetadata's TestRunIDs.
func (metadata *TestRunsMetadata) LoadTestRuns(ctx context.Context) (err error) {
	metadata.TestRuns, err = metadata.TestRunIDs.LoadTestRuns(ctx)
	return err
}

// LoadTestRuns fetches the TestRun entities for the PassRateMetadata's TestRunIDs.
func (metadata *TestRunsMetadataLegacy) LoadTestRuns(ctx context.Context) (err error) {
	if len(metadata.TestRuns) == 0 {
		newRuns, err := metadata.TestRunIDs.LoadTestRuns(ctx)
		if err != nil {
			return err
		}
		if metadata.TestRuns, err = ConvertRuns(newRuns); err != nil {
			return err
		}
	}
	return err
}

// PassRateMetadata constitutes metadata capturing:
// - When metric run was performed;
// - What test runs are part of the metric run;
// - Where the metric run results reside (a URL).
type PassRateMetadata struct {
	TestRunsMetadata
}

// TODO(lukebjerring): Remove PassRateMetadataLegacy when old format migrated.

// PassRateMetadataLegacy is a struct for storing a PassRateMetadata entry in the
// datastore, avoiding nested arrays. PassRateMetadata is the legacy format, used for
// loading the entity, for backward compatibility.
type PassRateMetadataLegacy struct {
	TestRunsMetadataLegacy
}

// FailuresMetadata constitutes metadata capturing:
// - When failures report was gathered;
// - What test runs are part of the failures report;
// - Where the failures report resids (a URL);
// - What browser is described in the report.
type FailuresMetadata struct {
	TestRunsMetadata
	BrowserName string `json:"browser_name"`
}

// TODO(lukebjerring): Remove FailuresMetadataLegacy when old format migrated.

// FailuresMetadataLegacy is a struct for storing a FailuresMetadata entry in the
// datastore, avoiding nested arrays. FailuresMetadata is the legacy format, used for
// loading the entity, for backward compatibility.
type FailuresMetadataLegacy struct {
	TestRunsMetadataLegacy
	BrowserName string `json:"browser_name"`
}

// RunData is the output type for metrics: Include runs as metadata, and
// arbitrary content as data.
type RunData struct {
	Metadata interface{} `json:"metadata"`
	Data     interface{} `json:"data"`
}
