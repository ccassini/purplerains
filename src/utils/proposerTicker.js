/**
 * Imperative “now proposing” chrome — gmonads-style single card.
 * Updates logo/name/loc/block via DOM only (no React re-render per ~0.3s block).
 */

/**
 * @param {{
 *   root: HTMLElement | null,
 *   img?: HTMLImageElement | null,
 *   name?: HTMLElement | null,
 *   loc?: HTMLElement | null,
 *   block?: HTMLElement | null,
 * }} refs
 * @param {{
 *   id: string | number,
 *   name: string,
 *   logo?: string,
 *   loc?: string,
 *   block?: number | string | null,
 * }} next
 */
export function updateNowProposer(refs, next) {
  const { root, img, name, loc, block } = refs || {}
  if (!root) return

  const vid = String(next.id)
  const same = root.dataset.vid === vid

  if (name) name.textContent = next.name || 'Validator'
  if (loc) {
    const text = next.loc || ''
    loc.textContent = text
    loc.style.display = text ? '' : 'none'
  }
  if (block != null && next.block != null) {
    block.textContent = `#${Number(next.block).toLocaleString()}`
  }

  if (img) {
    const logo = next.logo || ''
    if (logo) {
      if (img.dataset.logo !== logo) {
        img.dataset.logo = logo
        img.src = logo
      }
      img.style.display = ''
    } else {
      img.removeAttribute('src')
      delete img.dataset.logo
      img.style.display = 'none'
    }
  }

  root.dataset.vid = vid

  // Pop only when the producing validator changes (gmonads-like handoff feel)
  if (!same) {
    root.classList.remove('is-pop')
    // Force restart CSS animation without layout thrash
    // eslint-disable-next-line no-unused-expressions
    void root.offsetWidth
    root.classList.add('is-pop')
    window.setTimeout(() => root.classList.remove('is-pop'), 380)
  } else {
    // Same proposer, new block — subtle block flash
    root.classList.remove('is-tick')
    void root.offsetWidth
    root.classList.add('is-tick')
    window.setTimeout(() => root.classList.remove('is-tick'), 220)
  }
}

/**
 * Legacy chip ticker (kept for optional use). Prefer updateNowProposer.
 */
const DEFAULT_MAX = 4

export function pushProposerTick(root, item) {
  if (!root || typeof document === 'undefined') return

  const {
    id,
    name,
    logo = '',
    block = null,
    tickClass = 'mw-tick',
    imgClass = 'mw-tick-img',
    nameClass = 'mw-tick-name',
    blockClass = 'mw-tick-block',
    showBlock = true,
    max = DEFAULT_MAX,
  } = item

  const vid = String(id)
  const first = root.firstElementChild

  if (first && first.dataset.vid === vid) {
    if (showBlock && block != null) {
      const blk = first.querySelector(`.${blockClass}`)
      if (blk) blk.textContent = `#${Number(block).toLocaleString()}`
    }
    return
  }

  const el = document.createElement('span')
  el.className = `${tickClass} ${tickClass}-new`
  el.dataset.vid = vid

  if (logo) {
    const img = document.createElement('img')
    img.className = imgClass
    img.src = logo
    img.alt = ''
    img.decoding = 'async'
    img.loading = 'lazy'
    img.draggable = false
    img.width = 18
    img.height = 18
    img.onerror = () => {
      img.style.display = 'none'
    }
    el.appendChild(img)
  }

  const nameEl = document.createElement('span')
  nameEl.className = nameClass
  nameEl.textContent = name || 'Validator'
  el.appendChild(nameEl)

  if (showBlock && block != null) {
    const blk = document.createElement('span')
    blk.className = blockClass
    blk.textContent = `#${Number(block).toLocaleString()}`
    el.appendChild(blk)
  }

  root.insertBefore(el, root.firstChild)

  while (root.childElementCount > max) {
    root.removeChild(root.lastElementChild)
  }

  window.setTimeout(() => {
    el.classList.remove(`${tickClass}-new`)
  }, 260)
}
