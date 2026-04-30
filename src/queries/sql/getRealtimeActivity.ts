import clickhouse from '@/lib/clickhouse';
import { SESSION_COLUMNS } from '@/lib/constants';
import { CLICKHOUSE, PRISMA, runQuery } from '@/lib/db';
import prisma from '@/lib/prisma';
import type { QueryFilters } from '@/lib/types';

const FUNCTION_NAME = 'getRealtimeActivity';

export async function getRealtimeActivity(...args: [websiteId: string, filters: QueryFilters]) {
  return runQuery({
    [PRISMA]: () => relationalQuery(...args),
    [CLICKHOUSE]: () => clickhouseQuery(...args),
  });
}

async function relationalQuery(websiteId: string, filters: QueryFilters) {
  const { rawQuery, parseFilters } = prisma;
  const { queryParams, filterQuery, cohortQuery, dateQuery } = parseFilters({
    ...filters,
    websiteId,
  });

  const hasSessionFilter = SESSION_COLUMNS.some(col => filters[col] != null);

  // Fast path: when no filter references session columns, push the LIMIT and
  // ORDER BY into a website_event-only subquery so the join sees only the 100
  // most recent rows. This avoids hashing the entire 16k-row session table on
  // every poll (and drops planner cost — outer shape is simpler).
  if (!hasSessionFilter && !cohortQuery) {
    return rawQuery(
      `
      select
        we.session_id as "sessionId",
        we.event_name as "eventName",
        we.created_at as "createdAt",
        session.browser,
        session.os,
        session.device,
        session.country,
        we.url_path as "urlPath",
        we.referrer_domain as "referrerDomain",
        we.hostname
      from (
        select website_event.*
        from website_event
        where website_event.website_id = {{websiteId::uuid}}
        ${filterQuery}
        ${dateQuery}
        order by website_event.created_at desc
        limit 100
      ) we
      inner join session
        on session.session_id = we.session_id
          and session.website_id = we.website_id
      order by we.created_at desc
      `,
      queryParams,
      FUNCTION_NAME,
    );
  }

  return rawQuery(
    `
    select
        website_event.session_id as "sessionId",
        website_event.event_name as "eventName",
        website_event.created_at as "createdAt",
        session.browser,
        session.os,
        session.device,
        session.country,
        website_event.url_path as "urlPath",
        website_event.referrer_domain as "referrerDomain",
        website_event.hostname
    from website_event
    ${cohortQuery}
    inner join session
      on session.session_id = website_event.session_id
        and session.website_id = website_event.website_id
    where website_event.website_id = {{websiteId::uuid}}
    ${filterQuery}
    ${dateQuery}
    order by website_event.created_at desc
    limit 100
    `,
    queryParams,
    FUNCTION_NAME,
  );
}

async function clickhouseQuery(websiteId: string, filters: QueryFilters): Promise<{ x: number }> {
  const { rawQuery, parseFilters } = clickhouse;
  const { queryParams, filterQuery, cohortQuery, dateQuery } = parseFilters({
    ...filters,
    websiteId,
  });

  return rawQuery(
    `
        select
            session_id as sessionId,
            event_name as eventName,
            created_at as createdAt,
            browser,
            os,
            device,
            country,
            url_path as urlPath,
            referrer_domain as referrerDomain,
            hostname
        from website_event
        ${cohortQuery}
        where website_id = {websiteId:UUID}
        ${filterQuery}
        ${dateQuery}
        order by createdAt desc
        limit 100
    `,
    queryParams,
    FUNCTION_NAME,
  );
}
