# CI/CD Plan

## Release workflow

1. Develop on a feature branch.
2. If a package should be released, bump that package version before opening/merging the PR:
   ```bash
   npm version patch --workspace autk-map --no-git-tag-version
   npm version minor --workspace autk-map --no-git-tag-version
   npm version major --workspace autk-map --no-git-tag-version
   ```
3. Open a PR to `main`.
4. CI runs lint, typecheck, build, and the stable Playwright subset.
5. After the PR is merged, the publish workflow runs only after CI succeeds on `main`.
6. The publish workflow publishes package versions that do not already exist on npm and creates tags like `autk-map@1.3.1`.

## Packages published by CD

- `autk-map`
- `autk-db`
- `autk-plot`
- `autk-compute`
- `autk`

## Playwright rollout

Only one visual test is required in CI for now:

```bash
make test-stable
# runs tests/gallery/autk-map/colormap-categorical.test.ts
```

CI validates committed screenshots/HAR files. It does not generate or commit new baselines.

For local baseline updates:

```bash
make test-update APP=gallery OPEN=/src/autk-map/colormap-categorical.html images
make test-update APP=gallery OPEN=/src/autk-map/some-osm-example.html cache images
```

Commit updated `.png` and `.har` files with the code change.

## GitHub secrets

Required repository secret:

- `NPM_TOKEN`: npm automation token with publish permission.

## Implemented workflows

- `.github/workflows/ci.yml`: runs on PRs and pushes to `main`.
- `.github/workflows/publish.yml`: runs after successful CI on `main` and publishes new package versions.
