import clickhouse from '@/lib/clickhouse';
import { EVENT_COLUMNS, SESSION_COLUMNS } from '@/lib/constants';
import { CLICKHOUSE, PRISMA, runQuery } from '@/lib/db';
import prisma from '@/lib/prisma';
import type { QueryFilters } from '@/lib/types';

const FUNCTION_NAME = 'getWebsiteSessionStats';

export interface WebsiteSessionStatsData {
  pageviews: number;
  visitors: number;
  visits: number;
  countries: number;
  events: number;
}

export async function getWebsiteSessionStats(
  ...args: [websiteId: string, filters: QueryFilters]
): Promise<WebsiteSessionStatsData[]> {
  return runQuery({
    [PRISMA]: () => relationalQuery(...args),
    [CLICKHOUSE]: () => clickhouseQuery(...args),
  });
}

async function relationalQuery(
  websiteId: string,
  filters: QueryFilters,
): Promise<WebsiteSessionStatsData[]> {
  const { parseFilters, rawQuery } = prisma;
  const { filterQuery, cohortQuery, queryParams } = parseFilters({
    ...filters,
    websiteId,
  });

  // Fast path: when no filter references a session column, the only reason
  // to join `session` is to count distinct country. Splitting the work into
  // an events-only aggregate plus a session-side EXISTS scan removes the
  // 44k × 16k hash-join multiplication and runs both in parallel.
  const hasSessionFilter = SESSION_COLUMNS.some(col => filters[col] != null);

  if (!hasSessionFilter && !cohortQuery) {
    const [stats, countries] = await Promise.all([
      rawQuery(
        `
        select
          count(*) as "pageviews",
          count(distinct website_event.session_id) as "visitors",
          count(distinct website_event.visit_id) as "visits",
          sum(case when website_event.event_type = 2 then 1 else 0 end) as "events"
        from website_event
        where website_event.website_id = {{websiteId::uuid}}
          and website_event.created_at between {{startDate}} and {{endDate}}
          ${filterQuery}
        `,
        queryParams,
        FUNCTION_NAME,
      ).then((r: any[]) => r?.[0] ?? {}),
      rawQuery(
        `
        select count(distinct s.country) as "countries"
        from session s
        where s.website_id = {{websiteId::uuid}}
          and exists (
            select 1 from website_event we
            where we.session_id = s.session_id
              and we.website_id = {{websiteId::uuid}}
              and we.created_at between {{startDate}} and {{endDate}}
          )
        `,
        queryParams,
        `${FUNCTION_NAME}:countries`,
      ).then((r: any[]) => r?.[0] ?? {}),
    ]);

    return [{ ...stats, ...countries } as WebsiteSessionStatsData];
  }

  return rawQuery(
    `
    select
      count(*) as "pageviews",
      count(distinct website_event.session_id) as "visitors",
      count(distinct website_event.visit_id) as "visits",
      count(distinct session.country) as "countries",
      sum(case when website_event.event_type = 2 then 1 else 0 end) as "events"
    from website_event
    ${cohortQuery}
    join session on website_event.session_id = session.session_id
      and website_event.website_id = session.website_id
    where website_event.website_id = {{websiteId::uuid}}
      and website_event.created_at between {{startDate}} and {{endDate}}
      ${filterQuery}
    `,
    queryParams,
    FUNCTION_NAME,
  );
}

async function clickhouseQuery(
  websiteId: string,
  filters: QueryFilters,
): Promise<WebsiteSessionStatsData[]> {
  const { rawQuery, parseFilters } = clickhouse;
  const { filterQuery, cohortQuery, queryParams } = parseFilters({ ...filters, websiteId });

  let sql = '';

  if (EVENT_COLUMNS.some(item => Object.keys(filters).includes(item))) {
    sql = `
    select
      sumIf(1, event_type = 1) as "pageviews",
      uniq(session_id) as "visitors",
      uniq(visit_id) as "visits",
      uniq(country) as "countries",
      sumIf(1, event_type = 2) as "events"
    from website_event
    ${cohortQuery}
    where website_id = {websiteId:UUID}
        and created_at between {startDate:DateTime64} and {endDate:DateTime64}
        ${filterQuery}
    `;
  } else {
    sql = `
    select
      sum(views) as "pageviews",
      uniq(session_id) as "visitors",
      uniq(visit_id) as "visits",
      uniq(country) as "countries",
      sum(length(event_name)) as "events"
    from website_event_stats_hourly website_event
    ${cohortQuery}
    where website_id = {websiteId:UUID}
        and created_at between {startDate:DateTime64} and {endDate:DateTime64}
        ${filterQuery}
    `;
  }

  return rawQuery(sql, queryParams, FUNCTION_NAME);
}
