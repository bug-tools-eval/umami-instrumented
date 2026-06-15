import { useEffect, useState } from 'react';
import { httpGet } from '@/lib/fetch';
import enUS from '../../../public/intl/country/en-US.json';

const countryNames = {
  'en-US': enUS,
};

const countryNameRequests: Record<string, Promise<Record<string, string>>> = {};

function loadCountryNames(locale: string) {
  if (!countryNameRequests[locale]) {
    countryNameRequests[locale] = httpGet(
      `${process.env.basePath || ''}/intl/country/${locale}.json`,
    )
      .then(({ data }) => {
        if (data) {
          countryNames[locale] = data;

          return data;
        }

        return enUS;
      })
      .catch(() => enUS)
      .finally(() => {
        delete countryNameRequests[locale];
      });
  }

  return countryNameRequests[locale];
}

export function useCountryNames(locale: string) {
  const [list, setList] = useState(countryNames[locale] || enUS);

  useEffect(() => {
    let mounted = true;

    if (countryNames[locale]) {
      setList(countryNames[locale]);
      return;
    }

    loadCountryNames(locale).then(data => {
      if (mounted) {
        setList(data);
      }
    });

    return () => {
      mounted = false;
    };
  }, [locale]);

  return { countryNames: list };
}
