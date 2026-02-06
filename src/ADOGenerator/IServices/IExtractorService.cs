using ADOGenerator.Models;
using AzDoCoreLib;
using RestAPI;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace ADOGenerator.IServices
{
    public interface IExtractorService
    {
        ProjectConfigurations ProjectConfiguration(Project model);
        int GetTeamsCount(ProjectConfigurations appConfig);
        int GetIterationsCount(ProjectConfigurations appConfig);
        int GetBuildDefinitionCount(ProjectConfigurations appConfig);
        int GetReleaseDefinitionCount(ProjectConfigurations appConfig);
        string[] GenerateTemplateArifacts(Project model);
        Dictionary<string, int> GetWorkItemsCount(ProjectConfigurations appConfig);
        List<RequiredExtensions.ExtensionWithLink> GetInstalledExtensions(ProjectConfigurations appConfig, string extractedFolderName);
        void ExportQuries(ProjectConfigurations appConfig, string extractedFolderName);
        bool ExportTeams(ADOConfiguration con, Project model, string extractedFolderName);
        bool ExportIterations(ProjectConfigurations appConfig, string extractedFolderName);
        bool ExportWorkItems(ProjectConfigurations appConfig, string extractedFolderName);
        bool ExportRepositoryList(ProjectConfigurations appConfig, string extractedFolderName);
        int GetBuildDefinitions(ProjectConfigurations appConfig, string extractedFolderName);
        int GeneralizingGetReleaseDefinitions(ProjectConfigurations appConfig, string extractedFolderName);
        void GetServiceEndpoints(ProjectConfigurations appConfig, string extractedFolderName);
        bool ExportDeliveryPlans(ProjectConfigurations appConfig, string extractedFolderName);
        bool IsTemplateExists(string templateName);
    }
}
