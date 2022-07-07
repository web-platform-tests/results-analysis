'use strict';

const moment = require('moment');

// There have been periods where results cannot be considered valid and
// contribute noise to the metrics. These date ranges are listed below, with
// inclusive start dates and exclusive end dates.

const STABLE_BAD_RANGES = [
  // This was a safaridriver outage, resolved by
  // https://github.com/web-platform-tests/wpt/pull/18585
  [moment('2019-06-27'), moment('2019-08-22')],

  // Untriaged (many MISSING results)
  [moment('2019-08-25'), moment('2019-08-26')],

  // Untriaged (many MISSING results)
  [moment('2019-09-03'), moment('2019-09-04')],

  // Untriaged (many MISSING results)
  [moment('2019-09-10'), moment('2019-09-11')],

  // Untriaged (many MISSING results)
  [moment('2019-12-12'), moment('2019-12-13')],

  // Untriaged (many MISSING results)
  [moment('2020-02-19'), moment('2020-03-02')],

  // Untriaged (many MISSING results)
  [moment('2020-03-04'), moment('2020-03-05')],

  // Untriaged (many MISSING results)
  [moment('2020-04-08'), moment('2020-04-09')],

  // Untriaged (many MISSING results)
  [moment('2020-05-14'), moment('2020-05-15')],

  // This was a general outage due to the Taskcluster Checks migration.
  [moment('2020-07-09'), moment('2020-07-14')],

  // This was a Firefox outage which produced only partial test results.
  [moment('2020-07-20'), moment('2020-08-06')],

  // Untriaged (many MISSING results)
  [moment('2020-09-23'), moment('2020-09-24')],

  // Untriaged (many MISSING results)
  [moment('2020-10-01'), moment('2020-10-06')],

  // Untriaged (many MISSING results)
  [moment('2020-10-08'), moment('2020-10-12')],

  // Untriaged (many MISSING results)
  [moment('2020-10-15'), moment('2020-10-17')],

  // Untriaged (many MISSING results)
  [moment('2020-10-20'), moment('2020-10-22')],

  // Untriaged (many MISSING results)
  [moment('2020-10-28'), moment('2020-10-29')],

  // Untriaged (many MISSING results)
  [moment('2020-11-04'), moment('2020-11-05')],

  // Untriaged (many MISSING results)
  [moment('2020-11-06'), moment('2020-11-11')],

  // Untriaged (many MISSING results)
  [moment('2020-11-12'), moment('2020-11-14')],

  // Untriaged (many MISSING results)
  [moment('2020-11-17'), moment('2020-11-18')],

  // Untriaged (many MISSING results)
  [moment('2020-11-19'), moment('2020-11-20')],

  // Untriaged (many MISSING results)
  [moment('2020-11-23'), moment('2020-11-25')],

  // Untriaged (many MISSING results)
  [moment('2020-11-26'), moment('2020-11-27')],

  // Untriaged (many MISSING results)
  [moment('2020-11-28'), moment('2020-12-05')],

  // Untriaged (many MISSING results)
  [moment('2020-12-06'), moment('2020-12-07')],

  // Untriaged (many MISSING results)
  [moment('2020-12-13'), moment('2020-12-18')],

  // Untriaged (many MISSING results)
  [moment('2020-12-19'), moment('2020-12-20')],

  // Untriaged (many MISSING results)
  [moment('2020-12-22'), moment('2020-12-23')],

  // Untriaged (many MISSING results)
  [moment('2020-12-24'), moment('2020-12-25')],

  // Untriaged (many MISSING results)
  [moment('2020-12-31'), moment('2021-01-02')],

  // Untriaged (many MISSING results)
  [moment('2021-01-05'), moment('2021-01-08')],

  // Untriaged (many MISSING results)
  [moment('2021-01-09'), moment('2021-01-10')],

  // Untriaged (many MISSING results)
  [moment('2021-01-14'), moment('2021-01-15')],

  // Untriaged (many MISSING results)
  [moment('2021-01-23'), moment('2021-01-24')],

  // Untriaged (many MISSING results)
  [moment('2021-01-25'), moment('2021-01-26')],

  // Untriaged (many MISSING results)
  [moment('2021-01-30'), moment('2021-01-31')],

  // Untriaged (many MISSING results)
  [moment('2021-02-03'), moment('2021-02-04')],

  // Untriaged (many MISSING results)
  [moment('2021-02-09'), moment('2021-02-10')],

  // Untriaged (many MISSING results)
  [moment('2021-02-13'), moment('2021-02-14')],

  // Untriaged (many MISSING results)
  [moment('2021-02-20'), moment('2021-02-21')],

  // Untriaged (many MISSING results)
  [moment('2021-03-09'), moment('2021-03-10')],

  // Untriaged (many MISSING results)
  [moment('2021-03-31'), moment('2021-04-01')],

  // Untriaged (many MISSING results)
  [moment('2021-04-22'), moment('2021-05-18')],

  // Untriaged (many MISSING results)
  [moment('2021-05-19'), moment('2021-06-05')],

  // Untriaged (many MISSING results)
  [moment('2021-06-10'), moment('2021-06-11')],

  // Untriaged (many MISSING results)
  [moment('2021-08-10'), moment('2021-08-11')],

  // This was a regression from https://github.com/web-platform-tests/wpt/pull/29089,
  // fixed by https://github.com/web-platform-tests/wpt/pull/32540
  [moment('2022-01-25'), moment('2022-01-26')],

  // Untriaged (many MISSING results)
  [moment('2022-04-13'), moment('2022-04-14')],
];

