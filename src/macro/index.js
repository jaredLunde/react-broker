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
  const brokerTemplate = babel.template.smart(
    `require('${pkgName}').lazy(CHUNK_NAME, PROMISE, OPTIONS);`,
    {preserveComments: true}
  )

  const {promise, chunkName, options} = parseArguments(
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
      CHUNK_NAME: babel.types.stringLiteral(chunkName),
      PROMISE: promise,
      OPTIONS: options
    })
  )
  // this adds webpack magic comment for chunks names
  //     .get('arguments')[1].get('body') is the import() call expression
  //     .get('arguments')[0] is the first argument of the import(), which is the source
  referencePath.parentPath.get('arguments')[1].get('body').get('arguments')[0].addComment(
    "leading",
    ` webpackChunkName: "${chunkName}" `
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
  const {file: {opts: {filename, plugins}}} = state
  const {types: t} = babel

  let chunkName, source, promise
  const options =
    args.length > 1
    && args[args.length - 1].type !== 'StringLiteral'
    && args[args.length - 1].type !== 'TemplateLiteral'
      ? args[args.length - 1].node
      : void 0
  args = options === void 0 ? args : args.slice(0, -1)

  for (let arg of args) {
    let value = ''

    switch (arg.type) {
      case 'StringLiteral':
        // string literals are interpreted as module paths that need to be
        // imported and code-split
        // const node = arg.node !== void 0 ? arg.node : arg
        value = arg.node.value
        // if the package source isn't relative it is interpreted as-is,
        // otherwise it is joined to the path of the filename being parsed by
        // Babel
        source =
          value.match(relativePkg) === null
            ? value
            : path.join(path.dirname(filename), value)
        chunkName = chunkNameCache.get(source)
        // duplicate imports are not allowed
        // creates a function that returns the import promise
        // SEE: https://babeljs.io/docs/en/babel-types#callexpression
        promise = t.arrowFunctionExpression(
          [],
          t.callExpression(
            t.identifier('import'),
            [t.stringLiteral(source)]
          )
        )
      break;
      default:
        throw new Error(`[Broker Error] Unrecognized argument type: ${arg.type}`)
    }
  }

  return {promise, chunkName, options}
}


// shortens the chunk name to its parent directory basename and its basename
function getShortChunkName (source) {
  if (source.match(relativePkg) || path.isAbsolute(source)) {
    return path.dirname(source).split(path.sep).slice(-2).join('/') + '/' + path.basename(source)
  }
  else {
    return source
  }
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

    let name = getShortChunkName(source)
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