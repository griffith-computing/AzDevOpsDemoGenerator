namespace AzDoTeamsLib.ViewModel
{
    public class TeamMemberResponse
    {
        public class Identity
        {
            public string displayName { get; set; }
            public string url { get; set; }
            public string id { get; set; }
            public string uniqueName { get; set; }
            public string imageUrl { get; set; }
            public string descriptor { get; set; }
        }

        public class Value
        {
            public Identity identity { get; set; }
        }

        public class TeamMembers
        {
            public IList<Value> value { get; set; }
            public int count { get; set; }
        }


    }
}
