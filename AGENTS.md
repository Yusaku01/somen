# Somen repository guide

- `packages/core` contains the framework-independent Web Component and CLI. Keep Astro-specific code in `examples/astro-demo`.
- For release notes, version PRs, and publication timing, follow [.agents/skills/somen-release/SKILL.md](.agents/skills/somen-release/SKILL.md).
- Keep `README.md` and `packages/core/README.md` consistent with the commands and API in the source.
- Run the relevant checks after changes: `pnpm code:check`, `pnpm test`, `pnpm unused:check`, and `pnpm docs:check`. Build the Astro demo when it changes.
- Keep generated files and ignored local records out of Git. Do not publish the package or change its license without the user's direction.

## Pull requests

When asked to create or update a PR, use the repository's [somen-pr skill](.agents/skills/somen-pr/SKILL.md). Split changes by purpose, keep names concise, and explain the result for the user rather than narrating the diff. A PR request does not authorize merging normal changes.

## Code Review Rules

- Preserve the framework-independent core and safe server-side imports. Keep framework integrations in examples rather than introducing an Astro runtime dependency.
- Layout and CSS-only resizes must preserve a stopped diagram's requested playback state, SVG time, and existing rail/particle elements. Verify positions against the rendered paths rather than restarting animation to hide an error.
- Treat project data and authored labels as data. Preserve validation and escaping at JSON/HTML boundaries; do not allow exported labels or identifiers to become executable markup.

Submit findings for the current revision with enough evidence to reproduce them. If a complete code review finds no actionable issues, include `<!-- somen-code-review:pass -->` in the submitted review body. Do not include this marker for skipped, partial, unavailable, or failing reviews; it must never replace running the applicable checks or inspecting UI changes.
