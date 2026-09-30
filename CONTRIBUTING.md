# Contributing to Somen

Thanks for helping improve Somen. Before starting a large change, open an issue to discuss the use case and scope.

## Local setup

Use Node.js `24.13.0` and pnpm `12.3.4`. The versions are recorded in `.node-version` and `package.json`.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Use `pnpm build` to build the core package and `pnpm code:format` to format its source files.

Keep framework-independent code in `packages/core` and Astro-specific examples in `examples/astro-demo`. Add or update documentation when changing the public API.

Before opening a pull request, run:

```sh
pnpm code:check
pnpm test
pnpm unused:check
pnpm docs:check
pnpm --dir examples/astro-demo build
```

## Releases

Maintainers update the version in `packages/core/package.json` and commit it to `main`. Pushing a tag named `v` followed by that exact version starts the release workflow. It runs the checks, publishes `somenflow` to npm using Trusted Publishing, and creates a GitHub Release after publication succeeds. Prerelease versions use their prerelease identifier as the npm dist-tag; stable versions use `latest`.

The npm package settings must trust the GitHub Actions workflow `.github/workflows/release.yml` for the `Yusaku01/somen` repository and allow direct `npm publish`.
