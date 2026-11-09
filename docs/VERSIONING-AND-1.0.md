# Versioning Policy and 1.0.0 Release Gate

**Decision: Every `0.x.0` is a major functional leap. Smaller work is `0.x.y`.**

Starfire Engine must become a general-purpose web game development platform. A 1.0 release cannot be justified by the renderer alone. Its scope is **making and releasing a complete game** using publicly available tools.

## Acceptance criteria for every minor capability milestone (`0.x.0`)

1. A documented developer-facing capability bundle, not just one isolated class.
2. A new runnable sample showing an end-to-end workflow using those capabilities.
3. Automated unit/integration tests; graphics features require real-browser GPU validation.
4. Clear upgrade, compatibility and known-limitations notes, including migration when breaking changes are necessary (pre-1.0 APIs remain unstable).
5. A measurable baseline, release notes, and reviewable source history.
6. No private or game-specific proprietary code, scenes, assets, or configuration in the public engine.

## Patch and prerelease use

`0.2.1`: a stable 0.2.0 follow-up for a culling bug, memory leak or small API addition.
`0.2.0-alpha.1`: explicitly experimental first prerelease for 0.2.0, not a stability claim.
`0.3.0`: a substantively new integrated game-runtime workflow.

## Stable 1.0.0 must include

- **Editor**: create/manage projects, scene viewport, entity hierarchy, inspector, asset browser, property editing, transform handles, save and reload, and undo/redo.
- **Gameplay**: predictable simulation time, input actions, collisions/physics, animation, audio, scripts, interactive UI, and common game-state handling.
- **Assets**: model/texture/audio imports with diagnostics, project packaging, asset reuse, and dependency tracking.
- **Debugging**: logging, scene inspection, performance/profiler views, graphics diagnostics, reproducible bug reports and meaningful errors.
- **Build/export**: produce standalone playable web projects with documented builds, deployment, cache handling, and source maps where applicable.
- **SDK**: documented API, tutorials, templates, example projects, API compatibility policy and changelog/migration guidance.
- **Quality**: browser/OS/GPU support matrix, accessibility basics, security process, automated tests, representative benchmarks and stability criteria.
- **Acceptance project**: a complete sample game conceived, built, debugged, tested, packaged and published using **only the public Starfire Engine developer tools** (other external creative tools such as Blender are fine for art production).

The sample must run on supported browser/hardware combinations without unpublished plugins or manual source hacks. Test crashes, corrupted assets, save/load fidelity, packaging reproducibility and documentation from a first-time developer perspective.

**Not required for every 1.0 project:** authoritative multiplayer servers, AAA ray tracing, universal console export, full non-web native builds, or a comprehensive game-specific asset marketplace. Those are separate later commitments.

## Engineering release gates

- No known release-blocking startup, data-loss, security or critical rendering defects.
- Source, runtime, editor, sample game and build pipeline tested together.
- Concrete cross-browser GPU results, not CI-only claims.
- Performance targets published for named reference scenes and hardware, with measured variance and no invented metrics.
- Documentation and public examples verified as new users would follow them.
- Project creates, saves, closes, reopens and exports correctly.

There are no automatic dates for major capability upgrades. A version ships only after its gates are satisfied.
