'use strict';

const assert = require('chai').assert;
const zlib = require('zlib');

const runs = require('../lib/runs');

const MANIFEST_LABEL = 'WEB_FEATURES_MANIFEST.json.gz';

// Builds a release asset as returned by the GitHub releases API.
function createAsset(name, label) {
  return {
    'name': name,
    'label': label,
    'browser_download_url': `https://example.com/${name}`,
  };
}

// Builds a release payload as returned by the GitHub releases API.
function createRelease(assets) {
  return {'tag_name': 'merge_pr_12345', 'assets': assets};
}

// Builds a gzipped manifest, as published on a wpt release.
function createManifest(version, data) {
  return zlib.gzipSync(JSON.stringify({version, data}));
}

describe('runs.js', () => {
  describe('findWebFeaturesManifestAsset', () => {
    it('should find the asset with the manifest label', () => {
      const asset = createAsset(
          'WEB_FEATURES_MANIFEST_abcdef.json.gz', MANIFEST_LABEL);
      const release = createRelease([
        createAsset('MANIFEST-abcdef.json.gz', 'MANIFEST.json.gz'),
        asset,
      ]);

      assert.strictEqual(runs.findWebFeaturesManifestAsset(release), asset);
    });

    it('should match on the label rather than the name', () => {
      // The asset that is named like the manifest is not the labeled one, so
      // matching on the name would pick the wrong asset.
      const asset = createAsset(
          'WEB_FEATURES_MANIFEST_abcdef.json.gz', MANIFEST_LABEL);
      const release = createRelease([
        createAsset(MANIFEST_LABEL, 'SOMETHING_ELSE.json.gz'),
        asset,
      ]);

      assert.strictEqual(runs.findWebFeaturesManifestAsset(release), asset);
    });

    it('should throw if no asset has the manifest label', () => {
      const release = createRelease([
        createAsset('MANIFEST-abcdef.json.gz', 'MANIFEST.json.gz'),
      ]);

      assert.throws(() => {
        runs.findWebFeaturesManifestAsset(release);
      }, /No WEB_FEATURES_MANIFEST\.json\.gz asset on merge_pr_12345/);
    });

    it('should throw if the release has no assets', () => {
      const release = createRelease([]);

      assert.throws(() => {
        runs.findWebFeaturesManifestAsset(release);
      }, /No WEB_FEATURES_MANIFEST\.json\.gz asset on merge_pr_12345/);
    });
  });

  describe('parseWebFeaturesManifest', () => {
    it('should map each feature to its set of tests', () => {
      const manifest = createManifest(1, {
        'grid': ['/css/css-grid/a.html', '/css/css-grid/b.html'],
        'anchor-positioning': ['/css/css-anchor-position/c.html'],
      });

      const featureTests = runs.parseWebFeaturesManifest(manifest);

      assert.deepEqual(featureTests, new Map([
        ['grid', new Set(['/css/css-grid/a.html', '/css/css-grid/b.html'])],
        ['anchor-positioning', new Set(['/css/css-anchor-position/c.html'])],
      ]));
    });

    it('should treat duplicate tests in a feature as one', () => {
      const manifest = createManifest(1, {
        'grid': ['/css/css-grid/a.html', '/css/css-grid/a.html'],
      });

      const featureTests = runs.parseWebFeaturesManifest(manifest);

      assert.deepEqual(featureTests, new Map([
        ['grid', new Set(['/css/css-grid/a.html'])],
      ]));
    });

    it('should return an empty map for a manifest with no features', () => {
      const featureTests = runs.parseWebFeaturesManifest(createManifest(1, {}));

      assert.deepEqual(featureTests, new Map());
    });

    it('should throw for an unknown manifest version', () => {
      const manifest = createManifest(2, {'grid': ['/css/css-grid/a.html']});

      assert.throws(() => {
        runs.parseWebFeaturesManifest(manifest);
      }, /Unknown web features manifest version 2/);
    });

    it('should throw for a manifest with no version', () => {
      const manifest = zlib.gzipSync(JSON.stringify({data: {}}));

      assert.throws(() => {
        runs.parseWebFeaturesManifest(manifest);
      }, /Unknown web features manifest version undefined/);
    });
  });
});
