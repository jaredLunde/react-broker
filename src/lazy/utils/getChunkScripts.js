import url from 'url'
import path from 'path'
import {getRegex} from "./findChunks"

const isExternalDefault = (chunkName, mod) => {
  const regex = getRegex(chunkName)

  return (
    mod &&
    regex.test(mod.identifier)
    && (
      (
        mod.issuerName
        && mod.identifier.includes(path.dirname(mod.issuerName).replace(/^\./, '')) === false
      ) ||
      mod.issuerName === null
    )
    && mod.providedExports.includes('default')
  )
}

const reCache = {}
const relativePkg = /^\.\//
export const getRelRegex = (chunkName) => {
  if (!reCache[chunkName]) {
    reCache[chunkName] = new RegExp(`/${chunkName.replace(relativePkg, '')}((/index)*\.(jsx?|tsx?|mjs))+`)
  }

  return reCache[chunkName]
}

const isRelativeDefault = (chunkName, mod) => {
  const relRegex = getRelRegex(chunkName)
  return mod && relRegex.test(mod.identifier) && mod.providedExports.includes('default')
}

export default function getChunkScripts (stats, cache, {async = true, defer, preload}) {
  let scripts = []
  let preloads = []
  const resolve = fn => url.resolve(stats.publicPath, fn)
  let preloadAttrs = ''

  if (typeof preload === 'object') {
    preloadAttrs = Object.keys(preload).map(k => `${k}="${preload[k]}"`).join(' ')
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
            for (let mod of chunk.modules) {
              if (isRelativeDefault(name, mod) || isExternalDefault(name, mod)) {
                moduleIds[name] = mod.id
                rbNames.push(name)
                break
              }
            }
          }
        )

        if (preload) {
          const p = `<link rel="preload" as="script" href="${filename}"${preloadAttrs}>`

          if (chunk.entry || chunk.initial) {
            preloads.unshift(p)
          }
          else {
            preloads.push(p)
          }
        }

        scripts.push(
          `<script`
          + `${rbNames.length > 0 ? ` data-rb="${rbNames.join('+')}"` : ' data-rb=""'} `
          + `src="${filename}" `
          + `${defer ? 'defer ' : async ? 'async ' : ''}`
          + `onload="this.setAttribute('data-loaded', 'true')"`
          + `></script>`
        )
      }
    )
  )

  scripts.unshift(
    `<script id="__INITIAL_BROKER_CHUNKS__" type="application/json">${JSON.stringify(moduleIds)}</script>`
  )

  preloads = preloads.join('')
  scripts = scripts.join('')

  return {
    scripts,
    preload: preloads,
    toString: () => preloads + scripts
  }
}
