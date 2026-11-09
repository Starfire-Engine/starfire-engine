# Starfire Engine v0.2.0 — GitHub Release Procedure

## Status and responsibilities

This document prepares a **public GitHub release**; it does not mean a release exists yet.

- `development` contains completed PR 01–07 code; `main` currently hosts the v0.1.0 alpha source.
- The release-preparation patch sets version **`0.2.0-rc.1`**, not `0.2.0`.
- **Do not use the final `v0.2.0` tag until the hardware/browser release gate passes.** Never move or overwrite the published v0.1.0 tag.
- GitHub release publication and branch/merge writes must be performed by an authorized repository maintainer.
- A GitHub release does **not** publish the package to npm. npm publishing is a separate explicit decision and requires registry ownership.

## 1. Review the release-preparation branch

From a clone of the public repository on Windows:

```powershell
git switch development
git pull --ff-only origin development
git switch -c release/v0.2.0-rc1
# Extract the release-preparation ZIP into this repository, preserving its folder structure.
npm run release:check
npm run dev
```

Manually test both `?renderer=webgpu` and `?renderer=webgl2` with [the browser matrix](V0.2.0-BROWSER-VALIDATION.md). Check syntax/test CI, GLB assets, 256-instance toggle, shadow toggle, exposure, resize, scene reload, console errors, resource diagnostics, and benchmark stability.

Then stage and push this release-preparation branch:

```powershell
git add package.json README.md CHANGELOG.md index.html .github/workflows/ci.yml scripts/release-check.mjs docs/RELEASE.md docs/V0.2.0-BROWSER-VALIDATION.md docs/V0.2.0-RELEASE-NOTES.md

git commit -m "chore(release): prepare Starfire Engine 0.2.0 release candidate"
git push -u origin release/v0.2.0-rc1
```

Open a pull request against `development`; review diff and verify CI. Merge after review.

## 2. Publish the release candidate (optional, recommended)

When the RC code is on `development` and its CI passes, create an annotated tag on the exact tested commit:

```powershell
git switch development
git pull --ff-only origin development
npm run release:check
git tag -a v0.2.0-rc.1 -m "Starfire Engine v0.2.0 release candidate 1"
git push origin v0.2.0-rc.1
```

In GitHub → **Releases → Draft a new release**, select `v0.2.0-rc.1`, title `Starfire Engine v0.2.0-rc.1`, check **Set as a pre-release**, and paste the **RC notes** from [V0.2.0-RELEASE-NOTES.md](V0.2.0-RELEASE-NOTES.md). Attach the locally packed `.tgz` if desired, or the CI release artifact if available; GitHub automatically provides tagged source archives.

An RC is public but **not** the final v0.2.0 release.

## 3. Promote to final v0.2.0

Only after all release gates in [V0.2.0-BROWSER-VALIDATION.md](V0.2.0-BROWSER-VALIDATION.md) pass and there are no known critical regressions:

1. On `development`, change `package.json` version from `0.2.0-rc.1` to `0.2.0` and update the README banner, demo version display, and changelog heading from RC to final. Keep known limitations honest.
2. Run `npm run release:check`, verify the final npm pack name `starfire-engine-0.2.0.tgz`, and test the demo on real browsers.
3. Commit, push and merge the tested `development` changes into `main` via a reviewed PR (do not force-push).
4. On the resulting `main` commit, run `npm run release:check` again. Verify `git status` is clean and `package.json` says `0.2.0`.
5. Create and push an **annotated** `v0.2.0` tag **on `main`**, using the commands below.
6. In GitHub → **Releases**, create a new release selecting `v0.2.0`, title `Starfire Engine v0.2.0 — Rendering & Asset Foundation`, and use the final release notes. Do **not** mark it a pre-release unless unresolved acceptance criteria require it.

```powershell
git switch main
git pull --ff-only origin main
npm run release:check
git status --short
git tag -a v0.2.0 -m "Starfire Engine v0.2.0 — Rendering & Asset Foundation"
git push origin v0.2.0
```

**Important:** only run the tagging commands once the exact tested `main` commit contains the complete 0.2.0 code and release metadata. Do not tag an old `main` commit.

## 4. Verify the public release

- `https://github.com/Starfire-Engine/starfire-engine/releases/tag/v0.2.0` opens and lists the correct date, tag and source code.
- The release tag resolves to the tested `main` commit.
- GitHub Actions for the tag succeeds and produces the expected package artifact.
- `npm run dev` and the README imports work from a fresh clone of the tag.
- There is no unrelated private application content in the tag, source ZIP or npm archive.
- Announce the release only **after** the GitHub release is live and verified.

For release regressions after publication, use `0.2.1`; do not rewrite the `v0.2.0` tag.
