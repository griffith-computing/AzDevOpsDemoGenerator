namespace AzDoCoreLib.Interface
{
    public interface IInitService
    {
        string ExtractHref(string link);

        string ReadSecret();

        void PrintErrorMessage(string message);

        bool CheckProjectName(string name);
    }
}
