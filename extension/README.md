# Template Projects Azure DevOps Extension

This browser extension creates projects in the current Azure DevOps organization from the templates in `src/ADOGenerator/Templates`.

For a complete test-environment workflow, see [Build and deploy the Azure DevOps extension](../docs/BuildAndDeployExtension.md).

## Development

Use Node.js 24 or later:

```text
npm install
npm run dev
```

The development server is intended for Azure DevOps extension development with a development manifest. The extension obtains an Azure DevOps SDK access token and never stores it.

## Build and package

```text
npm run test
npm run build
npm run package
```

The VSIX is written to `packages/`. Change the `publisher` in `vss-extension.json` to the publisher that owns the private extension before uploading it.

The build validates `Templates/TemplateSetting.json`, generates a typed browser catalog, and copies the template assets into `dist/Templates`.

## Current migration status

The extension can browse the existing templates, validate a project name, collect template-required service connection values in memory, create the project, track the Azure DevOps long-running operation, and apply the bundled organization, repository, work tracking, build/release, service endpoint, wiki, test, dashboard, and delivery-plan assets.

Marketplace extension installation, template extraction, private templates, and multi-project runs remain outside the browser MVP. The CLI remains available while live-organization parity is validated across the representative template matrix.

The extension page must remain open while provisioning runs.
