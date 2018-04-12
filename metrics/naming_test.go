// Copyright 2017 The WPT Dashboard Project. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

package metrics

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestGetDatastoreKindName(t *testing.T) {
	testId := TestId{
		Test: "test",
		Name: "name",
	}

	const expected = "github.com.web-platform-tests.results-analysis.metrics.TestId"
	name := GetDatastoreKindName(testId)
	assert.Equal(t, expected, name)

	name = GetDatastoreKindName(&testId)
	assert.Equal(t, expected, name)
}
