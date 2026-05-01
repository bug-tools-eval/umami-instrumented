import { useCountryNames } from '@/components/hooks/useCountryNames';
import { useRegionNames } from '@/components/hooks/useRegionNames';
import { useApi } from '../useApi';
import { useLocale } from '../useLocale';

export function useWebsiteValuesQuery({
  websiteId,
  type,
  startDate,
  endDate,
  search,
}: {
  websiteId: string;
  type: string;
  startDate: Date;
  endDate: Date;
  search?: string;
}) {
  const { get, useQuery } = useApi();
  const { locale } = useLocale();
  const { countryNames } = useCountryNames(locale);
  const { regionNames } = useRegionNames(locale);

  const names = {
    country: countryNames,
    region: regionNames,
  };

  const getSearch = (type: string, value: string) => {
    if (value) {
      const values = names[type];

      if (values) {
        const matches: string[] = [];
        const search = value.toLowerCase();

        for (const key of Object.keys(values)) {
          if (values[key].toLowerCase().includes(search)) {
            matches.push(key);

            if (matches.length >= 5) {
              break;
            }
          }
        }

        return matches.join(',') || value;
      }

      return value;
    }
  };

  return useQuery({
    queryKey: ['websites:values', { websiteId, type, startDate, endDate, search }],
    queryFn: () =>
      get(`/websites/${websiteId}/values`, {
        type,
        startAt: +startDate,
        endAt: +endDate,
        search: getSearch(type, search),
      }),
    enabled: !!(websiteId && type && startDate && endDate),
  });
}
