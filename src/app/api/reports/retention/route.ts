import { getQueryFilters, parseRequest, setWebsiteDate } from '@/lib/request';
import { json, unauthorized } from '@/lib/response';
import { reportResultSchema } from '@/lib/schema';
import { canViewWebsite } from '@/permissions';
import { getRetention, type RetentionParameters } from '@/queries/sql';

export async function POST(request: Request) {
  const { auth, body, error } = await parseRequest(request, reportResultSchema);

  if (error) {
    return error();
  }

  const { websiteId } = body;

  if (!(await canViewWebsite(auth, websiteId))) {
    return unauthorized();
  }

  const [filters, parameters] = await Promise.all([
    getQueryFilters(body.filters, websiteId),
    setWebsiteDate(websiteId, body.parameters),
  ]);

  const data = await getRetention(websiteId, parameters as RetentionParameters, filters);

  return json(data);
}
