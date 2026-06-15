import { DATA_TYPE } from '../constants';
import { flattenJSON, objectToArray } from '../data';

test('flattenJSON flattens nested event data', () => {
  expect(
    flattenJSON({
      page: {
        title: 'Home',
      },
      count: 2,
      enabled: true,
      tags: ['analytics', 'dashboard'],
      createdAt: '2024-01-01T00:00:00.000Z',
    }),
  ).toEqual([
    { key: 'page.title', value: 'Home', dataType: DATA_TYPE.string },
    { key: 'count', value: 2, dataType: DATA_TYPE.number },
    { key: 'enabled', value: 'true', dataType: DATA_TYPE.boolean },
    {
      key: 'tags',
      value: JSON.stringify(['analytics', 'dashboard']),
      dataType: DATA_TYPE.array,
    },
    { key: 'createdAt', value: '2024-01-01T00:00:00.000Z', dataType: DATA_TYPE.date },
  ]);
});

test('objectToArray returns object values', () => {
  expect(objectToArray({ first: 1, second: 2 })).toEqual([1, 2]);
});
