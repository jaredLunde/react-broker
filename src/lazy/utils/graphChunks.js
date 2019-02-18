import findChunks from './findChunks'


export default function graphChunks (stats, chunkNames) {
  const [entry, chunks] = findChunks(stats, chunkNames)
  let ids = [entry]
  const chunkMap = {}
  stats.chunks.forEach(c => chunkMap[c.id] = c)

  for (let chunk of chunks) {
    ids.push(chunk)

    for (let sibling of chunk.siblings) {
      ids.push(chunkMap[sibling])
    }
  }

  return new Set(ids)
}
