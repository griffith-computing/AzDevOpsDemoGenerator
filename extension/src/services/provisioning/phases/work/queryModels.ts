/** The contents of a `Dashboard/[&lt;Team&gt;/]Queries/&lt;name&gt;.json` template asset. */
export interface QueryTemplate {
  name: string
  wiql: string
}

/** Response returned by both the query-folder-create and query-create endpoints. */
export interface QueryCreateResponse {
  id: string
  name: string
}
