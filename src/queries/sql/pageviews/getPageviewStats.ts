import clickhouse from '@/lib/clickhouse';
import { EVENT_COLUMNS } from '@/lib/constants';
import { CLICKHOUSE, PRISMA, runQuery } from '@/lib/db';
import prisma from '@/lib/prisma';
import type { QueryFilters } from '@/lib/types';

const FUNCTION_NAME = 'getPageviewStats';

export async function getPageviewStats(...args: [websiteId: string, filters: QueryFilters]) {
  return runQuery({
    [PRISMA]: () => relationalQuery(...args),
    [CLICKHOUSE]: () => clickhouseQuery(...args),
  });
}

async function relationalQuery(websiteId: string, filters: QueryFilters) {
  const { timezone = 'utc', unit = 'day' } = filters;
  const { getDateTruncSQL, getDateFormatSQL, parseFilters, rawQuery } = prisma;
  const { filterQuery, cohortQuery, excludeBounceQuery, joinSessionQuery, queryParams } =
    parseFilters({
      ...filters,
      websiteId,
    });

  // Group by the timestamp bucket (8 byte timestamptz) and format only on the
  // outer projection. Sorting/aggregating on the to_char output is several×
  // slower because the sort key becomes a 19-char varchar.
  return rawQuery(
    `
    select ${getDateFormatSQL('t', unit, timezone)} x, y
    from (
      select ${getDateTruncSQL('website_event.created_at', unit, timezone)} t,
        count(*) y
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
  );
}

async function clickhouseQuery(
  websiteId: string,
  filters: QueryFilters,
): Promise<{ x: string; y: number }[]> {
  const { timezone = 'UTC', unit = 'day' } = filters;
  const { parseFilters, rawQuery, getDateSQL } = clickhouse;
  const { filterQuery, cohortQuery, excludeBounceQuery, queryParams } = parseFilters({
    ...filters,
    websiteId,
  });

  let sql = '';

  if (EVENT_COLUMNS.some(item => Object.keys(filters).includes(item)) || unit === 'minute') {
    sql = `
    select
      g.t as x,
      g.y as y
    from (
      select
        ${getDateSQL('website_event.created_at', unit, timezone)} as t,
        count(*) as y
      from website_event
      ${cohortQuery}
      ${excludeBounceQuery}
      where website_id = {websiteId:UUID}
        and created_at between {startDate:DateTime64} and {endDate:DateTime64}
        and event_type NOT IN (2, 5)
        ${filterQuery}
      group by t
    ) as g
    order by t
    `;
  } else {
    sql = `
    select
      g.t as x,
      g.y as y
    from (
      select
        ${getDateSQL('website_event.created_at', unit, timezone)} as t,
        sum(views) as y
      from website_event_stats_hourly as website_event
      ${cohortQuery}
      ${excludeBounceQuery}
      where website_id = {websiteId:UUID}
        and created_at between {startDate:DateTime64} and {endDate:DateTime64}
        and event_type NOT IN (2, 5)
        ${filterQuery}
      group by t
    ) as g
    order by t
    `;
  }

  return rawQuery(sql, queryParams, FUNCTION_NAME);
}
