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

    for (let chunkName of chunkNames) {
      if (chunk.names.includes(chunkName)) {
        chunks.add(chunk)
      }
    }
  }

  return [entry, chunks]
}
