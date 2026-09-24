import React from 'react'

export default function DenseTable({
  columns,
  rows,
  rowKey,
  onRowClick,
  selectedKey,
  empty = '—',
  rowClassName,
}) {
  return (
    <div className="tm-tw">
      <table className="tm-t">
        <thead>
          <tr>
            {columns.map((c) => (
              <th
                key={c.id}
                scope="col"
                className={[c.numeric ? 'n' : '', c.hide ? 'm-hide' : '', c.sorted ? 'sorted' : '']
                  .filter(Boolean)
                  .join(' ')}
              >
                {c.onSort ? (
                  <button type="button" className="tm-sort-btn" onClick={c.onSort}>
                    {c.label}
                  </button>
                ) : c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td className="d" colSpan={columns.length}>
                {empty}
              </td>
            </tr>
          ) : (
            rows.map((row, idx) => {
              const key = rowKey(row)
              return (
                <tr
                  key={key}
                  className={rowClassName?.(row) || undefined}
                  data-selected={selectedKey === key || undefined}
                  tabIndex={onRowClick ? 0 : undefined}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  onKeyDown={onRowClick ? (event) => {
                    if (event.target !== event.currentTarget) return
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      onRowClick(row)
                    }
                  } : undefined}
                >
                  {columns.map((c) => (
                    <td
                      key={c.id}
                      className={[c.numeric ? 'n' : '', c.hide ? 'm-hide' : '', c.tdClass]
                        .filter(Boolean)
                        .join(' ')}
                    >
                      {c.render ? c.render(row, idx) : row[c.id] ?? '—'}
                    </td>
                  ))}
                </tr>
              )
            })
          )}
        </tbody>
      </table>
    </div>
  )
}
