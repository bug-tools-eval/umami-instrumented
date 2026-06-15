import { EVENT_COLUMN_SET, FILTER_COLUMNS, OPERATORS } from '@/lib/constants';
import type { Filter, Operator, QueryFilters, QueryOptions } from '@/lib/types';

const OPERATOR_VALUES = Object.values(OPERATORS).join('|');
const OPERATOR_REGEX = new RegExp(`^(${OPERATOR_VALUES})\\.(.*)$`);
const EQUALS_OPERATORS = new Set([OPERATORS.equals, OPERATORS.notEquals]);
const SEARCH_OPERATORS = new Set([
  OPERATORS.contains,
  OPERATORS.doesNotContain,
  OPERATORS.regex,
  OPERATORS.notRegex,
]);

export function parseFilterValue(param: any) {
  if (typeof param === 'string') {
    const [, operator, value] = param.match(OPERATOR_REGEX) || [];

    const resolvedOperator = (operator || OPERATORS.equals) as Operator;
    const resolvedValue = value ?? param;

    if (resolvedOperator === OPERATORS.equals || resolvedOperator === OPERATORS.notEquals) {
      return { operator: resolvedOperator, value: resolvedValue.split(',') };
    }

    return { operator: resolvedOperator, value: resolvedValue };
  }

  if (Array.isArray(param)) {
    return { operator: OPERATORS.equals, value: param };
  }

  return { operator: OPERATORS.equals, value: [param] };
}

export function isEqualsOperator(operator: any) {
  return EQUALS_OPERATORS.has(operator);
}

export function isSearchOperator(operator: any) {
  return SEARCH_OPERATORS.has(operator);
}

export function hasEventFilter(filters: QueryFilters) {
  if (!filters) {
    return false;
  }

  for (const key of Object.keys(filters)) {
    if (EVENT_COLUMN_SET.has(key)) {
      return true;
    }
  }

  return false;
}

export function filtersObjectToArray(filters: QueryFilters, options: QueryOptions = {}): Filter[] {
  if (!filters) {
    return [];
  }

  const items: Filter[] = [];

  for (const key of Object.keys(filters)) {
    const filter = filters[key];

    if (filter === undefined || filter === null) {
      continue;
    }

    const baseName = key.replace(/\d+$/, '');
    const paramName = key !== baseName ? key : undefined;

    if (filter?.name && filter?.value !== undefined) {
      items.push({
        ...filter,
        column: options?.columns?.[baseName] ?? FILTER_COLUMNS[baseName],
        paramName: paramName ?? filter.paramName,
      });

      continue;
    }

    const { operator, value } = parseFilterValue(filter);

    items.push({
      name: baseName,
      paramName,
      column: options?.columns?.[baseName] ?? FILTER_COLUMNS[baseName],
      operator,
      value,
      prefix: options?.prefix,
    });
  }

  return items;
}

export function filtersArrayToObject(filters: Filter[]) {
  const nameCounts: Record<string, number> = {};
  return filters.reduce((obj, filter: Filter) => {
    const { name, operator, value } = filter;
    const count = nameCounts[name] ?? 0;
    const key = count === 0 ? name : `${name}${count}`;
    nameCounts[name] = count + 1;

    obj[key] = `${operator}.${Array.isArray(value) ? value.join(',') : value}`;

    return obj;
  }, {});
}
