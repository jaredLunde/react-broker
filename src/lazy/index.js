import React, {useContext, useEffect, useCallback, useMemo} from 'react'
import PropTypes from 'prop-types'
import {getChunkScripts, findChunks} from './utils'


// context is necessary for keeping track of which components in the
// current react tree depend on which corresponding chunks/promises
const
  BrokerContext = React.createContext({}),
  WAITING = 0b0,   // promise has not yet started loading
  LOADING = 0b1,   // promise has started loading
  REJECTED = 0b10, // promise was rejected
  RESOLVED = 0b11 // promise was successfully resolved

// tracks the chunks used in the rendering of a tree
const createChunkCache = () => {
  let map = {}
  const cache = {
    get: k => map[k],
    set: (k, v) => map[k] = v,
    invalidate: k => delete map[k],
    // returns an array of chunk names used by the current react tree
    getChunkNames: () => Object.keys(map),
    // returns a Set of Webpack chunk objects used by the current react tree
    getChunks: stats => findChunks(stats, cache.getChunkNames()),
    // returns a string of <script> tags for Webpack chunks used by the
    // current react tree
    getChunkScripts: (stats, opt = {}) => getChunkScripts(stats, cache, opt)
  }

  if (__DEV__) {
    cache.forEach = fn => Object.keys(map).forEach(k => fn(k, map[k]))
  }

  return cache
}

// loads an array of Lazy components
const load = (...instances) => Promise.all(instances.map(i => i.load()))

// preloads all of the async components used in the current react tree
class WaitForPromises {
  // Map from Query component instances to pending promises.
  chunkPromises = []

  load () {
    return Promise.all(this.chunkPromises).then(() => this.chunkPromises = [])
  }
}

const loadAll = (app, render = require('react-dom/server').renderToStaticMarkup) => {
  const waitForPromises = new WaitForPromises()

  class WaitForPromisesProvider extends React.Component {
    static childContextTypes = {
      waitForPromises: PropTypes.object,
    }

    getChildContext () {
      return {waitForPromises}
    }

    render () {
      return app
    }
  }

  const process = () => {
    const html = render(<WaitForPromisesProvider/>)
    return waitForPromises.chunkPromises.length > 0
      ? waitForPromises.load().then(process)
      : html
  }

  return Promise.resolve().then(process)
}

// the purpose of this function is to avoid a flash or loading
// spinner when your app initially hydrates/renders
const loadInitial = (chunkCache = globalChunkCache) => {
  let chunks = document.getElementById('__INITIAL_BROKER_CHUNKS__')

  if (!chunks) {
    throw new Error(
      'No chunk cache element was found at <script id="__INITIAL_BROKER_CHUNKS__">'
    )
  }

  chunks = JSON.parse(chunks.firstChild.data)
  const loading = []

  // preloads the chunk scripts
  for (let script of document.querySelectorAll('script[data-rb]')) {
    loading.push(
      new Promise(
        resolve => {
          if (script.getAttribute('data-loaded')) {
            resolve()
          }
          else {
            script.addEventListener('load', resolve)
          }
        }
      )
    )
  }

  return Promise.all(loading).then(
    () => Object.keys(chunks).forEach(
      chunkName => {
        let component

        try {
          component = __webpack_require__(chunks[chunkName]).default
        }
        finally {
          // sets the component in the chunk cache if it is valid
          if (typeof component === 'function') {
            if (typeof module !== 'undefined' && module.hot) {
              __webpack_require__.c[chunks[chunkName]].hot.accept()
            }

            chunkCache.set(chunkName, {status: RESOLVED, component})
          }
        }
      }
    )
  )
}

const globalChunkCache = createChunkCache()

class Provider extends React.Component {
  static contextTypes = {
    waitForPromises: PropTypes.object
  }

  constructor (props) {
    super(props)
    // if there wasn't a chunkCache explicitly provided, one is created
    this.chunkCache = props.chunkCache || globalChunkCache
    // this is the context that is provided to the LazyConsumers
    this.state = {
      load: this.load,
      add: this.add,
      getError: this.getError,
      getStatus: this.getStatus,
      getComponent: this.getComponent,
      chunks: {}
    }
  }

  componentDidMount () {
    // this clears the chunk cache when HMR disposes of a module
    if (__DEV__) {
      if (typeof module !== 'undefined' && module.hot) {
        this.invalidateChunks = status => {
          if (status === 'idle') {
            // fetches any preloaded chunks
            console.log('[Broker HMR] reloading')
            let chunks = document.getElementById('__INITIAL_BROKER_CHUNKS__')

            if (!!chunks) {
              // initial chunks were loaded and we need this workaround to get them to
              // refresh for some reason
              chunks = JSON.parse(chunks.firstChild.data)

              Object.keys(chunks).forEach(
                chunkName => {
                  if (typeof module !== 'undefined' && module.hot) {
                    let component

                    try {
                      component = __webpack_require__(chunks[chunkName]).default
                    }
                    finally {
                      const chunk = this.chunkCache.get(chunkName)
                      chunk.status = WAITING

                      this.load(
                        chunkName,
                        Promise.resolve(__webpack_require__.c[chunks[chunkName]].exports)
                      )

                      __webpack_require__.c[chunks[chunkName]].hot.accept()
                      console.log(' -', chunkName)
                    }
                  }
                }
              )
            }
          }
          else if (status === 'apply') {
            this.chunkCache.forEach(
              (chunkName, chunk) => {
                if (chunk.status !== WAITING && chunk.status !== LOADING) {
                  chunk.status = WAITING
                  console.log(' -', chunkName)
                }
              }
            )
          }
        }

        module.hot.addStatusHandler(this.invalidateChunks)
      }
    }
  }

