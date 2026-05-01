import { getCompareDate } from '@/lib/date';
import { getQueryFilters, parseRequest } from '@/lib/request';
import { json, unauthorized } from '@/lib/response';
import { filterParams, withDateRange } from '@/lib/schema';
import { canViewWebsite } from '@/permissions';
import { getPageviewStats, getSessionStats } from '@/queries/sql';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ websiteId: string }> },
) {
  const schema = withDateRange({
    ...filterParams,
  });

  const { auth, query, error } = await parseRequest(request, schema);

  if (error) {
    return error();
  }

  const { websiteId } = await params;

  if (!(await canViewWebsite(auth, websiteId))) {
    return unauthorized();
  }

  const filters = await getQueryFilters(query, websiteId);

  if (filters.compare) {
    const { startDate: compareStartDate, endDate: compareEndDate } = getCompareDate(
      filters.compare,
      filters.startDate,
      filters.endDate,
    );
    const compareFilters = {
      ...filters,
      startDate: compareStartDate,
      endDate: compareEndDate,
    };
    const [pageviews, sessions, comparePageviews, compareSessions] = await Promise.all([
      getPageviewStats(websiteId, filters),
      getSessionStats(websiteId, filters),
      getPageviewStats(websiteId, compareFilters),
      getSessionStats(websiteId, compareFilters),
    ]);

    return json({
      pageviews,
      sessions,
      startDate: filters.startDate,
      endDate: filters.endDate,
      compare: {
        pageviews: comparePageviews,
        sessions: compareSessions,
        startDate: compareStartDate,
        endDate: compareEndDate,
      },
    });
  }

  const [pageviews, sessions] = await Promise.all([
    getPageviewStats(websiteId, filters),
    getSessionStats(websiteId, filters),
  ]);

  return json({ pageviews, sessions });
}
