import path from 'path'
import {createMacro} from 'babel-plugin-macros'


class ChunkNameCache {
  chunks = {}
  reverseChunks = new Set()

  shorten (source) {
    return path.basename(path.dirname(source)) + '/' + path.basename(source)
  }

  get (source) {
    if (this.chunks[source]) {
      return this.chunks[source]
    }

    let name = this.shorten(source)
    let originalName = name
    let i = 0

    while (true) {
      if (this.reverseChunks.has(name)) {
        name = `${originalName}.${i}`
        i++
      }
      else {
        break
      }
    }

    this.reverseChunks.add(name)
    this.chunks[source] = name
    return name
  }
}

const chunkNameCache = new ChunkNameCache()


function prevalMacros({references, state, babel}) {
  references.default.forEach(referencePath => makeLegacyEnsure({
    references,
    state,
    babel,
    referencePath
  }))
}


function makeDynamicImport ({references, state, babel, referencePath}) {
  const {types: t, template} = babel
  const {file: {opts: {filename}}} = state
  const source = path.join(
    path.dirname(filename),
    String(referencePath.parentPath.get('arguments')[0]).replace(/['"]/g, '')
  )
  const chunkName = chunkNameCache.get(source)

  const impTemplate = template(`
    require('react-broker').default(
      IMPORT,
      OPTIONS,
      CHUNK_NAME
    )
  `)

  const tpl = impTemplate({
    IMPORT: t.arrowFunctionExpression(
      [],
      t.callExpression(t.import(), [t.stringLiteral(source)])
    ),
    OPTIONS: String(referencePath.parentPath.get('arguments')[1]),
    CHUNK_NAME: t.stringLiteral(chunkName)
  })

  referencePath.parentPath.replaceWith(tpl)
}


function makeLegacyEnsure ({references, state, babel, referencePath}) {
  const {types: t, template} = babel
  const {file: {opts: {filename}}} = state
  const source = path.join(
    path.dirname(filename),
    String(referencePath.parentPath.get('arguments')[0]).replace(/['"]/g, '')
  )
  const chunkName = chunkNameCache.get(source)

  const promTemplate = template(`
    new Promise(function (resolve) {
      return require.ensure(
        [],
        function (require) {resolve(require(IMPORT))},
        'CHUNK_NAME'
      )
    })
  `)
  const impTemplate = template(`
    require('react-broker').default(
      IMPORT,
      OPTIONS,
      CHUNK_NAME
    )
  `)

  const tpl = impTemplate({
    IMPORT: t.arrowFunctionExpression(
      [],
      promTemplate({IMPORT: t.stringLiteral(source), CHUNK_NAME: chunkName}).expression
    ),
    OPTIONS: String(referencePath.parentPath.get('arguments')[1]),
    CHUNK_NAME: t.stringLiteral(chunkName)
  })

  referencePath.parentPath.replaceWith(tpl)
}


export default createMacro(prevalMacros)
