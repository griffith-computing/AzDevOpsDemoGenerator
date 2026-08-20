# Azure DevOps extension development

The Template Projects extension is a self-contained React and TypeScript Azure DevOps web extension. It is designed for interactive proof-of-concept project creation in the organization where it is installed.

For build, private Marketplace deployment, local-development, acceptance, and cleanup steps, see [Build and deploy the Azure DevOps extension](./BuildAndDeployExtension.md).

## Architecture

- `extension/src/App.tsx` provides template discovery, prerequisite display, project input, progress, and cancellation.
- `extension/src/services/sdkContext.ts` obtains the current organization and short-lived extension access token.
- `extension/src/services/AzureDevOpsClient.ts` sends authenticated requests to Azure DevOps core, release, and graph hosts.
- `extension/src/services/provisioning` contains the dependency-ordered provisioning engine and capability phases.
- `extension/scripts/generate-template-catalog.mjs` validates the legacy catalog and generates browser manifests.
- Template files are copied to deterministic, VSIX-safe asset names at build time. Logical paths remain available through `TemplateAssetLoader`.

The generated manifest discovers the credential and URL parameters required by each template's service endpoints. The UI collects those values only when needed. The extension never stores them or the Azure DevOps access token in extension data, browser storage, logs, or generated assets.

## Build

Use Node.js 24 or later:

```text
cd extension
npm install
npm test
npm run package
```

The private VSIX is written to `extension/packages`. Set the `publisher` in `extension/vss-extension.json` to an Azure DevOps Marketplace publisher you control before uploading it.

## Permissions

The private extension requests permissions for the bundled templates' project, work tracking, repository, build, release, service endpoint, variable group, deployment group, test, wiki, graph, and profile operations. Installation therefore requires organization administrator approval. Calls still run with the signed-in user's effective permissions and cannot elevate that user.

Marketplace extensions referenced by a template are not silently installed. Their licenses and terms must be accepted by an organization administrator before provisioning.

## Runtime constraints

- Provisioning runs in the browser and the extension page must remain open.
- A run can be cancelled between or during cancellable REST operations, but cancellation does not roll back resources already created.
- Provisioning only targets the current Azure DevOps organization.
- Private templates, template extraction, unattended jobs, and multi-project runs are outside the browser-only MVP.
- Service connection parameters are entered interactively and remain in memory for the current run. The user must supply values authorized for the selected template's external systems.
- Marketplace extension installation is a prerequisite rather than an automated provisioning step.
- Cancellation does not roll back resources already created.

## Compatibility validation

The automated suite validates all 64 catalog entries and their VSIX-safe asset mappings. Mocked provisioning tests cover phase dependency/error propagation, cancellation, service endpoint credential substitution, source work-item ordering and relations, dashboard token aliases, and unsupported dashboard helper files.

Before replacing the CLI, install the private VSIX in a disposable organization and run this representative matrix:

| Template | Coverage focus |
| --- | --- |
| `Gen-eShopOnWeb` | Full path: teams, boards, repositories, service endpoint, work items, tests, build/release, delivery plan, branch policy, dashboard |
| `Gen-PartsUnlimited` | Pull requests, test plans, dashboard helper asset compatibility |
| `DL-Docker` | Legacy dashboard build/release/repository tokens |
| `FA-IAC-migration` | Variable groups |
| `CAF-AzureGovernance` | Teams/work items without pipeline-heavy extras |

For each run, confirm the project reaches `wellFormed`, every displayed phase finishes or is explicitly skipped, no `$token$` remains in created definitions, and interrupted runs report their last completed phase. Live organization parity remains the acceptance gate because tests cannot reproduce tenant permissions, Marketplace license acceptance, external credentials, agent queue availability, or service-specific throttling.

## Development manifest

The hub is contributed under organization settings. For local development, use the normal Azure DevOps extension development flow with a private publisher and a development manifest/base URI. Do not publish a package that still names a publisher you do not control.
