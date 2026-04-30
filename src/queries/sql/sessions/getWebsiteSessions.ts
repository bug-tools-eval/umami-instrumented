import clickhouse from '@/lib/clickhouse';
import { DEFAULT_PAGE_SIZE, EVENT_COLUMNS, SESSION_COLUMNS } from '@/lib/constants';
import { CLICKHOUSE, PRISMA, runQuery } from '@/lib/db';
import prisma from '@/lib/prisma';
import type { QueryFilters } from '@/lib/types';

const FUNCTION_NAME = 'getWebsiteSessions';

export async function getWebsiteSessions(...args: [websiteId: string, filters: QueryFilters]) {
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
    search: search ? `%${search}%` : undefined,
  });

  const searchQuery = search
    ? `and (distinct_id ilike {{search}}
           or city ilike {{search}}
           or browser ilike {{search}}
           or os ilike {{search}}
           or device ilike {{search}})`
    : '';

  // Fast path skips the eager join of `session` (16k rows on the demo dataset)
  // and the eager aggregation of every event in the window. We can use it when
  // no filter or search references session columns — the only reason the
  // session table needs to be visible during aggregation/filtering.
  const hasSessionFilter = SESSION_COLUMNS.some(col => filters[col] != null);
  const { page = 1, pageSize, sortDescending = true } = filters;
  const size = +pageSize || DEFAULT_PAGE_SIZE;

  if (!hasSessionFilter && !search && +size > 0) {
    const offset = +size * (+page - 1);
    const direction = sortDescending ? 'desc' : 'asc';

    const countSql = `
      select count(*) as num from (
        select website_event.session_id, website_event.hostname
        from website_event
        ${cohortQuery}
        where website_event.website_id = {{websiteId::uuid}}
        ${dateQuery}
        ${filterQuery}
        group by website_event.session_id, website_event.hostname
      ) t
    `;

    const dataSql = `
      with ranked as (
        select
          website_event.session_id,
          website_event.hostname,
          max(website_event.created_at) as last_at
        from website_event
        ${cohortQuery}
        where website_event.website_id = {{websiteId::uuid}}
        ${dateQuery}
        ${filterQuery}
        group by website_event.session_id, website_event.hostname
        order by last_at ${direction}
        limit ${+size} offset ${offset}
      )
      select
        session.session_id as "id",
        session.website_id as "websiteId",
        ranked.hostname,
        session.browser,
        session.os,
        session.device,
        session.screen,
        session.language,
        session.country,
        session.region,
        session.city,
        agg."firstAt",
        agg."lastAt",
        agg.visits,
        agg.views,
        agg.events,
        agg."lastAt" as "createdAt"
      from ranked
      join session
        on session.session_id = ranked.session_id
        and session.website_id = {{websiteId::uuid}}
      join lateral (
        select
          min(we.created_at) as "firstAt",
          max(we.created_at) as "lastAt",
          count(distinct we.visit_id) as visits,
          sum(case when we.event_type = 1 then 1 else 0 end) as views,
          sum(case when we.event_type = 2 then 1 else 0 end) as events
        from website_event we
        where we.website_id = {{websiteId::uuid}}
          and we.session_id = ranked.session_id
          and we.hostname is not distinct from ranked.hostname
          ${dateQuery.replace(/\bwebsite_event\b/g, 'we')}
      ) agg on true
      order by ranked.last_at ${direction}
    `;

    const [count, data] = await Promise.all([
      rawQuery(countSql, queryParams).then((r: any[]) => Number(r[0].num)),
      rawQuery(dataSql, queryParams, FUNCTION_NAME),
    ]);

    return { data, count, page: +page, pageSize: size, orderBy: filters.orderBy };
  }

  return pagedRawQuery(
    `
    select
      session.session_id as "id",
      session.website_id as "websiteId",
      website_event.hostname,
      session.browser,
      session.os,
      session.device,
      session.screen,
      session.language,
      session.country,
      session.region,
      session.city,
      min(website_event.created_at) as "firstAt",
      max(website_event.created_at) as "lastAt",
      count(distinct website_event.visit_id) as "visits",
      sum(case when website_event.event_type = 1 then 1 else 0 end) as "views",
      sum(case when website_event.event_type = 2 then 1 else 0 end) as "events",
      max(website_event.created_at) as "createdAt"
    from website_event
    ${cohortQuery}
    join session on session.session_id = website_event.session_id
      and session.website_id = website_event.website_id
    where website_event.website_id = {{websiteId::uuid}}
    ${dateQuery}
    ${filterQuery}
    ${searchQuery}
    group by session.session_id,
      session.website_id,
      website_event.hostname,
      session.browser,
      session.os,
      session.device,
      session.screen,
      session.language,
      session.country,
      session.region,
      session.city
    order by max(website_event.created_at) desc
    `,
    queryParams,
    filters,
    FUNCTION_NAME,
  );
}

async function clickhouseQuery(websiteId: string, filters: QueryFilters) {
  const { pagedRawQuery, parseFilters, getDateStringSQL } = clickhouse;
  const { search } = filters;
  const { filterQuery, dateQuery, cohortQuery, queryParams } = parseFilters({
    ...filters,
    websiteId,
  });

  const searchQuery = search
    ? `and ((positionCaseInsensitive(distinct_id, {search:String}) > 0)
           or (positionCaseInsensitive(city, {search:String}) > 0)
           or (positionCaseInsensitive(browser, {search:String}) > 0)
           or (positionCaseInsensitive(os, {search:String}) > 0)
           or (positionCaseInsensitive(device, {search:String}) > 0))`
    : '';

  let sql = '';

  if (EVENT_COLUMNS.some(item => Object.keys(filters).includes(item))) {
    sql = `
    select
      session_id as id,
      website_id as websiteId,
      hostname,
      browser,
      os,
      device,
      screen,
      language,
      country,
      region,
      city,
      ${getDateStringSQL('min(created_at)')} as firstAt,
      ${getDateStringSQL('max(created_at)')} as lastAt,
      uniq(visit_id) as visits,
      sumIf(1, event_type = 1) as views,
      sumIf(1, event_type = 2) as events,
      lastAt as createdAt
    from website_event
    ${cohortQuery}
    where website_id = {websiteId:UUID}
    ${dateQuery}
    ${filterQuery}
    ${searchQuery}
    group by session_id, website_id, hostname, browser, os, device, screen, language, country, region, city
    order by lastAt desc
    `;
  } else {
    sql = `
    select
      session_id as id,
      website_id as websiteId,
      arrayFirst(x -> 1, hostname) hostname,
      browser,
      os,
      device,
      screen,
      language,
      country,
      region,
      city,
      ${getDateStringSQL('min(min_time)')} as firstAt,
      ${getDateStringSQL('max(max_time)')} as lastAt,
      uniq(visit_id) as visits,
      sumIf(views, event_type = 1) as views,
      sum(length(event_name)) as events,
      lastAt as createdAt
    from website_event_stats_hourly as website_event
    ${cohortQuery}
    where website_id = {websiteId:UUID}
    ${dateQuery}
    ${filterQuery}
    ${searchQuery}
    group by session_id, website_id, hostname, browser, os, device, screen, language, country, region, city
    order by lastAt desc
    `;
  }

  return pagedRawQuery(sql, queryParams, filters, FUNCTION_NAME);
}
