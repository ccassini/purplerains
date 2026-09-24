/**
 * Imperative “now proposing” chrome — gmonads-style single card.
 * Updates logo/name/loc/block via DOM only (no React re-render per ~0.3s block).
 */

const proposerAnimations = new WeakMap()

function animateProposer(root, target, same) {
  const previous = proposerAnimations.get(root)
  if (previous) {
    previous.onfinish = null
    previous.oncancel = null
    previous.cancel()
    proposerAnimations.delete(root)
  }

  // Clear legacy CSS pulses without a synchronous layout/offsetWidth read.
  root.classList.remove('is-pop', 'is-tick')
  if (!target || root.isConnected === false || target.isConnected === false) return
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
  // Older browsers keep the live card static; data updates never need a reflow.
  if (typeof target.animate !== 'function') return

  const animation = target.animate(
    same
      ? [{ opacity: 0.5 }, { opacity: 1 }]
      : [{ transform: 'scale(0.75)', opacity: 0.5 }, { transform: 'scale(1)', opacity: 1 }],
    {
      duration: same ? 180 : 280,
      easing: same ? 'ease-out' : 'cubic-bezier(0.22, 1.35, 0.36, 1)',
    },
  )
  proposerAnimations.set(root, animation)

  const release = () => {
    if (proposerAnimations.get(root) === animation) proposerAnimations.delete(root)
    animation.onfinish = null
    animation.oncancel = null
    // Release the effect and target even if the card detached during its pulse.
    animation.cancel()
  }
  animation.onfinish = release
  animation.oncancel = release
}

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

  // Match the existing logo pop / block flash without blocking the arc's frame.
  animateProposer(root, same ? block : img, same)
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
