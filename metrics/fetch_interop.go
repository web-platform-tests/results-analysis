package metrics

import "github.com/web-platform-tests/wpt.fyi/shared"

// FetchInterop fetches the PassRateMetadata for the given sha / labels, using
// the API on the given host.
func FetchInterop(wptdHost string, filter shared.TestRunFilter) PassRateMetadata {
	url := "https://" + wptdHost + "/api/interop"
	url += "?" + filter.OrDefault().ToQuery().Encode()

	var interop PassRateMetadata
	shared.FetchJSON(url, &interop)
	return interop
}
