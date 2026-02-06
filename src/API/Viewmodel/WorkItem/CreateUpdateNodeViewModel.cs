using AzDoCoreLib;

namespace RestAPI.Viewmodel.WorkItem
{
    public class CreateUpdateNodeViewModel
    {
        public class Node : BaseViewModel
        {
            public int id { get; set; }
            public string name { get; set; }
            public Attributes attributes { get; set; }
        }

        public class Attributes
        {
            public DateTime startDate { get; set; }
            public DateTime finishDate { get; set; }
        }
    }
}
