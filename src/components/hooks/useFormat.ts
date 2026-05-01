import { useCallback, useMemo } from 'react';
import { BROWSERS, OS_NAMES } from '@/lib/constants';
import regions from '../../../public/iso-3166-2.json';
import { useCountryNames } from './useCountryNames';
import { useLanguageNames } from './useLanguageNames';
import { useLocale } from './useLocale';
import { useMessages } from './useMessages';

export function useFormat() {
  const { t, labels } = useMessages();
  const { locale } = useLocale();
  const { countryNames } = useCountryNames(locale);
  const { languageNames } = useLanguageNames(locale);

  const formatOS = useCallback((value: string): string => {
    return OS_NAMES[value] || value;
  }, []);

  const formatBrowser = useCallback((value: string): string => {
    return BROWSERS[value] || value;
  }, []);

  const formatDevice = useCallback(
    (value: string): string => {
      return t(labels[value] || labels.unknown);
    },
    [labels, t],
  );

  const formatCountry = useCallback(
    (value: string): string => {
      return countryNames[value] || value;
    },
    [countryNames],
  );

  const formatRegion = useCallback(
    (value?: string): string => {
      const [country] = value?.split('-') || [];
      return regions[value] ? `${regions[value]}, ${countryNames[country]}` : value;
    },
    [countryNames],
  );

  const formatCity = useCallback(
    (value: string, country?: string): string => {
      return countryNames[country] ? `${value}, ${countryNames[country]}` : value;
    },
    [countryNames],
  );

  const formatLanguage = useCallback(
    (value: string): string => {
      return languageNames[value?.split('-')[0]] || value;
    },
    [languageNames],
  );

  const formatValue = useCallback(
    (value: string, type: string, data?: Record<string, any>): string => {
      switch (type) {
        case 'os':
          return formatOS(value);
        case 'browser':
          return formatBrowser(value);
        case 'device':
          return formatDevice(value);
        case 'country':
          return formatCountry(value);
        case 'region':
          return formatRegion(value);
        case 'city':
          return formatCity(value, data?.country);
        case 'language':
          return formatLanguage(value);
        default:
          return typeof value === 'string' ? value : undefined;
      }
    },
    [
      formatBrowser,
      formatCity,
      formatCountry,
      formatDevice,
      formatLanguage,
      formatOS,
      formatRegion,
    ],
  );

  return useMemo(
    () => ({
      formatOS,
      formatBrowser,
      formatDevice,
      formatCountry,
      formatRegion,
      formatCity,
      formatLanguage,
      formatValue,
    }),
    [
      formatBrowser,
      formatCity,
      formatCountry,
      formatDevice,
      formatLanguage,
      formatOS,
      formatRegion,
      formatValue,
    ],
  );
}
