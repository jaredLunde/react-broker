import url from 'url'


export default function getChunkScripts (stats, chunks) {
  const scripts = []
  const resolve = fn => url.resolve(stats.publicPath, fn)

  chunks.forEach(
    chunk => chunk.files.forEach(
      file => (
        chunk.entry
          ? scripts.push(
            `<script src="${resolve(file)}" type="text/javascript" async></script>`
          )
          : scripts.push(
            `<script src="${resolve(file)}" type="text/javascript" defer></script>`
          )
      )
    )
  )

  return scripts.join('\n')
}