const EXPERIMENTAL_BAD_RANGES = [
  // Bad Safari runs, resolved by
  // https://github.com/web-platform-tests/wpt/pull/18585
  [moment('2019-03-15'), moment('2019-03-16')],
  [moment('2019-04-01'), moment('2019-04-02')],
  [moment('2019-04-03'), moment('2019-04-04')],
  [moment('2019-04-23'), moment('2019-04-24')],
  [moment('2019-05-29'), moment('2019-06-05')],
  [moment('2019-06-06'), moment('2019-06-18')],
  [moment('2019-06-20'), moment('2019-08-23')],

  // Bad Safari run:
  // https://wpt.fyi/results/?run_id=277000002&run_id=281260002
  [moment('2019-08-27'), moment('2019-08-28')],

  // Bad Safari run:
  // https://wpt.fyi/results/?run_id=306790008&run_id=291640006
  [moment('2019-09-10'), moment('2019-09-11')],

  // Bad Firefox run:
  // https://wpt.fyi/results/?diff&filter=ADC&run_id=387040002&run_id=404070001
  [moment('2019-12-25'), moment('2019-12-26')],

  // This was a general outage due to the Taskcluster Checks migration.
  [moment('2020-07-08'), moment('2020-07-09')],

  // Bad Chrome run:
  // https://wpt.fyi/results/?diff&filter=ADC&run_id=622910001&run_id=634430001
  [moment('2020-07-31'), moment('2020-08-01')],

  // Bad Safari run:
  // https://wpt.fyi/results/?run_id=672760002&run_id=676880001
  [moment('2020-09-18'), moment('2020-09-19')],

  // Bad Safari runs:
  [moment('2020-09-21'), moment('2020-09-25')],

  // Bad Safari runs:
  [moment('2020-09-26'), moment('2020-09-27')],
  [moment('2020-09-28'), moment('2020-09-30')],
  [moment('2020-10-05'), moment('2020-10-07')],
  [moment('2020-10-08'), moment('2020-10-09')],
  [moment('2020-10-10'), moment('2020-10-17')],
  [moment('2020-10-18'), moment('2020-11-06')],
  [moment('2020-11-07'), moment('2020-11-20')],

  // Something went wrong with the Firefox run on this date.
  [moment('2021-03-08'), moment('2021-03-09')],

    // Bad Firefox runs:
  // https://github.com/web-platform-tests/wpt/issues/29108
  [moment('2021-04-22'), moment('2021-06-05')],

  // This was a regression from https://github.com/web-platform-tests/wpt/pull/29089,
  // fixed by https://github.com/web-platform-tests/wpt/pull/32540
  [moment('2022-01-25'), moment('2022-01-27')],
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
