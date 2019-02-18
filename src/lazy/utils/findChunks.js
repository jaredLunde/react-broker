const reCache = {}
const relativePkg = /^\.\//
export const getRegex = chunkName => {
  if (!reCache[chunkName]) {
    reCache[chunkName] = new RegExp(`/${chunkName.replace(relativePkg, '')}(/index\.(jsx?|tsx?|mjs))*`)
  }

  return reCache[chunkName]
}

export default function findChunks (stats, chunkNames) {
  let entry = null
  const chunks = new Set()

  for (let chunk of stats.chunks) {
    if (chunk.entry) {
      entry = chunk
    }
    else if (chunk.initial) {
      chunks.add(chunk)
    }

    let found =  false
    for (let chunkName of chunkNames) {
      if (chunk.names.includes(chunkName)) {
        chunks.add(chunk)
        found = true
        break
      }
    }

    if (found) continue

    for (let mod of chunk.modules) {
      for (let chunkName of chunkNames) {
        const regex = getRegex(chunkName)
        if (regex.test(mod.identifier)) {
          chunks.add(chunk)
          found = true
          break
        }
      }

      if (found) break
    }
  }

  return [entry, chunks]
}
