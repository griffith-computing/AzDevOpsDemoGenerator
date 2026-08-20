# Build and deploy the Azure DevOps extension

This guide builds the Template Projects extension and installs it privately in a disposable Azure DevOps organization for acceptance testing.

The recommended test path is a private VSIX uploaded through the Visual Studio Marketplace publisher portal. An optional local-development path is included for teams that need hot reload.

## Prerequisites

You need:

- Node.js 24 or later and npm.
- Access to this repository.
- A disposable Azure DevOps Services organization.
- Organization Owner or Project Collection Administrator access in the test organization.
- A [Visual Studio Marketplace publisher](https://marketplace.visualstudio.com/manage/publishers) that you control.
- Permission to upload extensions for that publisher and share them with the test organization.

The extension requests organization-wide scopes for projects, graph, work tracking, repositories, builds, releases, service endpoints, variable groups, deployment groups, tests, and wikis. Review the scopes in `extension/vss-extension.json` before installation.

## 1. Configure the package identity

Open `extension/vss-extension.json` and check:

- `publisher` exactly matches your Marketplace publisher ID.
- `id` is stable. Use a separate ID such as `template-projects-dev` for a development-only listing.
- `version` is higher than every version previously uploaded for the same publisher and extension ID.
- `public` remains `false`.

Publisher IDs and extension IDs become part of the extension identity. Do not upload a package under a publisher you do not control.

## 2. Build and package locally

From the repository root, run:

```powershell
Set-Location extension
npm ci
npm run lint
npm test
npm run package
```

`npm run package`:

1. Validates and generates the 64-template catalog.
2. Builds the TypeScript/React application into `extension/dist`.
3. Copies template content to VSIX-safe asset paths.
4. Creates the private VSIX under `extension/packages`.

Inspect the artifact:

```powershell
$vsix = Get-ChildItem .\packages\*.vsix |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1

$vsix | Select-Object FullName, Length, LastWriteTime
Get-FileHash -Path $vsix.FullName -Algorithm SHA256
```

Record the version and SHA-256 with the test results.

### Build through GitHub Actions

The `Build Azure DevOps Extension` workflow runs linting, tests, and packaging. Its artifact is named `azure-devops-template-projects-vsix`.

Trigger the workflow from the Actions tab, or download a completed run with GitHub CLI:

```powershell
gh run list --workflow azure-devops-extension.yml
gh run download <run-id> --name azure-devops-template-projects-vsix
```

## 3. Create a GitHub Release

The `Release Azure DevOps Extension` workflow creates a GitHub Release when a strict semantic version tag such as `v0.2.0` is pushed.

The workflow:

1. Requires the tagged commit to be reachable from `main`.
2. Requires the tag version to match `extension/vss-extension.json`, `extension/package.json`, and `extension/package-lock.json`.
3. Runs dependency installation, linting, tests, and VSIX packaging.
4. Generates a SHA-256 checksum.
5. Creates release notes from repository history.
6. Attaches the VSIX and checksum to the GitHub Release.
7. Retains the same files as an Actions artifact for 30 days.

It does not publish to Visual Studio Marketplace.

### Prepare a release

Choose the next version without the `v` prefix. From the repository root:

```powershell
Set-Location extension
npm version 0.2.0 --no-git-tag-version
```

This updates `extension/package.json` and `extension/package-lock.json`. Set the same version in `extension/vss-extension.json`:

```json
{
  "version": "0.2.0"
}
```

Commit these version changes through the normal pull-request process and merge them to `main`.

### Tag the merged commit

Update local `main` and confirm that all three committed version values match the intended tag:

```powershell
git switch main
git pull --ff-only origin main

@'
const fs = require("node:fs")
const read = path => JSON.parse(fs.readFileSync(path, "utf8"))
const lock = read("extension/package-lock.json")
console.log("manifest", read("extension/vss-extension.json").version)
console.log("package", read("extension/package.json").version)
console.log("lockfile", lock.version)
console.log("lock root", lock.packages[""].version)
'@ | node
```

All four values must print `0.2.0` before creating `v0.2.0`.

Create an annotated tag and push the tag ref explicitly:

```powershell
git tag -a v0.2.0 -m "Release v0.2.0"
git push origin refs/tags/v0.2.0
```

A successful push reports a new tag. Confirm that GitHub received it:

```powershell
git ls-remote --exit-code --tags origin refs/tags/v0.2.0
gh run list --workflow release-extension.yml --limit 5
```

The pushed tag starts `.github/workflows/release-extension.yml`. Follow the run under **Actions** > **Release Azure DevOps Extension**.

When it succeeds:

- The repository **Releases** page contains `Template Projects v0.2.0`.
- The release contains the VSIX and `<vsix-name>.sha256`.
- The workflow run contains an artifact named `azure-devops-template-projects-v0.2.0`.

Verify a downloaded release artifact on PowerShell:

```powershell
Get-FileHash .\<vsix-name>.vsix -Algorithm SHA256
Get-Content .\<vsix-name>.vsix.sha256
```

The computed hash must match the first value in the checksum file.

### Release workflow failures

| Failure | Resolution |
| --- | --- |
| No workflow run appears | Run `git ls-remote --tags origin refs/tags/<tag>`. If it returns nothing, the tag was not pushed to this repository. Push the explicit `refs/tags/<tag>` ref and check the push output. |
| Tag syntax is rejected | Use exactly `vMAJOR.MINOR.PATCH`, for example `v0.2.0`. Prerelease suffixes are not enabled. |
| Tagged commit is not on `main` | Merge the release commit, delete the incorrect remote tag, then tag the merged commit. |
| Version mismatch | Update the manifest, package, and lockfile to the tag version, merge, and create a new tag. Do not move a published release tag. |
| GitHub Release already exists | Use the existing release or create a new patch version. The workflow intentionally does not overwrite releases. |
| Release creation returns 403 | Confirm repository or organization Actions policy allows workflows to request `contents: write`. |
| Lint, tests, or packaging fail | Fix the failure through a pull request, increment the version if necessary, and create a new tag from `main`. |
| Release assets are missing | Download the Actions artifact for diagnostics and inspect the package/checksum step. |

Marketplace upload remains a separate step. Use the VSIX attached to the GitHub Release for the private Marketplace workflow below after its checksum and acceptance results are approved.

## 4. Upload the private extension

The publisher portal avoids putting a publishing token in a shell command.

1. Open the [Visual Studio Marketplace publisher portal](https://marketplace.visualstudio.com/manage/publishers).
2. Select the publisher whose ID matches the manifest.
3. Choose the option to add a new Azure DevOps extension and upload the generated VSIX.
4. Wait for Marketplace validation to complete.
5. Keep the listing private.

For an update, upload the new VSIX to the existing listing. If Marketplace reports that the version already exists, increment `version` in `extension/vss-extension.json`, rebuild, and upload again.

### Optional command-line publishing

The repository includes `tfx-cli` as a development dependency. Microsoft recommends Microsoft Entra authentication; a PAT with **Marketplace (publish)** scope is still supported where organizational policy permits it. Avoid embedding tokens in scripts, command history, logs, or repository files.

From `extension`:

```powershell
npx tfx extension publish `
  --publisher <publisher-id> `
  --vsix .\packages\<publisher-id>.template-projects-<version>.vsix `
  --share-with <test-organization>
```

Enter authentication interactively when prompted. See [Publish an Azure DevOps extension from the command line](https://learn.microsoft.com/en-us/azure/devops/extend/publish/command-line).

## 5. Share with the test organization

Private extensions must be shared before an organization can install them.

1. In the publisher portal, open the private extension.
2. Open **Share/Unshare**.
3. Enter the Azure DevOps organization name, not its full URL.
4. Confirm that the organization appears in the shared list.

Only share the extension with controlled test organizations until acceptance testing is complete.

## 6. Install in Azure DevOps

Sign in as an organization administrator:

1. Open `https://dev.azure.com/<test-organization>`.
2. Go to **Organization settings** > **Extensions**.
3. Open the **Shared** tab.
4. Select **Template Projects** and choose **Install**.
5. Review and approve the requested scopes.
6. Refresh Azure DevOps after installation.

The extension contributes **Template projects** to the organization-settings navigation. It does not appear as a project-level hub.

If the extension is absent from **Shared**, verify the organization spelling in the Marketplace share list and confirm that the signed-in account can install extensions.

## 7. Prepare the test organization

Before provisioning:

- Use an organization that does not contain production data.
- Confirm the tester can create projects and teams.
- Accept the licenses for any Marketplace extensions required by the selected template.
- Confirm required agent queues exist. Several legacy templates reference queue names such as `Azure Pipelines` or older hosted-image names.
- Prepare credentials and URLs for service connections requested by the extension UI.
- Decide who will delete generated projects and when.

The extension keeps the Azure DevOps token and entered service-connection values in browser memory only. Keep the extension page open until provisioning finishes.

## 8. Run the acceptance matrix

Use unique project names for each run.

| Template | Coverage focus |
| --- | --- |
| `Gen-eShopOnWeb` | Teams, boards, repositories, endpoint, work items, tests, build/release, delivery plan, branch policy, dashboard |
| `Gen-PartsUnlimited` | Pull requests, test plans, and legacy dashboard helper compatibility |
| `DL-Docker` | Legacy dashboard build, release, and repository tokens |
| `FA-IAC-migration` | Variable groups |
| `CAF-AzureGovernance` | Teams and work items without pipeline-heavy extras |

For every run, verify:

- The project reaches the `wellFormed` state.
- Each progress step succeeds or is explicitly skipped.
- Teams, iterations, repositories, work items, queries, dashboards, and pipelines match the chosen template.
- Created JSON definitions contain no unresolved `$token$` placeholders.
- Service connections contain the expected URL and authorization scheme.
- The page reports an actionable error when a required permission, queue, extension, or credential is missing.
- Cancelling or navigating away does not report success. Resources created before cancellation are identified for cleanup.

Record the extension version, VSIX SHA-256, organization, project names, tester, date, and failures.

## 9. Update an installed test extension

1. Increment `version` in `extension/vss-extension.json`.
2. Repeat the lint, test, and package commands.
3. Upload the VSIX to the same Marketplace listing.
4. Keep the extension shared with the test organization.
5. Verify the installed version under **Organization settings** > **Extensions**.
6. Refresh the browser before retesting.

Manifest changes always require republishing. Code changes also require a new package unless the optional local-development setup below is active.

## Optional local development

The repository has a Vite development command, but local Azure DevOps loading is **not turnkey**. Azure DevOps loads extension content in an iframe and requires an HTTPS URL. The repository does not currently commit an HTTPS certificate setup or development-manifest override.

Use the private VSIX workflow unless you specifically need hot reload.

### Development manifest

Create a temporary, uncommitted override such as `extension/dev.json`:

```json
{
  "id": "template-projects-dev",
  "name": "Template Projects (Development)",
  "public": false,
  "baseUri": "https://localhost:3000"
}
```

Use a unique ID so the development and packaged-test listings can be installed independently.

Package or publish the development listing with the override:

```powershell
Set-Location extension
npm ci
npm run build

npx tfx extension publish `
  --manifest-globs vss-extension.json `
  --overrides-file dev.json `
  --share-with <test-organization>
```

Install the resulting development extension from the organization's **Shared** extensions.

### HTTPS development server

Configure a trusted local certificate and an HTTPS Vite server at the same `baseUri`. The server must make the contribution path available at:

```text
https://localhost:3000/dist/index.html
```

Then start the development server and verify that URL directly in the same browser before opening Azure DevOps:

```powershell
npm run dev -- --host localhost --port 3000
```

The current `vite.config.ts` does not enable HTTPS or explicitly map `/dist/index.html`. Add those settings in a temporary local Vite configuration or adopt Microsoft's [Azure DevOps Extension Hot Reload and Debug](https://github.com/microsoft/azure-devops-extension-hot-reload-and-debug) setup before expecting this command to work inside Azure DevOps.

Do not commit private certificate material, publisher credentials, organization names, tokens, or machine-specific paths.

The Marketplace manifest is cached separately from local content. Republish the development extension whenever its manifest, contribution, scopes, or extension identity changes. Ordinary source changes can hot reload once the HTTPS development server is correctly configured.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Marketplace rejects the VSIX | Confirm `publisher` matches the selected publisher and `version` is new. Rebuild after every manifest edit. |
| Extension is not in **Shared** | Recheck the exact organization name in **Share/Unshare** and the signed-in tenant/account. |
| Installation is denied | Use an Organization Owner or delegated extension administrator and review extension-management permissions. |
| **Template projects** is missing | Confirm installation completed, refresh Azure DevOps, and look under Organization settings rather than inside a project. |
| Hub is blank in local development | Open the HTTPS `baseUri` directly, trust the certificate, confirm `/dist/index.html` resolves, and inspect browser mixed-content/CSP errors. |
| Project creation returns 401/403 | Confirm the user can create projects and that all requested extension scopes were approved. |
| A service endpoint step fails | Supply every URL, username, password, API key, or Git credential requested by the selected template. |
| An agent queue cannot be found | Create or authorize the referenced queue, or update the template to a queue available in the test organization. |
| Provisioning stops partway through | Keep the page open, capture the failed phase and browser network response, then remove or inspect partially created resources before retrying with a new project name. |
| Upload succeeds but behavior is unchanged | Confirm the installed version, clear stale tabs, refresh Azure DevOps, and verify the VSIX SHA-256 matches the tested artifact. |

## Cleanup

After testing:

1. Delete generated projects from **Organization settings** > **Projects**.
2. Remove any external credentials, service principals, test resources, or Marketplace extensions created solely for the test.
3. Uninstall **Template Projects** from **Organization settings** > **Extensions** if the organization should return to its original state.
4. Remove the organization from the Marketplace extension's share list if access is no longer needed.
5. Delete temporary `dev.json`, certificates, and local development overrides.

## References

- [Package and publish Azure DevOps extensions](https://learn.microsoft.com/en-us/azure/devops/extend/publish/overview)
- [Publish from the command line](https://learn.microsoft.com/en-us/azure/devops/extend/publish/command-line)
- [Azure DevOps extension manifest reference](https://learn.microsoft.com/en-us/azure/devops/extend/develop/manifest)
- [Azure DevOps Extension Hot Reload and Debug](https://github.com/microsoft/azure-devops-extension-hot-reload-and-debug)
- [Extension architecture and compatibility](./AzureDevOpsExtension.md)
