using System.Net;

namespace AzDoCoreLib
{
    public class BaseViewModel
    {
        public HttpStatusCode HttpStatusCode { get; set; }
        public string Message { get; set; }
    }
}
