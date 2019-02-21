const reCache = {}
const relativePkg = /^\.\//
export const getRegex = chunkName => {
  if (!reCache[chunkName]) {
    reCache[chunkName] = new RegExp(`/${chunkName.replace(relativePkg, '')}(/index\.(m?jsx?|tsx?))*`)
  }

  return reCache[chunkName]
}

export default function findChunks (stats, [...chunkNames]) {
  const chunks = new Set()
  const chunkMap = {}

  for (let chunk of stats.chunks) {
    chunkMap[chunk.id] = chunk

    if (chunk.entry) {
      chunks.add(chunk)
    }
    else if (chunk.initial) {
      chunks.add(chunk)
    }
  }

  for (let chunkName of chunkNames) {
    for (let chunk of stats.chunks) {
      if (chunk.names.indexOf(chunkName) > -1) {
        chunkNames.splice(chunkNames.indexOf(chunkName), 1)
        chunks.add(chunk)
      }
    }
  }

  for (let chunkName of chunkNames) {
    for (let chunk of stats.chunks) {
      for (let mod of chunk.modules) {
        if (getRegex(chunkName).test(mod.identifier)) {
          chunkNames.splice(chunkNames.indexOf(chunkName), 1)
          chunks.add(chunk)
        }
      }
    }
  }

  const chunkArray = Array.from(chunks)

  for (let chunk of chunkArray) {
    for (let sib of chunk.siblings) {
      chunks.add(chunkMap[sib])
    }
  }

  for (let chunk of chunkArray) {
    if (chunk.entry) {
      chunks.delete(chunk)
      chunks.add(chunk)
    }
  }

  return chunks
}
