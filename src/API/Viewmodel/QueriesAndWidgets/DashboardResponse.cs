using AzDoCoreLib;

namespace RestAPI.Viewmodel.QueriesAndWidgets
{
    public class DashboardResponse
    {
        public class Dashboard : BaseViewModel
        {
            public Value[] dashboardEntries { get; set; }
        }
        public class Value
        {
            public string id { get; set; }
            public string name { get; set; }
        }
    }
}
