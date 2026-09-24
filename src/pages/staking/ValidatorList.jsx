import { useMemo, useState } from 'react'
import { ArrowRight, ChevronLeft, ChevronRight, RefreshCw, Search, X } from 'lucide-react'
import { formatMonCompactFromWei } from '../../utils/formatters'
import { compareValidators } from './stakingMath'
import './validators.css'

const PAGE_SIZE = 12

export default function ValidatorList({ validators, loading, error, lastUpdated, sourceUpdatedAt, onRefresh, selectedId, onSelect, disabled }) {
  const [query, setQuery] = useState('')
  const [activeOnly, setActiveOnly] = useState(true)
  const [sort, setSort] = useState('stake')
  const [page, setPage] = useState(0)
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    const filtered = validators.filter(v => (!activeOnly || v.isActive) && (!q || v.name.toLowerCase().includes(q) || String(v.id).includes(q)))
    return filtered.sort(sort === 'commission' ? (a, b) => (a.commissionBps ?? Infinity) - (b.commissionBps ?? Infinity) || String(a.name).localeCompare(String(b.name)) : compareValidators(sort))
  }, [validators, activeOnly, query, sort])
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const currentPage = Math.min(page, pages - 1)
  const shown = rows.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE)
  const changeFilter = (set, value) => { set(value); setPage(0) }
  return <section className="sk-panel sk-directory" aria-labelledby="sk-directory-title">
    <div className="sk-section-heading"><div><p className="sk-eyebrow">01 / DISCOVER</p><h2 id="sk-directory-title">Choose your validator</h2></div><button type="button" className="sk-icon-button" aria-label="Refresh validator data" onClick={onRefresh} disabled={loading}><RefreshCw size={16} className={loading ? 'sk-spin' : ''} /></button></div>
    <div className="sk-filter-row">
      <div className="sk-search"><Search size={17} aria-hidden="true" /><input type="search" aria-label="Search validators" placeholder="Search name or validator ID" value={query} onChange={e => changeFilter(setQuery, e.target.value)} />{query && <button type="button" aria-label="Clear search" onClick={() => changeFilter(setQuery, '')}><X size={14} /></button>}</div>
      <label className="sk-sort-label"><span className="sk-sr-only">Sort validators</span><select value={sort} onChange={e => changeFilter(setSort, e.target.value)}><option value="stake">Highest stake</option><option value="commission">Lowest commission</option><option value="name">Name A–Z</option></select></label>
    </div>
    <div className="sk-filter-meta"><label><input type="checkbox" checked={activeOnly} onChange={e => changeFilter(setActiveOnly, e.target.checked)} />Active only</label><span>{loading && !rows.length ? 'Loading validators…' : `${rows.length} validator${rows.length === 1 ? '' : 's'}`}</span></div>
    <div className="sk-table-wrap"><table className="sk-validator-table"><thead><tr><th scope="col">Validator</th><th scope="col">Delegated MON</th><th scope="col">Commission</th><th scope="col"><span className="sk-sr-only">Select</span></th></tr></thead><tbody>
      {shown.map(v => <tr key={v.id} className={selectedId === v.id ? 'is-selected' : ''}>
        <td><button className="sk-validator-name" type="button" onClick={() => onSelect(v.id)} disabled={disabled} aria-pressed={selectedId === v.id}><span className="sk-avatar">{v.logo ? <img src={v.logo} alt="" loading="lazy" /> : v.name.slice(0, 1)}</span><span><strong>{v.name}</strong><small>#{v.id}<i className={v.isActive ? 'is-active' : ''} />{v.hasChainData ? v.isActive ? 'Active' : 'Inactive' : 'Unverified'}</small></span></button></td>
        <td>{v.totalStakeWei == null ? '—' : formatMonCompactFromWei(v.totalStakeWei)}</td><td>{Number.isFinite(v.commissionBps) ? `${(v.commissionBps / 100).toFixed(2)}%` : '—'}</td>
        <td><button className="sk-select-validator" type="button" aria-label={`Select ${v.name}, validator ${v.id}`} onClick={() => onSelect(v.id)} disabled={disabled}><ArrowRight size={16} /></button></td>
      </tr>)}
    </tbody></table></div>
    {!shown.length && <div className="sk-empty" role="status"><Search size={26} /><h3>{loading ? 'Reading the validator set' : error ? 'Validator data is unavailable' : 'No matching validators'}</h3><p>{loading ? 'Stake and commission will appear when the latest snapshot arrives.' : error ? 'Refresh to retry, or turn off Active only to browse available names.' : 'Try another name or ID, or turn off the Active only filter.'}</p>{query && <button className="sk-btn" type="button" onClick={() => changeFilter(setQuery, '')}>Clear search</button>}</div>}
    <div className="sk-pagination"><span>{rows.length ? `${currentPage * PAGE_SIZE + 1}–${Math.min((currentPage + 1) * PAGE_SIZE, rows.length)} of ${rows.length}` : '0 results'}</span><div><button type="button" aria-label="Previous validator page" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}><ChevronLeft size={16} /></button><span>{currentPage + 1} / {pages}</span><button type="button" aria-label="Next validator page" disabled={currentPage >= pages - 1} onClick={() => setPage(currentPage + 1)}><ChevronRight size={16} /></button></div></div>
    <p className="sk-data-note">Data: gmonads{lastUpdated ? ` · retrieved ${new Date(lastUpdated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}{sourceUpdatedAt ? ` · snapshot ${new Date(sourceUpdatedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}` : ''}. Commission is the validator’s share of inflation rewards.</p>
  </section>
}
