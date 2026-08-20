# Azure DevOps Demo Generator


## About

The Azure DevOps Demo Generator can create projects in your Azure DevOps organization, prepopulated with template-based content including source code, work items, iterations, service endpoints, build and release definitions, and more!

The original purpose of this system is to simplify working with the [Azure DevOps hands-on-labs](https://www.azuredevopslabs.com), demos and other education material. But it can also be used to drive your ownAzure DevOps automation utilities, provision your own custom templates, or as a reference for using the [Azure DevOps REST APIs](https://learn.microsoft.com/en-us/rest/api/azure/devops/).

## Azure DevOps extension

The `extension` workspace contains the browser-based Template Projects extension. It packages the existing template catalog as a private VSIX and uses the signed-in Azure DevOps user's extension token, so a separate PAT or device-code login is not required.

See [Azure DevOps extension development](./docs/AzureDevOpsExtension.md) for the architecture, permissions, build instructions, and current migration constraints. The .NET CLI remains available while template capability parity is validated.

## Contributions

This project welcomes contributions and suggestions.  Most contributions require you to agree to a Contributor License Agreement (CLA) declaring that you have the right to, and actually do, grant us the rights to use your contribution. For details, visit https://cla.microsoft.com.

This project has adopted the [Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/). For more information see the [Code of Conduct FAQ](https://opensource.microsoft.com/codeofconduct/faq/) or contact [opencode@microsoft.com](mailto:opencode@microsoft.com) with any additional questions or comments.

For more information on contributing, please visit the [contributor guide](./CONTRIBUTING.md).

## Contributors:

- [Akshay Hosur](https://github.com/akshay-online)
