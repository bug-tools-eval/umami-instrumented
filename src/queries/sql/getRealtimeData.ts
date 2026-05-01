import type { QueryFilters } from '@/lib/types';
import { getRealtimeActivity } from '@/queries/sql/getRealtimeActivity';
import { getPageviewStats } from '@/queries/sql/pageviews/getPageviewStats';
import { getSessionStats } from '@/queries/sql/sessions/getSessionStats';

function increment(data: object, key: string) {
  if (key) {
    if (!data[key]) {
      data[key] = 1;
    } else {
      data[key] += 1;
    }
  }
}

export async function getRealtimeData(websiteId: string, filters: QueryFilters) {
  const [activity, pageviews, sessions] = await Promise.all([
    getRealtimeActivity(websiteId, filters),
    getPageviewStats(websiteId, filters),
    getSessionStats(websiteId, filters),
  ]);

  const uniques = new Set();
  const countries = {};
  const urls = {};
  const referrers = {};
  const events = [];
  let eventCount = 0;
  let countryCount = 0;

  for (let i = activity.length - 1; i >= 0; i--) {
    const event = activity[i];
    const { sessionId, urlPath, referrerDomain, country, eventName } = event;

    if (!uniques.has(sessionId)) {
      uniques.add(sessionId);

      if (country && !countries[country]) {
        countryCount += 1;
      }

      increment(countries, country);

      events.push({ __type: 'session', ...event });
    }

    increment(urls, urlPath);
    increment(referrers, referrerDomain);

    if (eventName) {
      eventCount += 1;
    }

    events.push({ __type: eventName ? 'event' : 'pageview', ...event });
  }

  return {
    countries,
    urls,
    referrers,
    events: events.reverse(),
    series: {
      views: pageviews,
      visitors: sessions,
    },
    totals: {
      views: sumY(pageviews),
      visitors: sumY(sessions),
      events: eventCount,
      countries: countryCount,
    },
    timestamp: Date.now(),
  };
}

function sumY(data: { y: number }[]) {
  let sum = 0;

  for (const { y } of data) {
    sum += Number(y);
  }

  return sum;
}
