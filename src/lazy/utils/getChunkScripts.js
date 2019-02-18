import url from 'url'
import {getRegex} from "./findChunks"


export default function getChunkScripts (stats, cache, opt) {
  const scripts = []
  const resolve = fn => url.resolve(stats.publicPath, fn)
  let preloadAttrs = ''

  if (typeof opt.preload === 'object') {
    preloadAttrs = Object.keys(opt.preload).map(k => `${k}="${opt.preload[k]}"`).join(' ')
    preloadAttrs = ` ${preloadAttrs}`
  }

  const chunkNames = cache.getChunkNames()
  const moduleIds = {}

  cache.getChunks(stats).forEach(
    chunk => chunk.files.forEach(
      file => {
        const filename = resolve(file)
        const rbNames = []

        chunkNames.forEach(
          name => {
            const regex = getRegex(name)

            for (let mod of chunk.modules) {
              if (mod.name.endsWith(name) || regex.test(mod.identifier)) {
                moduleIds[name] = mod.id
                rbNames.push(name)
                break
              }
            }
          }
        )

        if (opt.preload) {
          scripts.push(`<link rel="preload" as="script" href="${filename}"${preloadAttrs}>`)
        }

        scripts.push(
          `<script`
            + `${rbNames.length > 0 ? ` data-rb="${rbNames.join('+')}"` : ' data-rb=""'} `
            + `src="${filename}" defer `
            + `onload="this.setAttribute('data-loaded', 'true')"`
            + `></script>`
        )
      }
    )
  )

  scripts.push(
    `<script id="__INITIAL_BROKER_CHUNKS__" type="application/json">${JSON.stringify(moduleIds)}</script>`
  )

  return scripts.join('\n')
}
