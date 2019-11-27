# Ad-hoc WPT Results Analysis

This repository contains a set of scripts for doing analysis on results from
runs of [web-platform-tests](https://web-platform-tests.org/) uploaded to
[wpt.fyi](https://wpt.fyi). It utilizes a git repository,
[wpt-results](https://github.com/foolip/wpt-results), as a storage and
compression mechanism for the results data.

The analysis files are expected to be run via `node`, and should be
independently documented inside the file.

## Setup

Run `npm install`; this will install any necessary dependencies and clone the
wpt-results repo locally.

## wpt-results repository

This repository stores results from WPT runs as a flat forest. Each run is an
orphan commit with no parent, and is tagged with the run id. This allows for an
excellent compression ratio, whilst still having reasonable lookup time.

The repository can be updated via `git-write.js`, though this happens
automatically upstream (via a cronjob). As such, to fetch new runs you should
just `cd` into the wpt-results directory and run `git pull`.
