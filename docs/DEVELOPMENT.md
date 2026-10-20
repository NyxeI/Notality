# Development

## Setup

```bash
npm install
npm run dev     # esbuild watch → main.js
npm test        # node --test (Node 24+, runs TypeScript directly)
npm run build   # type check + production bundle
```

Link the repository into a test vault and enable the plugin:

```bash
ln -s /path/to/obsidian-themen-notes <vault>/.obsidian/plugins/themen-notes
```

Use a **copy** of your vault for testing, never the real one. Remove any git remote and disable sync plugins in the copy.

## Tests

- Test files: `tests/*.test.ts`, `node:test` + `node:assert/strict`.
- `tests/support/register.ts` redirects `import "obsidian"` to `tests/support/fake-obsidian.ts`; `tests/support/yaml.ts` replaces `parseYaml`/`stringifyYaml`.
- Keep decisions in pure modules so they can be tested. Modules imported by tests must not use TypeScript constructor parameter properties (Node's type stripping does not support them).

## Checking in Obsidian

With the [Obsidian CLI](https://help.obsidian.md/cli):

```bash
obsidian vault=<Vault> plugin:reload id=themen-notes
obsidian vault=<Vault> dev:errors
obsidian vault=<Vault> eval code='app.plugins.plugins["themen-notes"].hubPlan().then(m => console.log(m.size))'
```

- `eval` gives up after about 3 seconds: start async work, store the result on `window`, read it with a second call.
- Bases only render embeds in a visible window; base tables also skip columns outside the visible width.

## Release

1. Add a `## x.y.z` entry to `CHANGELOG.md` and commit.
2. `npm version patch` (or `minor`) – updates `manifest.json` and `versions.json` and tags the commit.
3. `git push origin main <x.y.z>`.
4. `.github/workflows/release.yml` tests, builds and publishes a GitHub release with `main.js`, `manifest.json` and `styles.css`; BRAT installs from there.
