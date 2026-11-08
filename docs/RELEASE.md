# Publishing the first GitHub release

1. Create or use your existing **public** GitHub organization repository.
2. Add these source files to that repository; ensure any existing README content has been reviewed before overwriting it.
3. Run `npm run ci` and `npm run dev` locally.
4. Commit and push to the repository's default branch.
5. Create the tag: `git tag v0.1.0-alpha.1` and push it: `git push origin v0.1.0-alpha.1`.
6. GitHub → repository → **Releases** → **Draft a new release** → select the tag → title `Starfire Engine v0.1.0-alpha.1` → enable **Set as a pre-release** → publish.
7. Optionally enable GitHub Pages from `main` / root for the no-build demo; the site uses only static modules and does not require an Actions artifact.

CI executes syntax checks and unit tests. It does not currently perform automated cross-browser or GPU validation.
