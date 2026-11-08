# Windows 11 setup and first GitHub publication

The first release is **v0.1.0-alpha.1**. The included demo does not require Docker, Python, Vite, TypeScript compilation or third-party packages.

## Install prerequisites

1. Install **Git for Windows** from https://git-scm.com/download/win.
2. Install **Node.js 22 LTS** (or newer supported Node LTS) from https://nodejs.org/.
3. Install **Visual Studio Code** from https://code.visualstudio.com/ (optional).
4. Open PowerShell and confirm `git --version`, `node --version` and `npm --version`.

## Using the downloaded release archive with an existing GitHub repository

The following assumes you've downloaded the ZIP release package and already have an empty or starter repository in an organization.

1. Copy your repository's exact HTTPS URL from GitHub → Code → HTTPS.
2. In PowerShell, navigate to your development folder and clone the repository:

```powershell
cd "$HOME\Documents"
git clone https://github.com/Starfire-Engine/starfire-engine.git
cd starfire-engine
```

3. Extract the archive into a separate folder (replace the path if your downloads are elsewhere):

```powershell
Expand-Archive "$HOME\Downloads\starfire-engine-v0.1.0-alpha.1.zip" "$HOME\Downloads\starfire-release" -Force
```

4. Copy the **contents** of the extracted project directory into the cloned repository:

```powershell
Get-ChildItem "$HOME\Downloads\starfire-release\starfire-engine-v0.1.0-alpha.1" -Force |
  Copy-Item -Destination . -Recurse -Force
```

If GitHub initialized the repo with a README or LICENSE, review conflicting files before overwriting them. Do not copy a nested `.git` folder (the archive has none).

5. Validate and launch:

```powershell
npm run ci
npm run dev
```

6. Visit http://localhost:5173 in Chrome or Edge. Move the mouse to rotate the scene; scroll to zoom. The telemetry pane should show the current renderer (WebGPU or WebGL 2). Press **Ctrl+C** to stop the server.

7. Push your first commit to the repository's current branch:

```powershell
git status
git add .
git commit -m "feat: publish Starfire Engine v0.1.0-alpha.1"
git push origin HEAD
```

If Git asks for identity, set `git config --global user.name "Your Name"` and `git config --global user.email "you@example.com"` (with your own values). Complete any interactive browser authentication prompted by Git Credential Manager. Never paste personal access tokens into this project.

8. Tag and publish a GitHub pre-release:

```powershell
git tag v0.1.0-alpha.1
git push origin v0.1.0-alpha.1
```

On GitHub → **Releases** → **Draft a new release**, select `v0.1.0-alpha.1`, title it **Starfire Engine v0.1.0-alpha.1**, check **Set as a pre-release**, and publish.

## Optional static demo hosting

GitHub repository → **Settings** → **Pages** → Build and deployment → **Deploy from a branch** → choose the default branch and `/ (root)` → Save. For a project repository, the URL is usually `https://starfire-engine.github.io/starfire-engine/` unless a custom domain is configured.

The demo uses relative ES module imports so a repository subpath works without a build step. Pages availability/policies depend on repository visibility and GitHub plan.

## Troubleshooting

- **WebGPU unavailable:** use Chrome/Edge with up-to-date GPU drivers or choose WebGL 2 from the demo dropdown.
- **No renderer available:** verify hardware acceleration is enabled, update the browser/graphics driver, and test a different computer.
- **Port in use:** PowerShell: `$env:PORT=5174; npm run dev`, then browse `http://localhost:5174`.
- **Demo doesn't load from disk:** always run `npm run dev`; `file://` cannot load this app reliably.
- **Git push rejected:** pull/rebase recent remote changes and resolve conflicts; never force-push to overwrite work.
