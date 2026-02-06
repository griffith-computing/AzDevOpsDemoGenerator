using Newtonsoft.Json.Linq;

namespace AzDoCoreLib
{
    public class Utility
    {
        public static string GetErrorMessage(string Exception)
        {
            string message = string.Empty;
            try
            {
                if (!string.IsNullOrEmpty(Exception))
                {
                    JObject jItems = JObject.Parse(Exception);

                    message = jItems["message"] == null ? "" : jItems["message"].ToString();
                }

                return message;
            }
            catch (Exception)
            {
                return message;
            }
        }

        public static string SanitizeJson(string json)
        {
            // Implement sanitization logic to remove or mask sensitive information
            // For example, remove password fields
            var jsonObject = JObject.Parse(json);
            if (jsonObject["password"] != null)
            {
                jsonObject["password"] = "****";
            }
            // Add more sanitization logic as needed
            return jsonObject.ToString();
        }
    }

}
