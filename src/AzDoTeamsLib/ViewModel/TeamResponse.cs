namespace AzDoTeamsLib.ViewModel
{
    public class TeamResponse
    {
        public string id { get; set; }
        public string name { get; set; }
    }

    public class RootTeams
    {
        public List<Value> value { get; set; }
        public int count { get; set; }
    }

    public class Value
    {
        public string id { get; set; }
        public string name { get; set; }
        public string projectName { get; set; }
        public string projectId { get; set; }
    }
}
