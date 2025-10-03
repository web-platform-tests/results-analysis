'use strict';

const moment = require('moment');

// There have been periods where results cannot be considered valid and
// contribute noise to the metrics. These date ranges are listed below, with
// inclusive start dates and exclusive end dates.

const STABLE_BAD_RANGES = [
  // This was a safaridriver outage, resolved by
  // https://github.com/web-platform-tests/wpt/pull/15659
  [moment('2019-02-06'), moment('2019-03-09')],
  // This was a safaridriver outage, resolved by
  // https://github.com/web-platform-tests/wpt/pull/18585
  [moment('2019-06-27'), moment('2019-08-23')],
  // This was a general outage due to the Taskcluster Checks migration.
  [moment('2020-07-08'), moment('2020-07-16')],
  // This was a Firefox outage which produced only partial test results.
  [moment('2020-07-21'), moment('2020-08-15')],
  // This was a regression from https://github.com/web-platform-tests/wpt/pull/29089,
  // fixed by https://github.com/web-platform-tests/wpt/pull/32540
  [moment('2022-01-25'), moment('2022-01-27')],
  // This was a very much incomplete Safari run.
  [moment('2023-07-17'), moment('2023-07-18')],
  // Safari got a lot of broken screenshots.
  // https://bugs.webkit.org/show_bug.cgi?id=262078
  [moment('2023-09-20'), moment('2023-09-21')],
  // macOS Tahoe upgrade caused a bunch of bogus reftest failures.
  [moment('2025-09-20'), moment('2025-09-23')],
];

const EXPERIMENTAL_BAD_RANGES = [
  // This was a safaridriver outage, resolved by
  // https://github.com/web-platform-tests/wpt/pull/18585
  [moment('2019-06-27'), moment('2019-08-23')],
  // Bad Firefox run:
  // https://wpt.fyi/results/?diff&filter=ADC&run_id=387040002&run_id=404070001
  [moment('2019-12-25'), moment('2019-12-26')],
  // This was a general outage due to the Taskcluster Checks migration.
  [moment('2020-07-08'), moment('2020-07-16')],
  // Bad Chrome run:
  // https://wpt.fyi/results/?diff&filter=ADC&run_id=622910001&run_id=634430001
  [moment('2020-07-31'), moment('2020-08-01')],
  // Something went wrong with the Firefox run on this date.
  [moment('2021-03-08'), moment('2021-03-09')],
  // This was a regression from https://github.com/web-platform-tests/wpt/pull/29089,
  // fixed by https://github.com/web-platform-tests/wpt/pull/32540
  [moment('2022-01-25'), moment('2022-01-27')],
  // These were very much incomplete Safari runs.
  [moment('2023-09-02'), moment('2023-09-03')],
  [moment('2023-09-11'), moment('2023-09-12')],
  [moment('2023-09-20'), moment('2023-09-21')],
  [moment('2023-09-22'), moment('2023-09-23')],
  [moment('2024-01-29'), moment('2024-01-30')],
  // macOS Tahoe upgrade caused a bunch of bogus reftest failures.
  [moment('2025-09-20'), moment('2025-09-23')],
];

// Advances date to the end of a bad range if it's in a bad range, and otherwise
// returns the same date value.
function advanceDateToSkipBadDataIfNecessary(date, experimental) {
  const ranges = experimental ? EXPERIMENTAL_BAD_RANGES : STABLE_BAD_RANGES;
  for (const range of ranges) {
    if (date >= range[0] && date < range[1]) {
      console.log(`Skipping from ${date.format('YYYY-MM-DD')} to ` +
          `${range[1].format('YYYY-MM-DD')} due to bad data`);
      return range[1];
    }
  }
  return date;
}


module.exports = {advanceDateToSkipBadDataIfNecessary};
