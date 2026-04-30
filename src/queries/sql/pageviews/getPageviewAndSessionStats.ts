import { CLICKHOUSE, PRISMA, runQuery } from '@/lib/db';
import prisma from '@/lib/prisma';
import type { QueryFilters } from '@/lib/types';
import { getPageviewStats } from './getPageviewStats';
import { getSessionStats } from '@/queries/sql/sessions/getSessionStats';

const FUNCTION_NAME = 'getPageviewAndSessionStats';

export type SeriesPoint = { x: string; y: number };
export type PageviewAndSessionStats = { pageviews: SeriesPoint[]; sessions: SeriesPoint[] };

export async function getPageviewAndSessionStats(
  ...args: [websiteId: string, filters: QueryFilters]
): Promise<PageviewAndSessionStats> {
  return runQuery({
    [PRISMA]: () => relationalQuery(...args),
    [CLICKHOUSE]: () => clickhouseQuery(...args),
  });
}

async function relationalQuery(
  websiteId: string,
  filters: QueryFilters,
): Promise<PageviewAndSessionStats> {
  const { timezone = 'utc', unit = 'day' } = filters;
  const { getDateTruncSQL, getDateFormatSQL, parseFilters, rawQuery } = prisma;
  const { filterQuery, cohortQuery, excludeBounceQuery, joinSessionQuery, queryParams } =
    parseFilters({
      ...filters,
      websiteId,
    });

  // Single pass over website_event computes both the pageview count and the
  // visitor count per bucket. Avoids running the underlying aggregation twice
  // (once for /pageviews → getPageviewStats, once for getSessionStats), each
  // of which would otherwise pay an independent connection acquire + scan +
  // sort + group on the same input.
  const rows = (await rawQuery(
    `
    select ${getDateFormatSQL('t', unit, timezone)} x,
      pv, sv
    from (
      select ${getDateTruncSQL('website_event.created_at', unit, timezone)} t,
        count(*) pv,
        count(distinct website_event.session_id) sv
      from website_event
      ${cohortQuery}
      ${excludeBounceQuery}
      ${joinSessionQuery}
      where website_event.website_id = {{websiteId::uuid}}
        and website_event.created_at between {{startDate}} and {{endDate}}
        and website_event.event_type NOT IN (2, 5)
        ${filterQuery}
      group by t
    ) g
    order by t
    `,
    queryParams,
    FUNCTION_NAME,
  )) as Array<{ x: string; pv: number | bigint; sv: number | bigint }>;

  const pageviews: SeriesPoint[] = [];
  const sessions: SeriesPoint[] = [];

  for (const row of rows) {
    pageviews.push({ x: row.x, y: Number(row.pv) });
    sessions.push({ x: row.x, y: Number(row.sv) });
  }

  return { pageviews, sessions };
}

async function clickhouseQuery(
  websiteId: string,
  filters: QueryFilters,
): Promise<PageviewAndSessionStats> {
  // ClickHouse has its own pre-aggregated table path and the SQL shape differs
  // significantly between the two stats; rather than attempt a combined CH
  // query (which would diverge from the existing optimized shapes), fan out
  // both calls in parallel — they hit the materialized hourly stats and are
  // already cheap on CH.
  const [pageviews, sessions] = await Promise.all([
    getPageviewStats(websiteId, filters),
    getSessionStats(websiteId, filters),
  ]);
  return { pageviews, sessions };
}