  componentWillUnmount () {
    if (__DEV__) {
      typeof module !== 'undefined' && module.hot &&
      module.hot.removeStatusHandler(this.invalidateChunks)
    }
  }

  getStatus = chunkName => {
    // gets the cached status of a given chunk name
    const chunk = this.chunkCache.get(chunkName)
    return chunk === void 0 ? WAITING : chunk.status
  }

  getComponent = chunkName => {
    // gets the cached component for a given chunk name
    const chunk = this.chunkCache.get(chunkName)
    return chunk && chunk.component
  }

  getError = chunkName => {
    // gets the cached component for a given chunk name
    const chunk = this.chunkCache.get(chunkName)
    return chunk && chunk.error
  }

  add = (chunkName, promise) => {
    // adds a consumer to @chunkName and updates the consumer's state
    // when the chunk has resolved
    const chunk = this.chunkCache.get(chunkName)

    if (chunk === void 0 || chunk.status === WAITING) {
      // a circular doubly linked list is used for maintaining the consumers
      // listening to a chunk's resolution because there are far fewer
      // operations in deleting a consumer from the listeners than you'd
      // have with a plain Array
      this.chunkCache.set(chunkName, {status: WAITING})
      promise = promise()

      if (this.context && this.context.waitForPromises) {
        this.context.waitForPromises.chunkPromises.push(promise)
      }

      return this.load(chunkName, promise)
    }
    else {
      // this chunk is already being listened to so all we need to do is add
      // the consumer to the list of consumers that need to be updated
      // once the chunk's promise resolves
      return chunk.promise
    }
  }

  setChunk = (chunkName, chunk) => this.setState(
    ({chunks}) => {
      chunks = Object.assign({}, chunks)
      chunks[chunkName] = chunk
      return {chunks}
    }
  )

  load = (chunkName, promise) => {
    // loads a given chunk and updates its consumers when it is resolved or
    // rejected. also sets the chunk's status to 'LOADING' if it hasn't
    // already resolved
    const chunk = this.chunkCache.get(chunkName)

    if (chunk.status === WAITING) {
      // tells registered components that we've started loading this chunk
      chunk.promise =
        promise
          .then(component => this.resolved(chunkName, component))
          .catch(err => this.rejected(chunkName, err))
      chunk.status = LOADING
      this.setChunk(chunkName, chunk)
    }

    return chunk.promise
  }

  resolved = (chunkName, component) => {
    // updates a chunk's consumers when the chunk is resolved and sets the
    // chunk status to 'RESOLVED'
    const chunk = this.chunkCache.get(chunkName)

    if (chunk.status !== RESOLVED) {
      chunk.status = RESOLVED
      // modules typically resolve with a 'default' attribute, but some don't.
      // likewise, fetch() never resolves with a 'default' attribute.
      chunk.component =
        component && component.default !== void 0
          ? component.default
          : component
      // updates each chunk listener with the resolved component
      this.setChunk(chunkName, chunk)
    }

    return chunk.component
  }

  rejected = (chunkName, error) => {
    // updates a chunk's consumers when the chunk is rejected and sets the
    // chunk status to 'REJECTED'
    const chunk = this.chunkCache.get(chunkName)

    if (chunk.status !== REJECTED) {
      chunk.status = REJECTED
      chunk.error = error
      // updates each chunk listener with the caught error
      this.setChunk(chunkName, chunk)
    }

    return error
  }

  render () {
    return <BrokerContext.Provider
      value={this.state}
      children={React.Children.only(this.props.children)}
    />
  }
}

const
  BrokerProvider = Provider,
  defaultOpt = {loading: null, error: null},
  emptyArr = []

const lazy = (chunkName, promise, opt = defaultOpt) => {
  const Lazy = props => {
    const
      broker = useContext(BrokerContext),
      load = useCallback(() => broker.load(chunkName, promise), emptyArr)
    useMemo(() => broker.add(chunkName, promise), emptyArr)

    switch (broker.getStatus(chunkName)) {
      case WAITING:
      case LOADING:
        // returns 'loading' component
        return opt.loading ? opt.loading(props, {retry: load, error: null}) : null
      case REJECTED:
        // returns 'error' component
        // if there isn't an explicitly defined 'error' component, the
        // 'loading' component will be used as a backup with the error
        // message passed in the second argument
        const render = opt.error || opt.loading
        return render ? render(props, {retry: load, error: broker.getError(chunkName)}) : null
      case RESOLVED:
        // returns the proper resolved component
        return React.createElement(broker.getComponent(chunkName), props)
    }
  }
  // necessary for calling Component.load from the application code
  Lazy.load = () => promise()
  // <Lazy(pages/Home)> makes visual grep'ing easier in react-dev-tools
  if (__DEV__) Lazy.displayName = `Lazy(${chunkName})`
  return Lazy
}

export {
  Provider,
  BrokerProvider,
  lazy,
  load,
  loadAll,
  loadInitial,
  createChunkCache,
  findChunks,
  getChunkScripts,
  WaitForPromises
}
