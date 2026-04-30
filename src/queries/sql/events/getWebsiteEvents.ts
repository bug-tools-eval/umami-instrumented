import clickhouse from '@/lib/clickhouse';
import { DEFAULT_PAGE_SIZE, SESSION_COLUMNS } from '@/lib/constants';
import { CLICKHOUSE, PRISMA, runQuery } from '@/lib/db';
import prisma from '@/lib/prisma';
import type { QueryFilters } from '@/lib/types';

const FUNCTION_NAME = 'getWebsiteEvents';

export function getWebsiteEvents(...args: [websiteId: string, filters: QueryFilters]) {
  return runQuery({
    [PRISMA]: () => relationalQuery(...args),
    [CLICKHOUSE]: () => clickhouseQuery(...args),
  });
}

async function relationalQuery(websiteId: string, filters: QueryFilters) {
  const { pagedRawQuery, rawQuery, parseFilters } = prisma;
  const { search } = filters;
  const { filterQuery, dateQuery, cohortQuery, queryParams } = parseFilters({
    ...filters,
    websiteId,
  });

  const searchQuery = search
    ? `and ((event_name ilike {{search}} and event_type = 2)
           or (url_path ilike {{search}} and event_type = 1))`
    : '';

  const dataSql = `
    select
      website_event.event_id as "id",
      website_event.website_id as "websiteId",
      website_event.session_id as "sessionId",
      website_event.created_at as "createdAt",
      website_event.hostname,
      website_event.url_path as "urlPath",
      website_event.url_query as "urlQuery",
      website_event.referrer_path as "referrerPath",
      website_event.referrer_query as "referrerQuery",
      website_event.referrer_domain as "referrerDomain",
      session.country as country,
      city as city,
      device as  device,
      os as os,
      browser as browser,
      page_title as "pageTitle",
      website_event.event_type as "eventType",
      website_event.event_name as "eventName",
      event_id IN (select website_event_id
                   from event_data
                   where website_id = {{websiteId::uuid}}
                      and created_at between {{startDate}} and {{endDate}}) AS "hasData"
    from website_event
    ${cohortQuery}
    join session on session.session_id = website_event.session_id
      and session.website_id = website_event.website_id
    where website_event.website_id = {{websiteId::uuid}}
    ${dateQuery}
    ${filterQuery}
    ${searchQuery}
    order by website_event.created_at desc
    `;

  // Fast path: when no filter references a session column, the count subquery
  // doesn't need the (events × sessions) join — every website_event has a
  // session row, so count(events) == count(joined). Run a cheap count on
  // website_event alone in parallel with the existing data query (whose ORDER
  // BY + LIMIT keeps the join scope to a single page).
  const hasSessionFilter = SESSION_COLUMNS.some(col => filters[col] != null);
  const { page = 1, pageSize, orderBy, sortDescending = false } = filters;
  const size = +pageSize || DEFAULT_PAGE_SIZE;

  if (!hasSessionFilter && !cohortQuery && +size > 0) {
    const offset = +size * (+page - 1);
    const direction = sortDescending ? 'desc' : 'asc';

    const countSql = `
      select count(*) as num
      from website_event
      where website_event.website_id = {{websiteId::uuid}}
      ${dateQuery}
      ${filterQuery}
      ${searchQuery}
    `;

    const dataPaged = `${dataSql}${
      orderBy ? `\norder by ${orderBy} ${direction}` : ''
    }\nlimit ${+size} offset ${offset}`;

    const [count, data] = await Promise.all([
      rawQuery(countSql, queryParams).then((r: any[]) => Number(r[0].num)),
      rawQuery(dataPaged, queryParams, FUNCTION_NAME),
    ]);

    return { data, count, page: +page, pageSize: size, orderBy };
  }

  return pagedRawQuery(dataSql, queryParams, filters, FUNCTION_NAME);
}

async function clickhouseQuery(websiteId: string, filters: QueryFilters) {
  const { pagedRawQuery, parseFilters } = clickhouse;
  const { search } = filters;
  const { queryParams, dateQuery, cohortQuery, filterQuery } = parseFilters({
    ...filters,
    websiteId,
  });

  const searchQuery = search
    ? `and ((positionCaseInsensitive(event_name, {search:String}) > 0 and event_type = 2)
           or (positionCaseInsensitive(url_path, {search:String}) > 0 and event_type = 1))`
    : '';

  return pagedRawQuery(
    `
    select
      event_id as id,
      website_id as websiteId, 
      session_id as sessionId,
      created_at as createdAt,
      hostname,
      url_path as urlPath,
      url_query as urlQuery,
      referrer_path as referrerPath,
      referrer_query as referrerQuery,
      referrer_domain as referrerDomain,
      country as country,
      city as city,
      device as device,
      os as os,
      browser as browser,
      page_title as pageTitle,
      event_type as eventType,
      event_name as eventName,
      event_id IN (select event_id 
                   from event_data 
                   where website_id = {websiteId:UUID}
                   ${dateQuery}) as hasData
    from website_event
    ${cohortQuery}
    where website_id = {websiteId:UUID}
    ${dateQuery}
    ${filterQuery}
    ${searchQuery}
    order by created_at desc
    `,
    queryParams,
    filters,
    FUNCTION_NAME,
  );
}
