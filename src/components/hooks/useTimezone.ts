import { formatInTimeZone, utcToZonedTime, zonedTimeToUtc } from 'date-fns-tz';
import { useCallback, useMemo } from 'react';
import { TIMEZONE_CONFIG, TIMEZONE_LEGACY } from '@/lib/constants';
import { getTimezone } from '@/lib/date';
import { setItem } from '@/lib/storage';
import { setTimezone, useApp } from '@/store/app';
import { useLocale } from './useLocale';

const selector = (state: { timezone: string }) => state.timezone;
const timezoneDateRegex = /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{3})?Z$/;
const seriesFormatterCache = new Map<string, Intl.DateTimeFormat>();

function getSeriesFormatter(timezone: string) {
  const cached = seriesFormatterCache.get(timezone);

  if (cached) {
    return cached;
  }

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  seriesFormatterCache.set(timezone, formatter);

  return formatter;
}

export function useTimezone() {
  const timezone = useApp(selector);
  const localTimeZone = useMemo(getTimezone, []);
  const { dateLocale } = useLocale();

  const saveTimezone = useCallback((value: string) => {
    setItem(TIMEZONE_CONFIG, value);
    setTimezone(value);
  }, []);

  const formatTimezoneDate = useCallback(
    (date: string, pattern: string) => {
      return formatInTimeZone(
        timezoneDateRegex.test(date) ? date : `${date.split(' ').join('T')}Z`,
        timezone,
        pattern,
        { locale: dateLocale },
      );
    },
    [dateLocale, timezone],
  );

  const formatSeriesTimezone = useCallback((data: any, column: string, timezone: string) => {
    const formatter = getSeriesFormatter(timezone);

    return data.map(item => {
      const date = new Date(item[column]);
      const parts = formatter.formatToParts(date);
      const values: Record<string, string> = {};

      for (const part of parts) {
        values[part.type] = part.value;
      }

      return {
        ...item,
        [column]: `${values.year}-${values.month}-${values.day} ${values.hour}:${values.minute}:${values.second}`,
      };
    });
  }, []);

  const toUtc = useCallback(
    (date: Date | string | number) => {
      return zonedTimeToUtc(date, timezone);
    },
    [timezone],
  );

  const fromUtc = useCallback(
    (date: Date | string | number) => {
      return utcToZonedTime(date, timezone);
    },
    [timezone],
  );

  const localToUtc = useCallback(
    (date: Date | string | number) => {
      return zonedTimeToUtc(date, localTimeZone);
    },
    [localTimeZone],
  );

  const localFromUtc = useCallback(
    (date: Date | string | number) => {
      return utcToZonedTime(date, localTimeZone);
    },
    [localTimeZone],
  );

  const canonicalizeTimezone = useCallback((timezone: string): string => {
    return TIMEZONE_LEGACY[timezone] ?? timezone;
  }, []);

  return useMemo(
    () => ({
      timezone,
      localTimeZone,
      toUtc,
      fromUtc,
      localToUtc,
      localFromUtc,
      saveTimezone,
      formatTimezoneDate,
      formatSeriesTimezone,
      canonicalizeTimezone,
    }),
    [
      timezone,
      localTimeZone,
      toUtc,
      fromUtc,
      localToUtc,
      localFromUtc,
      saveTimezone,
      formatTimezoneDate,
      formatSeriesTimezone,
      canonicalizeTimezone,
    ],
  );
}
