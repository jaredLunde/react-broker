import findChunks from './findChunks'


export default function graphChunks (stats, chunkNames) {
  const [entry, chunks] = findChunks(stats, chunkNames)
  let parentIds = [entry.id]
  let ids = [entry.id]
  const chunkMap = {[entry.id]: entry}

  for (let chunk of chunks) {
    ids.push(chunk.id)
    chunkMap[chunk.id] = chunk

    for (let parent of chunk.parents) {
      if (ids.indexOf(parent) === -1) {
        parentIds.push(parent)
      }
    }
  }

  parentIds = parentIds.filter(parent => ids.indexOf(parent) > -1)
  ids = ids.filter(id => parentIds.indexOf(id) === -1)
  const graph = [...parentIds]

  function insertAfterParent (chunk) {
    let lastParent

    for (let parentId of chunk.parents) {
      if (parentIds.indexOf(parentId) > -1) {
        const parent = chunkMap[parentId]
        insertAfterParent(parent)
        lastParent = parentId
      }
    }

    if (lastParent) {
      graph.splice(graph.indexOf(chunk.id), 1)
      graph.splice(graph.indexOf(lastParent), 0, chunk.id)
    }
    else {
      graph.push(chunk.id)
    }
  }

  for (let id of ids) {
    insertAfterParent(chunkMap[id])
  }

  graph.splice(graph.indexOf(entry.id), 1)
  graph.unshift(entry.id)

  return new Set(graph.map(id => chunkMap[id]))
}
