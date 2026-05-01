import { OPERATORS } from '../constants';
import {
  filtersArrayToObject,
  filtersObjectToArray,
  isEqualsOperator,
  isSearchOperator,
  parseFilterValue,
} from '../params';

test('parseFilterValue resolves operators and values', () => {
  expect(parseFilterValue('c./docs')).toEqual({
    operator: OPERATORS.contains,
    value: '/docs',
  });
  expect(parseFilterValue('/home,/pricing')).toEqual({
    operator: OPERATORS.equals,
    value: ['/home', '/pricing'],
  });
});

test('operator helpers identify equals and search operators', () => {
  expect(isEqualsOperator(OPERATORS.equals)).toBe(true);
  expect(isEqualsOperator(OPERATORS.contains)).toBe(false);
  expect(isSearchOperator(OPERATORS.regex)).toBe(true);
  expect(isSearchOperator(OPERATORS.notEquals)).toBe(false);
});

test('filtersObjectToArray preserves filter metadata', () => {
  expect(
    filtersObjectToArray({
      path: 'eq./home',
      browser1: {
        name: 'browser',
        operator: OPERATORS.contains,
        value: 'Chrome',
      },
    } as any),
  ).toEqual([
    {
      name: 'path',
      paramName: undefined,
      column: 'url_path',
      operator: OPERATORS.equals,
      value: ['/home'],
      prefix: undefined,
    },
    {
      name: 'browser',
      operator: OPERATORS.contains,
      value: 'Chrome',
      column: 'browser',
      paramName: 'browser1',
    },
  ]);
});

test('filtersArrayToObject serializes duplicate filter names', () => {
  expect(
    filtersArrayToObject([
      { name: 'path', operator: OPERATORS.equals, value: ['/home'] },
      { name: 'path', operator: OPERATORS.contains, value: 'docs' },
    ]),
  ).toEqual({
    path: 'eq./home',
    path1: 'c.docs',
  });
});
