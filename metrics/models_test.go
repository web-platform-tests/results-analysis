// Copyright 2017 The WPT Dashboard Project. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

package metrics

import (
	"sort"
	"testing"
	"time"

	"fmt"

	"github.com/stretchr/testify/assert"
	models "github.com/web-platform-tests/wpt.fyi/shared"
)

var today = time.Date(2018, 1, 4, 0, 0, 0, 0, time.UTC)
var tomorrow = time.Date(2018, 1, 5, 0, 0, 0, 0, time.UTC)

func TestByCreatedDate_DifferentRevisions(t *testing.T) {
	tests := []TestRunLegacy{
		{
			ProductAtRevision: models.ProductAtRevision{
				Product: models.Product{
					BrowserName: "chrome",
				},
				Revision: "abc",
			},
			CreatedAt: today,
		}, {
			ProductAtRevision: models.ProductAtRevision{
				Product: models.Product{
					BrowserName: "safari",
				},
				Revision: "def",
			},
			CreatedAt: tomorrow,
		},
	}
	sort.Sort(ByCreatedDate(tests))
	fmt.Print(tests)
	assert.True(t, tests[0].CreatedAt == tomorrow)
}

func TestByCreatedDate_SameRevisions(t *testing.T) {
	tests := []TestRunLegacy{
		{
			ProductAtRevision: models.ProductAtRevision{
				Product: models.Product{
					BrowserName: "chrome",
				},
				Revision: "abc",
			},
			CreatedAt: today,
		},
		{
			ProductAtRevision: models.ProductAtRevision{
				Product: models.Product{
					BrowserName: "safari",
				},
				Revision: "abc",
			},
			CreatedAt: tomorrow,
		},
	}
	sort.Sort(ByCreatedDate(tests))
	fmt.Print(tests)
	assert.True(t, tests[0].BrowserName == "chrome")
}

func TestByTestPath_DifferentPaths(t *testing.T) {
	tests := []TestID{
		{
			Test: "/bcd/efg",
			Name: "Alignment test",
		},
		{
			Test: "/abc/def",
			Name: "Border test",
		},
	}
	sort.Sort(ByTestPath(tests))
	fmt.Print(tests)
	assert.True(t, tests[0].Test == "/abc/def")
}

func TestByTestPath_SamePaths(t *testing.T) {
	tests := []TestID{
		{
			Test: "/abc/def",
			Name: "Border test",
		},
		{
			Test: "/abc/def",
			Name: "Alignment test",
		},
	}
	sort.Sort(ByTestPath(tests))
	fmt.Print(tests)
	assert.True(t, tests[0].Name == "Alignment test")
}
