import type { HTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from 'react';

/**
 * Thin, semantic wrappers around the plain `<table>` elements every list
 * page (Chat Logs, FAQs, Admin Users, ...) already builds by hand — same
 * `.table` styling in one place, while each page keeps full control over
 * its own row markup (expand/collapse, inline actions, whatever that page
 * needs). Not a generic "give me rows and columns" data-grid component —
 * those needs are different enough per page that forcing one shape would
 * fight more than it'd help; this only standardizes the shell.
 */
export function Table(props: HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="table-container">
      <table {...props} className={props.className ? `table ${props.className}` : 'table'} />
    </div>
  );
}
export function TableHead(props: HTMLAttributes<HTMLTableSectionElement>) {
  return <thead {...props} />;
}
export function TableBody(props: HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody {...props} />;
}
export function TableRow(props: HTMLAttributes<HTMLTableRowElement>) {
  return <tr {...props} />;
}
export function TableHeaderCell(props: ThHTMLAttributes<HTMLTableCellElement>) {
  return <th {...props} />;
}
export function TableCell(props: TdHTMLAttributes<HTMLTableCellElement>) {
  return <td {...props} />;
}
