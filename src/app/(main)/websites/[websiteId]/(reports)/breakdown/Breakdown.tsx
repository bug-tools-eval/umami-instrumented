import { Column, DataColumn, DataTable, Text } from '@umami/react-zen';
import { useMemo } from 'react';
import { LoadingPanel } from '@/components/common/LoadingPanel';
import { useFields, useFormat, useMessages, useResultQuery } from '@/components/hooks';
import { formatShortTime } from '@/lib/format';

export interface BreakdownProps {
  websiteId: string;
  startDate: Date;
  endDate: Date;
  selectedFields: string[];
}

export function Breakdown({ websiteId, selectedFields = [], startDate, endDate }: BreakdownProps) {
  const { t, labels } = useMessages();
  const { formatValue } = useFormat();
  const { fields } = useFields();
  // Index fields by name so each column lookup is O(1) instead of scanning
  // the fields array per selected field on every render.
  const fieldsByName = useMemo(() => new Map(fields.map(f => [f.name, f])), [fields]);
  const { data, error, isLoading } = useResultQuery<any>(
    'breakdown',
    {
      websiteId,
      startDate,
      endDate,
      fields: selectedFields,
    },
    { enabled: !!selectedFields.length },
  );

  return (
    <LoadingPanel data={data} isLoading={isLoading} error={error}>
      <Column overflow="auto" minHeight="0" height="100%">
        <DataTable data={data} style={{ tableLayout: 'fixed' }}>
          {selectedFields.map(field => {
            return (
              <DataColumn
                key={field}
                id={field}
                label={fieldsByName.get(field)?.label}
                width="minmax(120px, 1fr)"
              >
                {row => {
                  const value = formatValue(row[field], field);
                  return (
                    <Text truncate title={value}>
                      {value}
                    </Text>
                  );
                }}
              </DataColumn>
            );
          })}
          <DataColumn id="visitors" label={t(labels.visitors)} align="end" width="120px">
            {row => row?.visitors?.toLocaleString()}
          </DataColumn>
          <DataColumn id="visits" label={t(labels.visits)} align="end" width="120px">
            {row => row?.visits?.toLocaleString()}
          </DataColumn>
          <DataColumn id="views" label={t(labels.views)} align="end" width="120px">
            {row => row?.views?.toLocaleString()}
          </DataColumn>
          <DataColumn id="bounceRate" label={t(labels.bounceRate)} align="end" width="120px">
            {row => {
              const n = (Math.min(row?.visits, row?.bounces) / row?.visits) * 100;
              return `${Math.round(+n)}%`;
            }}
          </DataColumn>
          <DataColumn id="visitDuration" label={t(labels.visitDuration)} align="end" width="120px">
            {row => {
              const n = row?.totaltime / row?.visits;
              return `${+n < 0 ? '-' : ''}${formatShortTime(Math.abs(~~n), ['m', 's'], ' ')}`;
            }}
          </DataColumn>
        </DataTable>
      </Column>
    </LoadingPanel>
  );
}
