import type { TableRequest } from '../../core/tool/tableView';

// The places a gesture's request leaves for the surface to fill. The core's own constants are not
// imported: the webview takes only types from the core.

/** How a gesture names the rows selected. */
export const SELECTION = '$selection';
/** Where a request leaves a value to be typed or picked. */
export const TYPED = '$typed';
/** Where a request names the one row of several it is made for. */
export const ROW = '$row';

/** A request with what was typed or picked in the place of `$typed`, and a row in the place of `$row`. */
export const filled = (request: TableRequest, typed: string | number | boolean | undefined, row: string | undefined): TableRequest => (typed === undefined && row === undefined ? request
  : JSON.parse(JSON.stringify(request), (_key, value: unknown) => (value === TYPED && typed !== undefined ? typed : value === ROW && row !== undefined ? row : value)) as TableRequest);
