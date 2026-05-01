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

  const data = Object.fromEntries(
    await Promise.all(
      UTM_PARAMS.map(async key => [
        key,
        await getUTM(websiteId, { column: key, ...parameters } as UTMParameters, filters),
      ]),
    ),
  );

  return json(data);
}
