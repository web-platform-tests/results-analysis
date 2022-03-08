# WPT Results Analysis

This repository contains a set of scripts for doing analysis on results from
runs of [web-platform-tests](https://web-platform-tests.org/) uploaded to
[wpt.fyi](https://wpt.fyi). It utilizes a git repository,
[results-analysis-cache](https://github.com/web-platform-tests/results-analysis-cache),
as a storage and compression mechanism for the results data.

The analysis files are expected to be run via `node`, and should be
independently documented inside the file.

### gh-pages

Metrics are regularly updated and pushed to the `gh-pages` branch using GitHub Actions, see [update_gh_pages.yml](.github/workflows/update_gh_pages.yml).

## Setup

Run `npm install`; this will install any necessary dependencies and clone the
results-analysis-cache repo locally.

### results-analysis-cache repository

This repository stores results from WPT runs as a flat forest. Each run is an
orphan commit with no parent, and is tagged with the run id. This allows for an
excellent compression ratio, whilst still having reasonable lookup time.

The repository can be updated via `git-write.js`, though this happens
automatically upstream (via a cronjob). As such, to fetch new runs you should
just `cd` into the results-analysis-cache directory and run `git pull`.

## Running the scripts

### browser-specific-failures.js

```
$ node browser-specific-failures.js --help
Usage: node browser-specific-failures.js [options]

Options:
  --from: Starting date (inclusive)
    (default: "2018-07-01")
  --to: Ending date (exclusive)
    (default: "2020-05-21")
  --products: Browsers to compare. Must match the products used on 
    wpt.fyi 
    (default: ["chrome","firefox","safari"])
  --output: Output CSV file to write to. Defaults to {stable, 
    experimental}-browser-specific-failures.csv 
    (default: null)
  --[no]experimental: Calculate metrics for experimental runs.
    (default: false)
```
