const reCache = new Map(), relativePkg = /^\.\//

export const getRegex = chunkName => {
  let re = reCache.get(chunkName)

  if (re === void 0) {
    re = new RegExp(`/${chunkName.replace(relativePkg, '',)}((\/index)?\.(m?jsx?|tsx?))?`)
    reCache.set(chunkName, re)
  }

  return re
}

export default function findChunks (stats, chunkNames) {
  chunkNames = chunkNames.slice(0) // avoids unintended mutations via cloning

  let
    chunks = new Set(),
    chunkMap = new Map(),
    i = 0,
    j,
    k

  for (; i < stats.chunks.length; i++) {
    const chunk = stats.chunks[i]
    chunkMap.set(chunk.id, chunk)
    if (chunk.entry) chunks.add(chunk)
  }

  for (i = chunkNames.length - 1; i > -1; i--) {
    const chunkName = chunkNames[i]

    for (j = 0; j < stats.chunks.length; j++) {
      const chunk = stats.chunks[j]

      if (chunk.names.indexOf(chunkName) > -1) {
        chunkNames.splice(i, 1)
        chunks.add(chunk)
      }
    }
  }

  for (i = chunkNames.length - 1; i > -1; i--) {
    const
      chunkName = chunkNames[i],
      regex = getRegex(chunkName)

    for (j = 0; j < stats.chunks.length; j++) {
      const chunk = stats.chunks[j]

      for (k = 0; k < chunk.modules.length; k++) {
        if ( // does an indexOf first for perf
          chunk.modules[k].identifier.indexOf(chunkName)
          && regex.test(chunk.modules[k].identifier)) {
          chunkNames.splice(i, 1)
          chunks.add(chunk)
        }
      }
    }
  }

  const chunkArray = Array.from(chunks)

  for (i = 0; i < chunkArray.length; i++) {
    const chunk = chunkArray[i]
    for (j = 0; j < chunk.siblings.length; j++)
      chunks.add(chunkMap.get(chunk.siblings[j]))
  }

  for (i = 0; i < chunkArray.length; i++) {
    const chunk = chunkArray[i]

    if (chunk.entry) {
      chunks.delete(chunk)
      chunks.add(chunk)
    }
  }

  return chunks
}
