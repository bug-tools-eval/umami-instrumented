import { Column, Grid, Icon, Row, Text } from '@umami/react-zen';
import { type ReactNode, useMemo } from 'react';
import { LoadingPanel } from '@/components/common/LoadingPanel';
import { Panel } from '@/components/common/Panel';
import { useLocale, useMessages, useResultQuery } from '@/components/hooks';
import { Users } from '@/components/icons';
import { formatDate } from '@/lib/date';
import { formatLongNumber } from '@/lib/format';

const DAYS = [1, 2, 3, 4, 5, 6, 7, 14, 21, 28];

export interface RetentionProps {
  websiteId: string;
  startDate: Date;
  endDate: Date;
  days?: number[];
}

export function Retention({ websiteId, days = DAYS, startDate, endDate }: RetentionProps) {
  const { t, labels } = useMessages();
  const { locale } = useLocale();
  const { data, error, isLoading } = useResultQuery('retention', {
    websiteId,
    startDate,
    endDate,
  });

  const rows = useMemo(() => {
    if (!data) {
      return [];
    }

    const recordsByDate = new Map<string, Map<number, any>>();

    for (const row of data as { date: string; day: number }[]) {
      let records = recordsByDate.get(row.date);

      if (!records) {
        records = new Map();
        recordsByDate.set(row.date, records);
      }

      records.set(row.day, row);
    }

    return (data as { date: string; visitors: number; day: number }[])
      .filter(({ day }) => day === 0)
      .map(({ date, visitors }) => ({
        date,
        visitors,
        records: recordsByDate.get(date),
      }));
  }, [data]);

  const totalDays = rows.length;

  return (
    <LoadingPanel data={data} isLoading={isLoading} error={error}>
      {data && (
        <Panel allowFullscreen height="900px">
          <Column
            paddingY="6"
            paddingX={{ base: '3', md: '6' }}
            position="absolute"
            top="40px"
            left="0"
            right="0"
            bottom="0"
          >
            <Column gap="1" overflow="auto">
              <Grid
                columns="120px repeat(10, 100px)"
                alignItems="center"
                gap="1"
                height="50px"
                width="max-content"
                minWidth="100%"
                autoFlow="column"
              >
                <Column>
                  <Text weight="bold" align="center">
                    {t(labels.cohort)}
                  </Text>
                </Column>
                {days.map(n => (
                  <Column key={n}>
                    <Text weight="bold" align="center" wrap="nowrap">
                      {t(labels.day)} {n}
                    </Text>
                  </Column>
                ))}
              </Grid>
              {rows.map(({ date, visitors, records }: any, rowIndex: number) => {
                return (
                  <Grid
                    key={rowIndex}
                    columns="120px repeat(10, 100px)"
                    gap="1"
                    autoFlow="column"
                    width="max-content"
                    minWidth="100%"
                  >
                    <Column justifyContent="center" gap="1">
                      <Text weight="bold">{formatDate(date, 'PP', locale)}</Text>
                      <Row alignItems="center" gap>
                        <Icon>
                          <Users />
                        </Icon>
                        <Text>{formatLongNumber(visitors)}</Text>
                      </Row>
                    </Column>
                    {days.map(day => {
                      if (totalDays - rowIndex < day) {
                        return null;
                      }
                      const percentage = records.get(day)?.percentage;
                      return (
                        <Cell key={day}>
                          {percentage ? `${Number(percentage).toFixed(2)}%` : ''}
                        </Cell>
                      );
                    })}
                  </Grid>
                );
              })}
            </Column>
          </Column>
        </Panel>
      )}
    </LoadingPanel>
  );
}

const Cell = ({ children }: { children: ReactNode }) => {
  return (
    <Column
      justifyContent="center"
      alignItems="center"
      width="100px"
      height="100px"
      backgroundColor="surface-raised"
      borderRadius
    >
      {children}
    </Column>
  );
};
