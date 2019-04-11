// Copyright 2018 The WPT Dashboard Project. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

package metrics

import (
	"context"

	log "github.com/Hexcles/logrus"
	"github.com/web-platform-tests/wpt.fyi/shared"
)

// GetLogger retrieves a non-nil shared.Logger that is appropriate for use in
// ctx. If ctx does not provide a logger, then a nil-logger is returned.
func GetLogger(ctx context.Context) shared.Logger {
	logger, ok := ctx.Value(shared.DefaultLoggerCtxKey()).(shared.Logger)
	if !ok || logger == nil {
		log.Warningf("Context without logger: %v; logs will be dropped", ctx)
		return shared.NewNilLogger()
	}

	return logger
}
