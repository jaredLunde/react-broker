import url from 'url'


export default function getChunkScripts (stats, chunks, opt) {
  const scripts = []
  const resolve = fn => url.resolve(stats.publicPath, fn)
  let preloadAttrs = ''

  if (typeof opt.preload === 'object') {
    preloadAttrs = Object.keys(opt.preload).map(k => `${k}="${opt.preload[k]}"`).join(' ')
    preloadAttrs = ` ${preloadAttrs}`
  }

  chunks.forEach(
    chunk => chunk.files.forEach(
      file => {
        const filename = resolve(file)

        if (opt.preload) {
          scripts.push(`<link rel="preload" as="script" href="${filename}"${preloadAttrs}>`)
        }

        scripts.push(
          `<script src="${filename}" defer></script>`
        )
      }
    )
  )

  return scripts.join('\n')
}
