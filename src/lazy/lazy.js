import React from 'react'
import {CDLL} from 'cdll-memoize'
import PropTypes from 'prop-types'
import {getChunkScripts, findChunks} from './utils'


// context is necessary for keeping track of which components in the
// current react tree depend on which corresponding chunks/promises
const {Provider, Consumer} = React.createContext({})
export const WAITING = 0b0   // promise has not yet started loading
export const LOADING = 0b1   // promise has started loading
export const REJECTED = 0b10 // promise was rejected
export const RESOLVED = 0b11 // promise was successfully resolved

// tracks the chunks used in the rendering of a tree
export function createChunkCache () {
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
export function load (...instances) {
  return Promise.all(instances.map(i => i.load()))
}

// preloads all of the async components used in the current react tree
export class WaitForPromises {
  // Map from Query component instances to pending promises.
  chunkPromises = []

  load () {
    return Promise.all(this.chunkPromises).then(() => this.chunkPromises = [])
  }
}

export function loadAll (app, render = require('react-dom/server').renderToStaticMarkup) {
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

  function process () {
    const html = render(<WaitForPromisesProvider/>)
    return waitForPromises.chunkPromises.length > 0
      ? waitForPromises.load().then(process)
      : html
  }

  return Promise.resolve().then(process)
}

// the purpose of this function is to avoid a flash or loading
// spinner when your app initially hydrates/renders
export function loadInitial (chunkCache = globalChunkCache) {
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

            chunkCache.set(chunkName, {status: RESOLVED, lazy: new CDLL([]), component})
          }
        }
      }
    )
  )
}

const globalChunkCache = createChunkCache()

export class LazyProvider extends React.Component {
  static contextTypes = {
    waitForPromises: PropTypes.object
  }

