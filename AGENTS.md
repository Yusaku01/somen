# Somen repository guide

- `packages/core` contains the framework-independent Web Component and CLI. Keep Astro-specific code in `examples/astro-demo`.
- Keep `README.md` and `packages/core/README.md` consistent with the commands and API in the source.
- Run the relevant checks after changes: `pnpm code:check`, `pnpm test`, `pnpm unused:check`, and `pnpm docs:check`. Build the Astro demo when it changes.
- Keep generated files and ignored local records out of Git. Do not publish the package or change its license without the user's direction.
