'use strict';

const fetch = require('node-fetch');
const Git = require('nodegit');
const runs = require('./lib/runs');

async function writeRunToGit(run, repo) {
  const tagName = `results/${run.id}`;
  try {
    await repo.getReference(`refs/tags/${tagName}`);
    console.log(`Tag ${tagName} already exists, skipping run`);
    return;
  } catch (e) {}

  const reportURL = run.raw_results_url;
  console.log(`Fetching ${reportURL}`);
  const report = await (await fetch(reportURL)).json();
  await writeReportToGit(report, repo, tagName);
  console.log(`Wrote ${tagName}`);
  return tagName;
}

async function writeReportToGit(report, repo, tagName) {
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

  function replacer(key, value) {
    if (isJSONObject(this)) {
      // The keys that can appear for objects are:
      // ["duration", "expected", "message", "name", "status", "subtests", "test"]
      // Filter out:
      //  - "duration" which is different for every run
      //  - "expected" which will always be "PASS" or "OK" for wpt.fyi runs
      //  - "test" which is the test name, and will be represented elsewhere
      if (key === "duration" || key === "expected" || key === "test") {
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
    // Complexity to handle /foo/bar/test.html?a/b, which isn't a test name
    // pattern used by any test, but also not prohibited by anything.
    const queryStart = path.indexOf('?');
    const lastSlash = path.lastIndexOf('/', queryStart >= 0 ? queryStart : path.length);
    const dirname = path.substr(0, lastSlash);
    const filename = path.substr(lastSlash + 1);

    const dirs = dirname.split('/').filter(d => d);

    const tree = await getTree(dirs);
    tree.builder.insert(`${filename}.json`, blobId, Git.TreeEntry.FILEMODE.BLOB);
  }

  const oid = await writeTree(rootTree);

  const signature = Git.Signature.now('autofoolip', 'auto@foolip.org');

  const commit = await repo.createCommit(null, signature, signature, 'commit message', oid, []);

  await repo.createLightweightTag(commit, tagName);
}

async function main() {
  // bare clone of https://github.com/foolip/wpt-results
  const repo = await Git.Repository.init('wpt-results.git', 1);

  for await (const run of runs.getIterator({label: 'master'})) {
    await writeRunToGit(run, repo);
  }

  // TODO: push runs to GitHub
}

main();