  constructor (props) {
    super(props)
    // if there wasn't a chunkCache explicitly provided, one is created
    this.chunkCache = props.chunkCache || globalChunkCache
    // this is the context that is provided to the LazyConsumers
    this.providerContext = {
      load: this.load,
      subscribe: this.subscribe,
      unsubscribe: this.unsubscribe,
      getStatus: this.getStatus,
      getComponent: this.getComponent
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

  subscribe = (chunkName, lazyComponent) => {
    // subscribes a consumer to @chunkName and updates the consumer's state
    // when the chunk has resolved
    const chunk = this.chunkCache.get(chunkName)

    if (chunk === void 0 || chunk.status === WAITING) {
      // a circular doubly linked list is used for maintaining the consumers
      // listening to a chunk's resolution because there are far fewer
      // operations in deleting a consumer from the listeners than you'd
      // have with a plain Array
      const lazy = new CDLL([lazyComponent])
      this.chunkCache.set(chunkName, {status: WAITING, lazy})
      const promise = lazyComponent.promise()

      if (this.context && this.context.waitForPromises) {
        this.context.waitForPromises.chunkPromises.push(promise)
      }

      return this.load(chunkName, promise)
    }
    else {
      // this chunk is already being listened to so all we need to do is add
      // the consumer to the list of consumers that need to be updated
      // once the chunk's promise resolves
      chunk.lazy.push(lazyComponent)
      return chunk.promise
    }
  }

  unsubscribe = (chunkName, lazyComponent) => {
    // removes a consumer from the list of consumers listening for a chunk's
    // resolution
    const chunk = this.chunkCache.get(chunkName)
    const element = chunk.lazy.find(lazyComponent)
    element !== void 0 && chunk.lazy.delete(element)
  }

  load = (chunkName, promise) => {
    // loads a given chunk and updates its consumers when it is resolved or
    // rejected. also sets the chunk's status to 'LOADING' if it hasn't
    // already resolved
    const chunk = this.chunkCache.get(chunkName)

    if (chunk.status === WAITING) {
      // tells subscribed components that we've started loading this chunk
      chunk.promise =
        promise
          .then(component => this.resolved(chunkName, component))
          .catch(err => this.rejected(chunkName, err))
      chunk.status = LOADING
      chunk.lazy.forEach(c => c.resolving(chunkName))
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
      chunk.lazy.forEach(c => c.resolved(chunkName, chunk.component))
    }

    return chunk.component
  }

  rejected = (chunkName, err) => {
    // updates a chunk's consumers when the chunk is rejected and sets the
    // chunk status to 'REJECTED'
    const chunk = this.chunkCache.get(chunkName)

    if (chunk.status !== REJECTED) {
      chunk.status = REJECTED
      // updates each chunk listener with the caught error
      chunk.lazy.forEach(c => c.rejected(chunkName, err))
    }

    return err
  }

  render () {
    const children = React.Children.only(this.props.children)
    return <Provider value={this.providerContext} children={children}/>
  }
}

const defaultOpt = {loading: null, error: null}

export default function lazy (promises, opt = defaultOpt) {
  const chunkName = Object.keys(promises)[0]

  class Lazy extends React.Component {
    // since Promise isn't cancellable this is necessary for avoiding
    // 'update on unmounted component' errors in React
    mounted = false
    unmounted = false
    // the promise function tied to this chunk
    promise = promises[chunkName]
    // caches the name of the chunk
    chunkName = chunkName

    constructor (props) {
      super(props)
      // subscribes the component to changes in the chunk's status
      this.props.lazy.subscribe(this.chunkName, this)
      // gets the initial status of the chunk in checking whether or not
      // its already been subscribed/resolved
      const status = this.props.lazy.getStatus(this.chunkName)
      // retrieves the initial component if there is one for this chunk
      const component = this.props.lazy.getComponent(this.chunkName)
      // sets the initial state
      this.state = {status, component, error: null}
    }

    componentDidMount () {
      this.mounted = true
    }

    componentWillUnmount () {
      this.unmounted = true
      this.props.lazy.unsubscribe(this.chunkName, this)
    }

    // sets LOADING status for chunks that are currently resolving
    resolving =
      () => this.mounted === true && this.setState(
        ({status}) => status === LOADING ? null : ({
          status: LOADING,
          component: null,
          error: null
        })
      )

    // sets RESOLVED status for chunks that have been resolved
    resolved =
      (chunkName, resolvedComponent) => this.unmounted === false && this.setState({
        status: RESOLVED,
        component: resolvedComponent,
        error: null
      })

    // sets REJECTED status for chunks that have been rejected
    rejected =
      (chunkName, error) => this.unmounted === false && this.setState({
        status: REJECTED,
        error
      })

    // loads the chunk assigned to this component and passes any
    // defined props along to the promise wrapper
    load = () => this.props.lazy.load(this.chunkName, this)

    render () {
      let {status, component, error} = this.state
      let {children, lazy, ...props} = this.props

      switch (status) {
        case WAITING:
        case LOADING:
          // returns 'loading' component
          return (
            opt.loading
              ? opt.loading(props, {retry: this.load, error:  null})
              : null
          )
        case REJECTED:
          // returns 'error' component
          // if there isn't an explicitly defined 'error' component, the
          // 'loading' component will be used as a backup with the error
          // message passed in the second argument
          const render = opt.loading || opt.error
          return render ? render(props, {retry: this.load, error}) : null
        case RESOLVED:
          // returns the proper resolved component
          return React.createElement(component, props, children)
      }
    }
  }

  // wraps the Lazy component with the context consumer so that it gets updated
  // when chunk status changes
  function LazyConsumer (props) {
    return <Consumer children={cxt => <Lazy lazy={cxt} {...props}/>}/>
  }
  // necessary for calling Component.load from the application code
  LazyConsumer.load = () => Promise.all(Object.values(promises).map(p => p()))
  // <Lazy(pages/Home)> makes visual grep'ing easier in react-dev-tools
  if (__DEV__) {
    LazyConsumer.displayName = `Lazy(${Object.keys(promises).join(', ')})`
  }

  return LazyConsumer
}

// the lazy object acts like 'exports' here
lazy.load = load
lazy.loadAll = loadAll
lazy.loadInitial = loadInitial
lazy.createChunkCache = createChunkCache
lazy.Provider = LazyProvider
lazy.WAITING = WAITING
lazy.LOADING = LOADING
lazy.REJECTED = REJECTED
lazy.RESOLVED = RESOLVED
