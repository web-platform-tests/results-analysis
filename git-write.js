'use strict';

const fetch = require('node-fetch');
const flags = require('flags');
const Git = require('nodegit');
const runs = require('./lib/runs');

flags.defineInteger('max-runs', 0, 'Write at most this many runs');
flags.defineInteger('max-time', 0, 'Run for at most this many seconds');
flags.parse();

async function writeRunToGit(run, repo) {
  const tagName = `run/${run.id}/results`;
  try {
    await repo.getReference(`refs/tags/${tagName}`);
    return false;
  } catch (e) {}

  const reportURL = run.raw_results_url;
  console.log(`Fetching ${reportURL}`);
  const report = await (await fetch(reportURL)).json();
  await writeReportToGit(report, repo, reportURL, tagName);
  console.log(`Wrote ${tagName}`);
  return true;
}

async function writeReportToGit(report, repo, commitMessage, tagName) {
  // Create a tree of Treebuilders. When all the files have been written, this
  // tree is traversed depth first to write all of the trees.
  async function emptyTree() {
    const builder = await Git.Treebuilder.create(repo, null);
    return { builder, subtrees: new Map };
  }

  const rootTree = await emptyTree();

  async function getTree(dirs) {
    let tree = rootTree;
    for (let i = 0; i < dirs.length; i++) {
      const dir = dirs[i];
      let subtree = tree.subtrees.get(dir);
      if (!subtree) {
        subtree = await emptyTree();
        tree.subtrees.set(dir, subtree);
      }
      tree = subtree;
    }
    return tree;
  }

  async function writeTree(tree) {
    for (const [dir, subtree] of tree.subtrees.entries()) {
      const oid = await writeTree(subtree);
      tree.builder.insert(dir, oid, Git.TreeEntry.FILEMODE.TREE);
    }
    return tree.builder.write();
  }

  let blobCache = new Map;

  function isJSONObject(v) {
    return typeof v === "object" && v !== null && !Array.isArray(v);
  }

  // Keep only a fixed set of keys. This filters out at least:
  //  - "duration" which is different for every run
  //  - "expected" which will always be "PASS" or "OK" for wpt.fyi runs
  //  - "known_intermittent" which is for flaky expectations
  //  - "message" which contains the failure reason
  //  - "screenshots" which contains screenshot hashes
  //  - "test" which is the test path, and will be represented elsewhere
  // Note that "" is the dummy key value for the initial object.
  const keepKeys = new Set(["", "name", "status", "subtests"]);

  function replacer(key, value) {
    if (isJSONObject(this)) {
      if (!keepKeys.has(key)) {
        return undefined;
      }
    }

    // If the value is null (often for "message"), just omit it.
    if (value === null) {
      return undefined;
    }

    // If the value is an empty array (often for "subtests"), just omit it.
    if (Array.isArray(value) && value.length === 0) {
      return undefined;
    }

    // Ensure that objects keys are sorted, as they would be if using
    // `json.dumps(value, sort_keys=True)` in Python.
    if (isJSONObject(value)) {
      const valueKeys = Object.keys(value);
      valueKeys.sort();
      const sortedValue = {};
      for (const valueKey of valueKeys) {
        sortedValue[valueKey] = value[valueKey];
      }
      return sortedValue;
    }

    return value;
  }

  for (const test of report.results) {
    const json = JSON.stringify(test, replacer);

    let blobId = blobCache.get(json);

    if (!blobId) {
      const buffer = Buffer.from(json);
      blobId = await Git.Blob.createFromBuffer(repo, buffer, buffer.length);
      blobCache.set(json, blobId);
    }

    const path = test.test;
    // Complexity to handle /foo/bar/test.html?a/b, which can occur especially
    // with variants. decodeURIComponent needs to be used when reading.
    const queryStart = path.indexOf('?');
    const lastSlash = path.lastIndexOf('/', queryStart >= 0 ? queryStart : path.length);
    const dirname = path.substr(0, lastSlash);
    const filename = encodeURIComponent(path.substr(lastSlash + 1));

    const dirs = dirname.split('/').filter(d => d);

    const tree = await getTree(dirs);
    tree.builder.insert(`${filename}.json`, blobId, Git.TreeEntry.FILEMODE.BLOB);
  }

  const oid = await writeTree(rootTree);

  const signature = Git.Signature.now('autofoolip', 'auto@foolip.org');

  const commit = await repo.createCommit(null, signature, signature, commitMessage, oid, []);

  await repo.createLightweightTag(commit, tagName);
}

async function main() {
  // bare clone of https://github.com/stephenmcgruer/wpt-results
  const repo = await Git.Repository.init('wpt-results.git', 1);

  const maxRuns = flags.get('max-runs');
  const maxTime = flags.get('max-time');

  let totalRuns = 0;
  let writtenRuns = 0;
  const deadline = maxTime ? Date.now() + 1000 * maxTime : NaN;

  const products = ['chrome', 'edge', 'firefox', 'safari', 'webkitgtk'];
  for (const product of products) {
    let productRuns = 0;
    let stop = false;
    for await (const run of runs.getIterator({product})) {
      productRuns++;
      totalRuns++;
      // Skip runs of affected tests for PRs.
      if (run.labels.some(l => l === 'pr_base' || l === 'pr_head')) {
        continue;
      }
      const didWrite = await writeRunToGit(run, repo);
      if (didWrite) {
        writtenRuns++;
        if (maxRuns && writtenRuns >= maxRuns) {
          console.log(`Stopping because limit of ${maxRuns} runs was reached`);
          stop = true;
          break;
        }
      }
      if (maxTime && Date.now() >= deadline) {
        console.log(`Stopping because limit of ${maxTime} seconds was reached`);
        stop = true;
        break;
      }
    }
    console.log(`Iterated ${productRuns} ${product} runs`);
    if (stop) {
      break;
    }
  }
  console.log(`Iterated ${totalRuns} runs in total`);
}

main().catch(reason => {
  console.error(reason);
  process.exit(1);
});
