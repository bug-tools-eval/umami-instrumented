import { UTM_PARAMS } from '@/lib/constants';
import { getQueryFilters, parseRequest, setWebsiteDate } from '@/lib/request';
import { json, unauthorized } from '@/lib/response';
import { reportResultSchema } from '@/lib/schema';
import { canViewWebsite } from '@/permissions';
import { getUTM, type UTMParameters } from '@/queries/sql';

export async function POST(request: Request) {
  const { auth, body, error } = await parseRequest(request, reportResultSchema);

  if (error) {
    return error();
  }

  const { websiteId } = body;

  if (!(await canViewWebsite(auth, websiteId))) {
    return unauthorized();
  }

  const filters = await getQueryFilters(body.filters, websiteId);
  const parameters = await setWebsiteDate(websiteId, body.parameters);

  // Run the per-column UTM lookups concurrently rather than sequentially.
  const results = await Promise.all(
    UTM_PARAMS.map(key =>
      getUTM(websiteId, { column: key, ...parameters } as UTMParameters, filters),
    ),
  );

  const data = {
    utm_source: [],
    utm_medium: [],
    utm_campaign: [],
    utm_term: [],
    utm_content: [],
  };

  UTM_PARAMS.forEach((key, i) => {
    data[key] = results[i];
  });

  return json(data);
}
