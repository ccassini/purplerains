export function unwrapArcLongitudes(start, end, center) {
  const source = start + 360 * Math.round((center - start) / 360)
  const delta = ((end - start + 180) % 360 + 360) % 360 - 180
  return [source, source + delta]
}

export function visibleWorldCopies(minX, maxX, worldWidth, viewportWidth, padding = 24) {
  if (!(worldWidth > 0) || !(viewportWidth > 0)) return [0, -1]
  return [
    Math.ceil((-padding - maxX) / worldWidth) || 0,
    Math.floor((viewportWidth + padding - minX) / worldWidth) || 0,
  ]
}
