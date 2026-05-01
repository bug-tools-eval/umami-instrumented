import { getQueryFilters, parseRequest, setWebsiteDate } from '@/lib/request';
import { json, unauthorized } from '@/lib/response';
import { reportResultSchema } from '@/lib/schema';
import { canViewWebsite } from '@/permissions';
import { type AttributionParameters, getAttribution } from '@/queries/sql/reports/getAttribution';

export async function POST(request: Request) {
  const { auth, body, error } = await parseRequest(request, reportResultSchema);

  if (error) {
    return error();
  }

  const { websiteId } = body;

  if (!(await canViewWebsite(auth, websiteId))) {
    return unauthorized();
  }

  const [parameters, filters] = await Promise.all([
    setWebsiteDate(websiteId, body.parameters),
    getQueryFilters(body.filters, websiteId),
  ]);

  const data = await getAttribution(websiteId, parameters as AttributionParameters, filters);

  return json(data);
}
