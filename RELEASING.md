# Releasing @nomercy-entertainment/nomercy-music-player

## Beta publish (current)

Published under the `beta` dist-tag via `publishConfig.tag: "beta"`. Install the beta:

```
npm install @nomercy-entertainment/nomercy-music-player@beta
```

A plain `npm install @nomercy-entertainment/nomercy-music-player` resolves nothing until a
stable version is published under `latest`.

## Stable 2.0.0 flip checklist

See `packages/nomercy-player-kit/RELEASING.md` for the full trio checklist. Steps specific
to this package:

1. Bump version to `2.0.0` in `package.json`.
2. Remove `"tag": "beta"` from `publishConfig`, or publish with `npm publish --tag latest`.
3. The `@nomercy-entertainment/nomercy-player-core` range `^2.0.0-beta.0` already matches
   `2.0.0` stable — no range change is required. Updating it to `^2.0.0` is conventional
   but not mechanical.
4. Add a `[2.0.0]` entry to `CHANGELOG.md` summarizing changes since the last beta.

## IMPORTANT: release.yml fires on any branch push

The `release.yml` workflow in this repo has no branch filter — pushing any commit that
touches `src/` or `package.json` will trigger Create Release → npm publish. When pushing
packaging-only changes on a non-master branch, use `[skip ci]` in the commit message to
prevent an accidental publish.
