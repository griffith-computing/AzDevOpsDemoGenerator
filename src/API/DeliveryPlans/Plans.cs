using AzDoCoreLib;
using Newtonsoft.Json;
using RestAPI.Viewmodel.Plans;
using System.Text;
using static RestAPI.Viewmodel.Plans.DeliveryPlans;

namespace RestAPI.DeliveryPlans
{
    public class Plans : ApiServiceBase
    {
        public Plans(IADOConfiguration configuration) : base(configuration) { }

        /// <summary>
        /// Create Delivery plans
        /// </summary>
        /// <param name="json"></param>
        /// <param name="project"></param>
        /// <returns></returns>
		public APlan.Root AddDeliveryPlan(string json, string project)
        {
            try
            {
                using (var client = GetHttpClient())
                {
                    APlan.Root plan = new APlan.Root();
                    var jsonContent = new StringContent(json, Encoding.UTF8, "application/json");
                    var method = new HttpMethod("POST");

                    var request = new HttpRequestMessage(method, project + "/_apis/work/plans?api-version=7.0") { Content = jsonContent };
                    var response = client.SendAsync(request).Result;
                    response.EnsureSuccessStatusCode();
                    if (response.IsSuccessStatusCode)
                    {
                        plan = JsonConvert.DeserializeObject<APlan.Root>(response.Content.ReadAsStringAsync().Result);
                        return plan;
                    }
                    else
                    {
                        var errorMessage = response.Content.ReadAsStringAsync();
                        string error = AzDoCoreLib.Utility.GetErrorMessage(errorMessage.Result.ToString());
                        this.LastFailureMessage = error;
                    }
                }

            }
            catch (Exception)
            {
            }
            return new APlan.Root();
        }
        public bool UpdateDeliveryPlan(string json, string project, string id)
        {
            try
            {
                using (var client = GetHttpClient())
                {
                    var jsonContent = new StringContent(json, Encoding.UTF8, "application/json");
                    var method = new HttpMethod("PUT");

                    var request = new HttpRequestMessage(method, project + $"/_apis/work/plans/{id}?api-version=7.0") { Content = jsonContent };
                    var response = client.SendAsync(request).Result;
                    if (response.IsSuccessStatusCode)
                    {
                        return true;
                    }
                    else
                    {
                        var errorMessage = response.Content.ReadAsStringAsync();
                        string error = AzDoCoreLib.Utility.GetErrorMessage(errorMessage.Result.ToString());
                        this.LastFailureMessage = error;
                        return false;
                    }
                }

            }
            catch (Exception)
            {
                return false;
            }
        }

        public GetPlans.Root GetDeliveryPlans(string organization, string project)
        {
            try
            {
                using (var client = GetHttpClient())
                {
                    var request = $"https://dev.azure.com/{organization}/{project}/_apis/work/plans?api-version=7.0";
                    var response = client.GetAsync(request).Result;
                    if (response.IsSuccessStatusCode)
                    {
                        string res = response.Content.ReadAsStringAsync().Result;
                        GetPlans.Root pl = new GetPlans.Root();
                        pl = JsonConvert.DeserializeObject<GetPlans.Root>(res);
                        return pl;
                    }
                    else
                    {
                        var errorMessage = response.Content.ReadAsStringAsync();
                        string error = AzDoCoreLib.Utility.GetErrorMessage(errorMessage.Result.ToString());
                        this.LastFailureMessage = error;
                    }
                }
            }
            catch (Exception)
            {
            }
            return new GetPlans.Root();
        }

        public APlan.Root GetAPlan(string organization, string project, string id)
        {
            try
            {
                using (var client = GetHttpClient())
                {
                    var request = $"https://dev.azure.com/{organization}/{project}/_apis/work/plans/{id}?api-version=7.0";
                    var response = client.GetAsync(request).Result;
                    if (response.IsSuccessStatusCode)
                    {
                        string res = response.Content.ReadAsStringAsync().Result;
                        APlan.Root aplan = JsonConvert.DeserializeObject<APlan.Root>(res);
                        return aplan;
                    }
                    else
                    {
                        var errorMessage = response.Content.ReadAsStringAsync();
                        string error = AzDoCoreLib.Utility.GetErrorMessage(errorMessage.Result.ToString());
                        this.LastFailureMessage = error;
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine(ex.Message);
            }
            return new APlan.Root();
        }
    }
}