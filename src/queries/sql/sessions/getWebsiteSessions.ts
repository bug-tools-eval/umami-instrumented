import clickhouse from '@/lib/clickhouse';
import { DEFAULT_PAGE_SIZE, EVENT_COLUMNS } from '@/lib/constants';
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
  const { rawQuery, parseFilters } = prisma;
  const { search } = filters;
  const { page = 1, pageSize, orderBy, sortDescending = false } = filters;
  const size = +pageSize || DEFAULT_PAGE_SIZE;
  const offset = +size * (+page - 1);
  const direction = sortDescending ? 'desc' : 'asc';
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

  const statements = [
    orderBy && `order by ${orderBy} ${direction}`,
    +size > 0 && `limit ${+size} offset ${offset}`,
  ]
    .filter(n => n)
    .join('\n');
  const pagination = +size > 0 ? `limit ${+size} offset ${offset}` : '';

  const groupByQuery = `
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
  `;

  const defaultDataQuery = `
    with page_sessions as (
      select
        session.session_id,
        session.website_id,
        website_event.hostname,
        session.browser,
        session.os,
        session.device,
        session.screen,
        session.language,
        session.country,
        session.region,
        session.city,
        max(website_event.created_at) as "createdAt"
      from website_event
      ${cohortQuery}
      join session on session.session_id = website_event.session_id
        and session.website_id = website_event.website_id
      where website_event.website_id = {{websiteId::uuid}}
      ${dateQuery}
      ${filterQuery}
      ${searchQuery}
      ${groupByQuery}
      order by max(website_event.created_at) desc
      ${pagination}
    )
    select
      page_sessions.session_id as "id",
      page_sessions.website_id as "websiteId",
      page_sessions.hostname,
      page_sessions.browser,
      page_sessions.os,
      page_sessions.device,
      page_sessions.screen,
      page_sessions.language,
      page_sessions.country,
      page_sessions.region,
      page_sessions.city,
      min(website_event.created_at) as "firstAt",
      max(website_event.created_at) as "lastAt",
      count(distinct website_event.visit_id) as "visits",
      sum(case when website_event.event_type = 1 then 1 else 0 end) as "views",
      sum(case when website_event.event_type = 2 then 1 else 0 end) as "events",
      max(website_event.created_at) as "createdAt"
    from page_sessions
    join website_event on website_event.session_id = page_sessions.session_id
      and website_event.website_id = page_sessions.website_id
      and website_event.hostname is not distinct from page_sessions.hostname
    join session on session.session_id = website_event.session_id
      and session.website_id = website_event.website_id
    where website_event.website_id = {{websiteId::uuid}}
    ${dateQuery}
    ${filterQuery}
    ${searchQuery}
    group by
      page_sessions.session_id,
      page_sessions.website_id,
      page_sessions.hostname,
      page_sessions.browser,
      page_sessions.os,
      page_sessions.device,
      page_sessions.screen,
      page_sessions.language,
      page_sessions.country,
      page_sessions.region,
      page_sessions.city,
      page_sessions."createdAt"
    order by page_sessions."createdAt" desc
  `;

  const orderedDataQuery = `
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
    ${groupByQuery}
    order by max(website_event.created_at) desc
  `;
  const dataQuery = orderBy ? `${orderedDataQuery}${statements}` : defaultDataQuery;

  const countQuery = `
    select count(*) as num
    from (
      select 1
      from website_event
      ${cohortQuery}
      join session on session.session_id = website_event.session_id
        and session.website_id = website_event.website_id
      where website_event.website_id = {{websiteId::uuid}}
      ${dateQuery}
      ${filterQuery}
      ${searchQuery}
      ${groupByQuery}
    ) as t
  `;

  const [count, data] = await Promise.all([
    rawQuery(countQuery, queryParams).then(res => res[0].num),
    rawQuery(dataQuery, queryParams, FUNCTION_NAME),
  ]);

  return { data, count, page: +page, pageSize: size, orderBy };
}

async function clickhouseQuery(websiteId: string, filters: QueryFilters) {
  const { rawQuery, parseFilters, getDateStringSQL } = clickhouse;
  const { search } = filters;
  const { page = 1, pageSize, orderBy, sortDescending = false } = filters;
  const size = +pageSize || DEFAULT_PAGE_SIZE;
  const offset = +size * (+page - 1);
  const direction = sortDescending ? 'desc' : 'asc';
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
  let countSql = '';

  const statements = [
    orderBy && `order by ${orderBy} ${direction}`,
    +size > 0 && `limit ${+size} offset ${+offset}`,
  ]
    .filter(n => n)
    .join('\n');

  if (EVENT_COLUMNS.some(item => Object.keys(filters).includes(item))) {
    const groupByQuery =
      'group by session_id, website_id, hostname, browser, os, device, screen, language, country, region, city';

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
    ${groupByQuery}
    order by lastAt desc
    `;

    countSql = `
    select count(*) as num
    from (
      select 1
      from website_event
      ${cohortQuery}
      where website_id = {websiteId:UUID}
      ${dateQuery}
      ${filterQuery}
      ${searchQuery}
      ${groupByQuery}
    ) as t
    `;
  } else {
    const groupByQuery =
      'group by session_id, website_id, hostname, browser, os, device, screen, language, country, region, city';

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
    ${groupByQuery}
    order by lastAt desc
    `;

    countSql = `
    select count(*) as num
    from (
      select 1
      from website_event_stats_hourly as website_event
      ${cohortQuery}
      where website_id = {websiteId:UUID}
      ${dateQuery}
      ${filterQuery}
      ${searchQuery}
      ${groupByQuery}
    ) as t
    `;
  }

  const [count, data] = await Promise.all([
    rawQuery<Array<{ num: number }>>(countSql, queryParams).then(res => res[0].num),
    rawQuery(`${sql}${statements}`, queryParams, FUNCTION_NAME),
  ]);

  return { data, count, page: +page, pageSize: size, orderBy, search };
}
