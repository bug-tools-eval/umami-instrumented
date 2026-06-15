import { Column, Focusable, Icon, Row, Text, Tooltip, TooltipTrigger } from '@umami/react-zen';
import classNames from 'classnames';
import { useMemo, useState } from 'react';
import { firstBy } from 'thenby';
import { LoadingPanel } from '@/components/common/LoadingPanel';
import { useEscapeKey, useMessages, useResultQuery } from '@/components/hooks';
import { File } from '@/components/icons';
import { Lightning } from '@/components/svg';
import { objectToArray } from '@/lib/data';
import { formatLongNumber } from '@/lib/format';
import styles from './Journey.module.css';

const NODE_HEIGHT = 60;
const NODE_GAP = 10;
const LINE_WIDTH = 3;

export interface JourneyProps {
  websiteId: string;
  startDate: Date;
  endDate: Date;
  steps: number;
  startStep?: string;
  endStep?: string;
  view: string;
}

const EVENT_TYPES = {
  views: 1,
  events: 2,
};

export function Journey({ websiteId, steps, startStep, endStep, view }: JourneyProps) {
  const [selectedNode, setSelectedNode] = useState(null);
  const [activeNode, setActiveNode] = useState(null);
  const { t, labels } = useMessages();
  const { data, error, isLoading } = useResultQuery<any>('journey', {
    websiteId,
    steps,
    startStep,
    endStep,
    view,
    eventType: EVENT_TYPES[view],
  });

  useEscapeKey(() => setSelectedNode(null));

  const columns = useMemo(() => {
    if (!data) {
      return [];
    }

    const selectedPaths = selectedNode?.paths ?? [];
    const activePaths = activeNode?.paths ?? [];
    const columns = [];
    const stepCount = +steps;
    const pathsByColumn = Array.from({ length: stepCount }, () => new Map<string, any[]>());
    const selectedNamesByColumn = Array.from({ length: stepCount }, () => new Set<string>());
    const activeNamesByColumn = Array.from({ length: stepCount }, () => new Set<string>());
    const selectedTransitionCounts = Array.from(
      { length: stepCount },
      () => new Map<string, number>(),
    );
    const activeTransitionsByColumn = Array.from({ length: stepCount }, () => new Set<string>());

    for (const path of data) {
      for (let columnIndex = 0; columnIndex < stepCount; columnIndex++) {
        const name = path.items[columnIndex];

        if (!name) {
          continue;
        }

        const paths = pathsByColumn[columnIndex].get(name);

        if (paths) {
          paths.push(path);
        } else {
          pathsByColumn[columnIndex].set(name, [path]);
        }
      }
    }

    for (const path of selectedPaths) {
      for (let columnIndex = 0; columnIndex < stepCount; columnIndex++) {
        const name = path.items[columnIndex];

        if (name) {
          selectedNamesByColumn[columnIndex].add(name);
        }

        if (columnIndex > 0) {
          const previousName = path.items[columnIndex - 1];

          if (previousName && name) {
            const key = `${previousName}\0${name}`;
            const counts = selectedTransitionCounts[columnIndex];
            counts.set(key, (counts.get(key) || 0) + path.count);
          }
        }
      }
    }

    for (const path of activePaths) {
      for (let columnIndex = 0; columnIndex < stepCount; columnIndex++) {
        const name = path.items[columnIndex];

        if (name) {
          activeNamesByColumn[columnIndex].add(name);
        }

        if (columnIndex > 0) {
          const previousName = path.items[columnIndex - 1];

          if (previousName && name) {
            activeTransitionsByColumn[columnIndex].add(`${previousName}\0${name}`);
          }
        }
      }
    }

    for (let columnIndex = 0; columnIndex < stepCount; columnIndex++) {
      const nodes = {};

      data.forEach(({ items, count }: any, nodeIndex: any) => {
        const name = items[columnIndex];

        if (name) {
          const selected = selectedNamesByColumn[columnIndex].has(name);
          const active = selected && activeNamesByColumn[columnIndex].has(name);

          if (!nodes[name]) {
            const paths = pathsByColumn[columnIndex].get(name);

            nodes[name] = {
              name,
              count,
              totalCount: count,
              nodeIndex,
              columnIndex,
              selected,
              active,
              paths,
              pathMap: paths.map(({ items, count }) => ({
                [`${columnIndex}:${items.join(':')}`]: count,
              })),
            };
          } else {
            nodes[name].totalCount += count;
          }
        }
      });

      columns.push({
        nodes: objectToArray(nodes).sort(firstBy('total', -1)),
      });
    }

    columns.forEach((column, columnIndex) => {
      const nodes = column.nodes.map(
        (
          currentNode: { totalCount: number; name: string; selected: boolean },
          currentNodeIndex: any,
        ) => {
          const previousNodes = columns[columnIndex - 1]?.nodes;
          let selectedCount = previousNodes ? 0 : currentNode.totalCount;
          let activeCount = selectedCount;

          const lines =
            previousNodes?.reduce((arr: any[][], previousNode: any, previousNodeIndex: number) => {
              const transitionKey = `${previousNode.name}\0${currentNode.name}`;
              const fromCount = selectedTransitionCounts[columnIndex].get(transitionKey);

              if (currentNode.selected && previousNode.selected && fromCount) {
                arr.push([
                  previousNodeIndex,
                  currentNodeIndex,
                  activeTransitionsByColumn[columnIndex].has(transitionKey),
                ]);
                selectedCount += fromCount;

                if (previousNode.active) {
                  activeCount += fromCount;
                }
              }

              return arr;
            }, []) || [];

          return { ...currentNode, selectedCount, activeCount, lines };
        },
      );

      const visitorCount = nodes.reduce(
        (sum: number, { selected, selectedCount, active, activeCount, totalCount }) => {
          if (!selectedNode) {
            sum += totalCount;
          } else if (!activeNode && selectedNode && selected) {
            sum += selectedCount;
          } else if (activeNode && active) {
            sum += activeCount;
          }
          return sum;
        },
        0,
      );

      const previousTotal = columns[columnIndex - 1]?.visitorCount ?? 0;
      const dropOff =
        previousTotal > 0 ? ((visitorCount - previousTotal) / previousTotal) * 100 : 0;

      Object.assign(column, { nodes, visitorCount, dropOff });
    });

    return columns;
  }, [data, selectedNode, activeNode, steps]);

  const handleClick = (name: string, columnIndex: number, paths: any[]) => {
    if (name !== selectedNode?.name || columnIndex !== selectedNode?.columnIndex) {
      setSelectedNode({ name, columnIndex, paths });
    } else {
      setSelectedNode(null);
    }
    setActiveNode(null);
  };

  return (
    <LoadingPanel data={data} isLoading={isLoading} error={error} height="100%">
      <div className={styles.container}>
        <div className={styles.view}>
          {columns.map(({ visitorCount, nodes }, columnIndex) => {
            return (
              <div
                key={columnIndex}
                className={classNames(styles.column, {
                  [styles.selected]: selectedNode,
                  [styles.active]: activeNode,
                })}
              >
                <div className={styles.header}>
                  <div className={styles.num}>{columnIndex + 1}</div>
                  <div className={styles.stats}>
                    <div className={styles.visitors} title={visitorCount}>
                      {formatLongNumber(visitorCount)} {t(labels.visitors)}
                    </div>
                  </div>
                </div>
                <div className={styles.nodes}>
                  {nodes.map(
                    ({
                      name,
                      totalCount,
                      selected,
                      active,
                      paths,
                      activeCount,
                      selectedCount,
                      lines,
                    }) => {
                      const nodeCount = selected
                        ? active
                          ? activeCount
                          : selectedCount
                        : totalCount;

                      const remaining =
                        columnIndex > 0
                          ? Math.round((nodeCount / columns[columnIndex - 1]?.visitorCount) * 100)
                          : 0;

                      const dropped = 100 - remaining;

                      return (
                        <div
                          key={name}
                          className={styles.wrapper}
                          onMouseEnter={() =>
                            selected && setActiveNode({ name, columnIndex, paths })
                          }
                          onMouseLeave={() => selected && setActiveNode(null)}
                        >
                          <div
                            className={classNames(styles.node, {
                              [styles.selected]: selected,
                              [styles.active]: active,
                            })}
                            onClick={() => handleClick(name, columnIndex, paths)}
                          >
                            <Row alignItems="center" className={styles.name} title={name} gap>
                              <Icon>{name.startsWith('/') ? <File /> : <Lightning />}</Icon>
                              <Text truncate>{name}</Text>
                            </Row>
                            <div className={styles.count} title={nodeCount}>
                              <TooltipTrigger
                                delay={0}
                                isDisabled={columnIndex === 0 || (selectedNode && !selected)}
                              >
                                <Focusable>
                                  <div>{formatLongNumber(nodeCount)}</div>
                                </Focusable>
                                <Tooltip placement="top" offset={20} showArrow>
                                  <Text transform="lowercase" color="red">
                                    {`${dropped}% ${t(labels.dropoff)}`}
                                  </Text>
                                  <Column>
                                    <Text transform="lowercase">
                                      {`${remaining}% ${t(labels.conversion)}`}
                                    </Text>
                                  </Column>
                                </Tooltip>
                              </TooltipTrigger>
                            </div>
                            {columnIndex < columns.length &&
                              lines.map(([fromIndex, nodeIndex, activeLine], i) => {
                                const height =
                                  (Math.abs(nodeIndex - fromIndex) + 1) * (NODE_HEIGHT + NODE_GAP) -
                                  NODE_GAP;
                                const midHeight =
                                  (Math.abs(nodeIndex - fromIndex) - 1) * (NODE_HEIGHT + NODE_GAP) +
                                  NODE_GAP +
                                  LINE_WIDTH;

                                return (
                                  <div
                                    key={`${fromIndex}${nodeIndex}${i}`}
                                    className={classNames(styles.line, {
                                      [styles.active]: active && activeLine,
                                      [styles.up]: fromIndex < nodeIndex,
                                      [styles.down]: fromIndex > nodeIndex,
                                      [styles.flat]: fromIndex === nodeIndex,
                                    })}
                                    style={{ height }}
                                  >
                                    <div className={classNames(styles.segment, styles.start)} />
                                    <div
                                      className={classNames(styles.segment, styles.mid)}
                                      style={{
                                        height: midHeight,
                                      }}
                                    />
                                    <div className={classNames(styles.segment, styles.end)} />
                                  </div>
                                );
                              })}
                          </div>
                        </div>
                      );
                    },
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </LoadingPanel>
  );
}
