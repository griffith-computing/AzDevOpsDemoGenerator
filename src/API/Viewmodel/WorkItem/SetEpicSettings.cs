using AzDoCoreLib;
using Newtonsoft.Json;

namespace RestAPI.Viewmodel.WorkItem
{
    public class SetEpicSettings
    {
        public class Epiclist
        {
            [JsonProperty("backlogVisibilities")]
            public BacklogVisibilities backlogVisibilities { get; set; }
        }


        public class BacklogVisibilities : BaseViewModel
        {
            [JsonProperty("Microsoft.EpicCategory")]
            public string epi { get; set; }
            [JsonProperty("Microsoft.FeatureCategory")]
            public string pbi { get; set; }
            [JsonProperty("Microsoft.RequirementCategory")]
            public string Req { get; set; }
        }



    }
}
