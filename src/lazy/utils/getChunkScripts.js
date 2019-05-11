import url from 'url'
import path from 'path'
import findChunks, {getRegex} from "./findChunks"


const isExternalDefault = (regex, chunkName, mod) =>
  mod
  && mod.providedExports !== null
  && mod.providedExports.indexOf('default') > -1
  && mod.identifier.indexOf(chunkName) > -1
  && regex.test(mod.identifier)
  && (
    mod.issuerName === null
    || mod.identifier.indexOf(path.dirname(mod.issuerName).replace(/^\./, '')) === -1
  )

const reCache = {}, relativePkg = /^\.\//

export const getRelRegex = (chunkName) => {
  if (!reCache[chunkName])
    reCache[chunkName] = new RegExp(`/${chunkName.replace(relativePkg, '')}((/index)*\.(m?jsx?|tsx?))+`)
  return reCache[chunkName]
}

const isRelativeDefault = (relRegex, chunkName, mod) =>
  mod
  && mod.identifier.indexOf(chunkName) > -1
  && mod.providedExports.indexOf('default') > -1
  && relRegex.test(mod.identifier)

export default function getChunkScripts (stats, cache, {async = true, defer, preload}) {
  let
    scripts = [],
    preloads = [],
    resolve = fn => url.resolve(stats.publicPath, fn),
    preloadAttrs = ''

  if (typeof preload === 'object') {
    preloadAttrs = Object.keys(preload).map(k => `${k}="${preload[k]}"`).join(' ')
    preloadAttrs = ` ${preloadAttrs}`
  }

  let i, j, k, moduleIds = {}, chunkNames = cache.getChunkNames()

  for (let chunk of findChunks(stats, chunkNames)) {
    for (i = 0; i < chunk.files.length; i++) {
      const
        file = chunk.files[i],
        filename = resolve(file),
        rbNames = []

      for (j = chunkNames.length - 1; j > -1; j--) {
        const
          chunkName = chunkNames[j],
          modRegex = getRegex(chunkName),
          relRegex = getRelRegex(chunkName)

        for (k = 0; k < chunk.modules.length; k++) {
          const mod = chunk.modules[k]

          if (
            isRelativeDefault(relRegex, chunkName, mod)
            || isExternalDefault(modRegex, chunkName, mod)
          ) {
            moduleIds[chunkName] = mod.id
            chunkNames.splice(j, 1)
            rbNames.push(chunkName)
            break
          }
        }
      }

      if (preload) {
        const p = `<link rel="preload" as="script" href="${filename}"${preloadAttrs}>`

        if (chunk.entry || chunk.initial)
          preloads.unshift(p)
        else
          preloads.push(p)
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
  }

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
