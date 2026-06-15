import { generateTimeSeries, isValidTimezone } from '../date';

test('isValidTimezone validates IANA timezone names', () => {
  expect(isValidTimezone('Asia/Calcutta')).toBe(true);
  expect(isValidTimezone('Not/A_Timezone')).toBe(false);
});

test('generateTimeSeries fills missing intervals', () => {
  expect(
    generateTimeSeries(
      [{ x: '2024-01-02T00:00:00', y: 7, d: '2024-01-02T00:00:00' }],
      new Date(2024, 0, 1),
      new Date(2024, 0, 3),
      'day',
      'en-US',
    ),
  ).toEqual([
    { x: '2024-01-01', d: undefined, y: null },
    { x: '2024-01-02', d: '2024-01-02T00:00:00', y: 7 },
    { x: '2024-01-03', d: undefined, y: null },
  ]);
});
