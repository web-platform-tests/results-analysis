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

    it('should pick the gzip asset among the compressions published', () => {
      // Every manifest is published as .bz2, .gz and .zst, so matching on a
      // name or label prefix would take whichever came first, and only the
      // gzip one is what parseWebFeaturesManifest can gunzip. Asset list seen
      // on merge_pr_62355 with:
      //   gh api repos/web-platform-tests/wpt/releases/tags/merge_pr_62355
      const gzip = createAsset(
          'WEB_FEATURES_MANIFEST-abcdef.json.gz', MANIFEST_LABEL);
      const release = createRelease([
        createAsset('MANIFEST-abcdef.json.bz2', 'MANIFEST.json.bz2'),
        createAsset('MANIFEST-abcdef.json.gz', 'MANIFEST.json.gz'),
        createAsset('MANIFEST-abcdef.json.zst', 'MANIFEST.json.zst'),
        createAsset('WEB_FEATURES_MANIFEST-abcdef.json.bz2',
            'WEB_FEATURES_MANIFEST.json.bz2'),
        gzip,
        createAsset('WEB_FEATURES_MANIFEST-abcdef.json.zst',
            'WEB_FEATURES_MANIFEST.json.zst'),
      ]);

      assert.strictEqual(runs.findWebFeaturesManifestAsset(release), gzip);
    });
  });

  describe('parseWptTagMap', () => {
    it('should map each commit to its tag', () => {
      const output = [
        '5ec18b17503524523ff6fe6a6b801512d659a6e5\trefs/tags/merge_pr_57790',
        '92e4771f00d1ae92e94abf4754249c227252293e\trefs/tags/merge_pr_57791',
      ].join('\n');

      assert.deepEqual(runs.parseWptTagMap(output), new Map([
        ['5ec18b17503524523ff6fe6a6b801512d659a6e5', 'merge_pr_57790'],
        ['92e4771f00d1ae92e94abf4754249c227252293e', 'merge_pr_57791'],
      ]));
    });

    it('should key an annotated tag on the peeled commit, not the tag object',
        () => {
          // ls-remote prints the tag object under refs/tags/X and the commit it
          // points at under refs/tags/X^{}. Keying on the first would map a
          // revision no run is ever on, silently skipping every date.
          const output = [
            'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\t' +
                'refs/tags/merge_pr_57791',
            '92e4771f00d1ae92e94abf4754249c227252293e\t' +
                'refs/tags/merge_pr_57791^{}',
          ].join('\n');

          assert.deepEqual(runs.parseWptTagMap(output), new Map([
            ['92e4771f00d1ae92e94abf4754249c227252293e', 'merge_pr_57791'],
          ]));
        });

    it('should ignore refs that are not merge_pr tags', () => {
      const output = [
        '0000000000000000000000000000000000000001\trefs/tags/epochs/daily',
        '92e4771f00d1ae92e94abf4754249c227252293e\trefs/tags/merge_pr_57791',
      ].join('\n');

      assert.deepEqual(runs.parseWptTagMap(output), new Map([
        ['92e4771f00d1ae92e94abf4754249c227252293e', 'merge_pr_57791'],
      ]));
    });

    it('should return an empty map for no output', () => {
      assert.deepEqual(runs.parseWptTagMap(''), new Map());
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
