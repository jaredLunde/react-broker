import path from 'path'
import crypto from 'crypto'
import {createMacro} from 'babel-plugin-macros'


const pkgName = 'react-broker'
export default createMacro(evaluateMacros)

function evaluateMacros({references, state, babel}) {
  references.default.forEach(referencePath => makeLegacyEnsure({
    references,
    state,
    babel,
    referencePath
  }))
}

function makeLegacyEnsure ({references, state, babel, referencePath}) {
  //const brokerTemplate = babel.template(`Broker(PROMISES, OPTIONS)`)
  const brokerTemplate = babel.template(`
    (typeof Broker !== 'undefined' ? Broker : require('${pkgName}').default)(
      PROMISES,
      OPTIONS
    )
  `)
  const promises = parseArguments(
    referencePath.parentPath.get('arguments')[0],
    state,
    babel
  )

  let options = referencePath.parentPath.get('arguments')[1]
  options = options && options.expression

  referencePath.parentPath.replaceWith(
    brokerTemplate({
      PROMISES: toObjectExpression(promises, babel),
      OPTIONS: options
      // OPTIONS: toObjectExpression(options, babel)
    })
  )
}


function toObjectExpression (obj, {types: t, template}) {
  const properties = []

  for (let key in obj) {
    properties.push(t.objectProperty(t.stringLiteral(key), obj[key]))
  }

  return t.objectExpression(properties)
}


const absolutePkg = /^[.\/]/g

function parseArguments (args, state, babel) {
  const {file: {opts: {filename}}} = state
  const {types: t, template} = babel
  const esureTemplate = babel.template(`
    new Promise(
      function (resolve) {
        return require.ensure(
          [],
          function (require) { resolve(require(SOURCE)) },
          'CHUNK_NAME'
        )
      }
    )
  `)
  let chunkName, source
  const promises = {}
  args = Array.isArray(args) ? args : [args]

  for (let arg of args) {
    switch (arg.type) {
      case 'StringLiteral':
        // Imports
        const node = arg.node !== void 0 ? arg.node : arg
        source =
          node.value.match(absolutePkg) === null
            ? node.value
            : path.join(path.dirname(filename), node.value)
        chunkName = chunkNameCache.get(source)

        if (promises[chunkName] !== void 0) {
          throw new Error(`[Broker Error] duplicate import: ${source}`)
        }

        promises[chunkName] = t.arrowFunctionExpression(
          [],
          esureTemplate({
            SOURCE: t.stringLiteral(source),
            CHUNK_NAME: chunkName
          }).expression
        )
      break;
      case 'ArrayExpression':
        const arrPromises = parseArguments(arg.node.elements, state, babel)
        Object.assign(promises, arrPromises)
      break;
      case 'Identifier':
      case 'FunctionExpression':
      case 'ArrowFunctionExpression':
        // Functions which return promises
        source = state.file.code.slice(arg.start, arg.end)
        chunkName = chunkNameCache.get(source, true)

        if (promises[chunkName] !== void 0) {
          throw new Error(`[Broker Error] duplicate promise: ${source}`)
        }

        promises[chunkName] = arg
      break;
      /**
      case 'ObjectExpression':
        // Lazy options
        for (let property of arg.node.properties) {
          options[property.key.name] = property.value
        }
      break;
      */
      default:
        throw new Error('[Broker Error] Unrecognized argument type:', arg.type)
    }
  }

  return promises
}


function getShortChunkName (source) {
  return path.basename(path.dirname(source)) + '/' + path.basename(source)
}

function getObjChunkName (source) {
  const hash = crypto.createHash('sha1')
  hash.update(source)
  return hash.digest('hex')
}

class ChunkNameCache {
  chunks = {}
  chunkNames = new Set()

  get (source, isFunction = false) {
    let name

    if (isFunction === false) {
      name = getShortChunkName(source)
    }
    else {
      name = getObjChunkName(source)
    }

    if (this.chunks[source]) {
      return this.chunks[source]
    }

    let originalName = name
    let i = 0

    while (true) {
      if (this.chunkNames.has(name)) {
        name = `${originalName}.${i}`
        i++
      }
      else {
        break
      }
    }

    this.chunkNames.add(name)
    this.chunks[source] = name

    return name
  }
}

const chunkNameCache = new ChunkNameCache()
/*
function makeDynamicImport ({references, state, babel, referencePath}) {
  const tpl = impTemplate({
    IMPORT: t.arrowFunctionExpression(
      [],
      t.callExpression(t.import(), [t.stringLiteral(source)])
    ),
    OPTIONS: String(referencePath.parentPath.get('arguments')[1])
  })}
*/
