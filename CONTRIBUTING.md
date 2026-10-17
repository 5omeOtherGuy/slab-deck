# Contributing to slab-deck

Thanks for helping. slab-deck is in `pre-release`: issues and pull requests are triaged on a best-effort basis.

- Small fixes (a bug, a typo, a doc gap) are welcome directly as a pull request.
- Larger changes, such as a new deck section, a new setting or a change to the providers JSON shape, start
  with an [issue](https://github.com/5omeOtherGuy/slab-deck/issues/new/choose) so we can agree on the approach first.
- Security problems go through [SECURITY.md](SECURITY.md), never a public issue.

## Making a change

You need Node.js, `jq`, `shellcheck` and `git`.

```sh
npm ci
git config core.hooksPath .githooks   # every push runs the gate first
scripts/gate
```

The gate must pass: it runs shellcheck, `claude plugin validate`, the mod's tests, the statusline tests and a
secret scan, all without credentials or network. Focused runs: `tests/statusline.sh`, and
`node_modules/.bin/claude plugin test mod/slab-deck`.

- One concern per pull request; the title follows [Conventional Commits](https://www.conventionalcommits.org/)
  (`fix(statusline): …`, `feat(deck): …`, `docs: …`).
- Say what changed, why, and how you verified it; add `Fixes #n` when it resolves an issue.
- Keep to the SLAB design rules in the README: hue only on glyphs and outcome markers, no box drawing.
- Pull requests are squash-merged. You stay the author and are credited in `CHANGELOG.md`.

## Licence

Contributions are licensed under this repository's [MIT licence](LICENSE). There is no CLA.
