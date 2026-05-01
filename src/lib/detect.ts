import path from 'node:path';
import { browserName, detectOS } from 'detect-browser';
import ipaddr from 'ipaddr.js';
import isLocalhost from 'is-localhost-ip';
import maxmind from 'maxmind';
import { UAParser } from 'ua-parser-js';
import { getIpAddress, stripPort } from '@/lib/ip';
import { safeDecodeURIComponent } from '@/lib/url';

const MAXMIND = 'maxmind';
let blockedIpCacheKey: string;
let blockedIpCache: {
  exact: Set<string>;
  cidr: ReturnType<typeof ipaddr.parseCIDR>[];
};

const PROVIDER_HEADERS = [
  // Umami custom headers (cloud mode only)
  ...(process.env.CLOUD_MODE
    ? [
        {
          countryHeader: 'x-umami-client-country',
          regionHeader: 'x-umami-client-region',
          cityHeader: 'x-umami-client-city',
        },
      ]
    : []),
  // Cloudflare headers
  {
    countryHeader: 'cf-ipcountry',
    regionHeader: 'cf-region-code',
    cityHeader: 'cf-ipcity',
  },
  // Vercel headers
  {
    countryHeader: 'x-vercel-ip-country',
    regionHeader: 'x-vercel-ip-country-region',
    cityHeader: 'x-vercel-ip-city',
  },
  // CloudFront headers
  {
    countryHeader: 'cloudfront-viewer-country',
    regionHeader: 'cloudfront-viewer-country-region',
    cityHeader: 'cloudfront-viewer-city',
  },
  // EdgeOne headers (requires custom request headers in Rule Priorities, see: https://edgeone.ai/document/46151)
  {
    countryHeader: 'eo-ipcountry',
    regionHeader: 'eo-region-code',
    cityHeader: 'eo-ipcity',
  },
];

export function getDevice(userAgent: string, screen: string = '') {
  const { device } = UAParser(userAgent);

  const type = device?.type || 'desktop';

  if (type === 'desktop' && screen) {
    const [width] = screen.split('x');

    if (+width <= 1920) {
      return 'laptop';
    }
  }

  return type;
}

function getBlockedIpList(ignoreIps: string) {
  if (blockedIpCacheKey === ignoreIps) {
    return blockedIpCache;
  }

  const exact = new Set<string>();
  const cidr: ReturnType<typeof ipaddr.parseCIDR>[] = [];

  for (const ip of ignoreIps.split(',')) {
    const value = ip.trim();

    if (value.indexOf('/') > 0) {
      cidr.push(ipaddr.parseCIDR(value));
    } else if (value) {
      exact.add(value);
    }
  }

  blockedIpCacheKey = ignoreIps;
  blockedIpCache = { exact, cidr };

  return blockedIpCache;
}

export function hasBlockedIp(clientIp: string) {
  const ignoreIps = process.env.IGNORE_IP;

  if (ignoreIps) {
    const { exact, cidr } = getBlockedIpList(ignoreIps);

    if (exact.has(clientIp)) {
      return true;
    }

    if (cidr.length > 0) {
      const addr = ipaddr.parse(clientIp);

      return cidr.some(range => addr.kind() === range[0].kind() && addr.match(range));
    }

    return false;
  }

  return false;
}

function getRegionCode(country: string, region: string) {
  if (!country || !region) {
    return undefined;
  }

  return region.includes('-') ? region : `${country}-${region}`;
}

function decodeHeader(s: string | undefined | null): string | undefined | null {
  if (s === undefined || s === null) {
    return s;
  }

  return Buffer.from(s, 'latin1').toString('utf-8');
}

export async function getLocation(ip: string = '', headers: Headers, skipHeaders: boolean) {
  // Ignore local ips
  if (!ip || (await isLocalhost(ip))) {
    return null;
  }

  if (!skipHeaders && !process.env.SKIP_LOCATION_HEADERS) {
    for (const provider of PROVIDER_HEADERS) {
      const countryHeader = headers.get(provider.countryHeader);
      if (countryHeader) {
        const country = decodeHeader(countryHeader);
        const region = decodeHeader(headers.get(provider.regionHeader));
        const city = decodeHeader(headers.get(provider.cityHeader));

        return {
          country,
          region: getRegionCode(country, region),
          city,
        };
      }
    }
  }

  // Database lookup
  if (!globalThis[MAXMIND]) {
    const dir = path.join(process.cwd(), 'geo');

    globalThis[MAXMIND] = await maxmind.open(
      process.env.GEOLITE_DB_PATH || path.resolve(dir, 'GeoLite2-City.mmdb'),
    );
  }

  const result = globalThis[MAXMIND]?.get(stripPort(ip));

  if (result) {
    const country = result.country?.iso_code ?? result?.registered_country?.iso_code;
    const region = result.subdivisions?.[0]?.iso_code;
    const city = result.city?.names?.en;

    return {
      country,
      region: getRegionCode(country, region),
      city,
    };
  }
}

export async function getClientInfo(request: Request, payload: Record<string, any>) {
  const userAgent = payload?.userAgent || request.headers.get('user-agent');
  const ip = payload?.ip || getIpAddress(request.headers);
  const location = await getLocation(ip, request.headers, !!payload?.ip);
  const country = safeDecodeURIComponent(location?.country);
  const region = safeDecodeURIComponent(location?.region);
  const city = safeDecodeURIComponent(location?.city);
  const browser = payload?.browser ?? browserName(userAgent);
  const os = payload?.os ?? (detectOS(userAgent) as string);
  const device = payload?.device ?? getDevice(userAgent, payload?.screen);

  return { userAgent, browser, os, ip, country, region, city, device };
}
