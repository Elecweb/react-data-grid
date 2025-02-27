import type { CalculatedColumn, Position, GroupRow, CellNavigationMode, Maybe } from '../types';
import { getColSpan } from './colSpanUtils';

interface IsSelectedCellEditableOpts<R, SR> {
  selectedPosition: Position;
  columns: readonly CalculatedColumn<R, SR>[];
  rows: readonly (R | GroupRow<R>)[];
  isGroupRow: (row: R | GroupRow<R>) => row is GroupRow<R>;
}

export function isSelectedCellEditable<R, SR>({
  selectedPosition,
  columns,
  rows,
  isGroupRow
}: IsSelectedCellEditableOpts<R, SR>): boolean {
  const column = columns[selectedPosition.idx];
  const row = rows[selectedPosition.rowIdx];
  return !isGroupRow(row) && isCellEditable(column, row);
}

export function isCellEditable<R, SR>(column: CalculatedColumn<R, SR>, row: R): boolean {
  return (
    !column.rowGroup &&
    (typeof column.editable === 'function' ? column.editable(row) : column.editable) !== false
  );
}

interface GetNextSelectedCellPositionOpts<R, SR> {
  cellNavigationMode: CellNavigationMode;
  columns: readonly CalculatedColumn<R, SR>[];
  colSpanColumns: readonly CalculatedColumn<R, SR>[];
  rows: readonly (R | GroupRow<R>)[];
  summaryRows: Maybe<readonly SR[]>;
  minRowIdx: number;
  maxRowIdx: number;
  currentPosition: Position;
  nextPosition: Position;
  lastFrozenColumnIndex: number;
  isCellWithinBounds: (position: Position) => boolean;
  isGroupRow: (row: R | GroupRow<R>) => row is GroupRow<R>;
  hideRows: number[];
}

export function getSelectedCellColSpan<R, SR>({
  rows,
  summaryRows,
  rowIdx,
  lastFrozenColumnIndex,
  column,
  isGroupRow
}: Pick<
  GetNextSelectedCellPositionOpts<R, SR>,
  'rows' | 'summaryRows' | 'isGroupRow' | 'lastFrozenColumnIndex'
> & {
  rowIdx: number;
  column: CalculatedColumn<R, SR>;
}) {
  if (rowIdx === -1) {
    return getColSpan(column, lastFrozenColumnIndex, { type: 'HEADER' });
  }

  if (rowIdx >= 0 && rowIdx < rows.length) {
    const row = rows[rowIdx];
    if (!isGroupRow(row)) {
      return getColSpan(column, lastFrozenColumnIndex, { type: 'ROW', row });
    }
    return undefined;
  }

  if (summaryRows) {
    return getColSpan(column, lastFrozenColumnIndex, {
      type: 'SUMMARY',
      row: summaryRows[rowIdx - rows.length]
    });
  }

  return undefined;
}

export function getNextSelectedCellPosition<R, SR>({
  cellNavigationMode,
  columns,
  colSpanColumns,
  rows,
  summaryRows,
  minRowIdx,
  maxRowIdx,
  currentPosition: { idx: currentIdx },
  nextPosition,
  lastFrozenColumnIndex,
  isCellWithinBounds,
  isGroupRow,
  hideRows
}: GetNextSelectedCellPositionOpts<R, SR>): Position {
  let { idx: nextIdx, rowIdx: nextRowIdx } = nextPosition;

  const setColSpan = (moveRight: boolean) => {
    if (nextRowIdx >= 0 && nextRowIdx < rows.length) {
      const row = rows[nextRowIdx];
      if (isGroupRow(row)) return;
    }
    // If a cell within the colspan range is selected then move to the
    // previous or the next cell depending on the navigation direction
    for (const column of colSpanColumns) {
      const colIdx = column.idx;
      if (colIdx > nextIdx) break;
      const colSpan = getSelectedCellColSpan({
        rows,
        summaryRows,
        rowIdx: nextRowIdx,
        lastFrozenColumnIndex,
        column,
        isGroupRow
      });

      if (colSpan && nextIdx > colIdx && nextIdx < colSpan + colIdx) {
        nextIdx = colIdx + (moveRight ? colSpan : 0);
        break;
      }
    }
  };

  if (isCellWithinBounds(nextPosition)) {
    setColSpan(nextIdx - currentIdx > 0);
  }

  if (cellNavigationMode !== 'NONE') {
    const columnsCount = columns.length;
    const isAfterLastColumn = nextIdx === columnsCount;
    const isBeforeFirstColumn = nextIdx === -1;

    if (isAfterLastColumn) {
      if (cellNavigationMode === 'CHANGE_ROW') {
        const isLastRow = nextRowIdx === maxRowIdx;
        if (!isLastRow) {
          nextIdx = 0;
          nextRowIdx = (() => {
            let nextRow = nextRowIdx + 1;
            /* eslint-disable-next-line */
            while (true) {
              if (!hideRows.includes(nextRow)) {
                break;
              }
              nextRow += 1;
            }

            return nextRow;
          })();
        }
      } else {
        nextIdx = 0;
      }
    } else if (isBeforeFirstColumn) {
      if (cellNavigationMode === 'CHANGE_ROW') {
        const isFirstRow = nextRowIdx === minRowIdx;
        if (!isFirstRow) {
          nextRowIdx = (() => {
            let nextRow = nextRowIdx - 1;
            /* eslint-disable-next-line */
            while (true) {
              if (!hideRows.includes(nextRow)) {
                break;
              }
              nextRow -= 1;
            }

            return nextRow;
          })();
          nextIdx = columnsCount - 1;
        }
      } else {
        nextIdx = columnsCount - 1;
      }
      setColSpan(false);
    }
  }

  return { idx: nextIdx, rowIdx: nextRowIdx };
}

interface CanExitGridOpts {
  cellNavigationMode: CellNavigationMode;
  maxColIdx: number;
  minRowIdx: number;
  maxRowIdx: number;
  selectedPosition: Position;
  shiftKey: boolean;
}

export function canExitGrid({
  cellNavigationMode,
  maxColIdx,
  minRowIdx,
  maxRowIdx,
  selectedPosition: { rowIdx, idx },
  shiftKey
}: CanExitGridOpts): boolean {
  // When the cellNavigationMode is 'none' or 'changeRow', you can exit the grid if you're at the first or last cell of the grid
  // When the cellNavigationMode is 'loopOverRow', there is no logical exit point so you can't exit the grid
  if (cellNavigationMode === 'NONE' || cellNavigationMode === 'CHANGE_ROW') {
    const atLastCellInRow = idx === maxColIdx;
    const atFirstCellInRow = idx === 0;
    const atLastRow = rowIdx === maxRowIdx;
    const atFirstRow = rowIdx === minRowIdx;

    return shiftKey ? atFirstCellInRow && atFirstRow : atLastCellInRow && atLastRow;
  }

  return false;
}
