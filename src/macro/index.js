import path from 'path'
import {createMacro} from 'babel-plugin-macros'


const pkgName = 'react-broker'
export default createMacro(evaluateMacros)

// cycles through each call to the macro and determines an output for each
function evaluateMacros({references, state, babel}) {
  references.default.forEach(referencePath => makeLegacyEnsure({
    references,
    state,
    babel,
    referencePath
  }))
}

// if Broker is defined in the scope then it will use that Broker, otherwise
// it requires the module.
function makeLegacyEnsure ({references, state, babel, referencePath}) {
  const brokerTemplate = babel.template(`
    (typeof Broker !== 'undefined' ? Broker : require('${pkgName}').default)(
      PROMISES,
      OPTIONS
    )
  `)

  const {promises, options} = parseArguments(
    referencePath.parentPath.get('arguments'),
    state,
    babel
  )

  // component options are always in the second argument
  // let options = referencePath.parentPath.get('arguments')[1]
  // options = options && options.expression

  // replaces the macro with the new broker template in the source code
  referencePath.parentPath.replaceWith(
    brokerTemplate({
      PROMISES: toObjectExpression(promises, babel),
      OPTIONS: options
    })
  )
}


// creates a Babel object expression from a Javascript object with string keys
function toObjectExpression (obj, {types: t, template}) {
  const properties = []

  for (let key in obj) {
    properties.push(t.objectProperty(t.stringLiteral(key), obj[key]))
  }

  return t.objectExpression(properties)
}


// relative packages are considered as such when they start with a period '.'
const relativePkg = /^\./g
// Parses the lazy() macro arguments to determine their type. String literals
// are converted to require.ensure code-split imports. Arrow functions,
// Identifers, and plain Functions, are all excluded from code-splitting and
// are interpreted as-is.
function parseArguments (args, state, babel) {
  const {file: {opts: {filename}}} = state
  const {types: t, template} = babel
  // since I can't add magic comments for Webpack with dynamic imports in babel
  // yet, I had to revert to using the Webpack's legacy code-splitting API
  // using require.ensure
  const ensureTemplate = babel.template(`
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
  const options =
    args.length > 1 && args[args.length - 1].type !== 'StringLiteral'
      ? args[args.length - 1].node
      : void 0
  args = options === void 0 ? args : args.slice(0, -1)

  for (let arg of args) {
    switch (arg.type) {
      case 'StringLiteral':
        // string literals are interpreted as module paths that need to be
        // imported and code-split
        // const node = arg.node !== void 0 ? arg.node : arg
        const {value} = arg.node
        // if the package source isn't relative it is interpreted as-is,
        // otherwise it is joined to the path of the filename being parsed by
        // Babel
        source =
          value.match(relativePkg) === null
            ? value
            : path.join(path.dirname(filename), value)
        chunkName = chunkNameCache.get(source)
        // duplicate imports are not allowed
        if (promises[chunkName] !== void 0) {
          throw new Error(`[Broker Error] duplicate import: ${source}`)
        }
        // creates a function that returns the import promise
        promises[chunkName] = t.arrowFunctionExpression(
          [],
          ensureTemplate({
            SOURCE: t.stringLiteral(source),
            CHUNK_NAME: chunkName
          }).expression
        )
      break;
      /**
      case 'FunctionExpression':
      case 'ArrowFunctionExpression':
        // Functions and identifiers are interpreted as Promise-returning
        // functions. They are no implicitly code-split by Broker but
        // may be code-split if you do something like () => import('../Foo')
        const {start, end} = arg.node
        source = state.file.code.slice(start, end)
        // chunk names are assigned for ease-of-use with the Lazy component
        chunkName = chunkNameCache.get(
          `${filename}${source}[${start}:${end}]`,
          true
        )
        promises[chunkName] = arg.node
      break;
      case 'ObjectExpression':
        // Lazy options
        for (let property of arg.node.properties) {
          options[property.key.name] = property.value
        }
      break;
      */
      default:
        throw new Error(`[Broker Error] Unrecognized argument type: ${arg.type}`)
    }
  }

  return {promises, options}
}


// shortens the chunk name to its parent directory basename and its basename
function getShortChunkName (source) {
  return path.basename(path.dirname(source)) + '/' + path.basename(source)
}
// This is the chunk name cache which maps sources to their respective
// chunk names. This is necessary because you could import the same module
// from different paths, but you obviously want to use the same chunk rather
// than create two separate chunks in Webpack.
class ChunkNameCache {
  chunks = {}
  chunkNames = new Set()

  get (source, isFunction = false) {
    if (this.chunks[source]) {
      return this.chunks[source]
    }

    let name = name = getShortChunkName(source)
    let originalName = name
    let i = 0

    while (true) {
      if (this.chunkNames.has(name)) {
        // if this chunk name is already in use by a different source then we
        // append a unique ID to it
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
Dynamic imports will be used once Babel adds the option to add magic comments
without a babel.template()

function makeDynamicImport ({references, state, babel, referencePath}) {
  const tpl = impTemplate({
    IMPORT: t.arrowFunctionExpression(
      [],
      t.callExpression(t.import(), [t.stringLiteral(source)])
    ),
    OPTIONS: String(referencePath.parentPath.get('arguments')[1])
  })}
*/
