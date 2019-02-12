import React from 'react'
import {CDLL} from 'cdll-memoize'
import {renderToStaticMarkup} from 'react-dom/server'
// import reactTreeWalker from '@jaredlunde/react-tree-walker'
import emptyArr from 'empty/array'
import PropTypes from 'prop-types'
// import reactTreeWalker from '@jaredlunde/react-tree-walker'
import {getChunkScripts, graphChunks} from './utils'


// context is necessary for keeping track of which components in the
// current react tree depend on which corresponding chunks/promises
const {Provider, Consumer} = React.createContext({})
export const WAITING = 0  // promise has not yet started loading
export const LOADING = 1  // promise has started loading
export const REJECTED = 2 // promise was rejected
export const RESOLVED = 3 // promise was successfully resolved

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
    getChunks: stats => graphChunks(stats, cache.getChunkNames()),
    // returns a string of <script> tags for Webpack chunks used by the
    // current react tree
    getChunkScripts: stats => getChunkScripts(stats, cache.getChunks(stats))
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

/*
// this is the visitor used by react-tree-walker which will load all of the
// async components required by the current react tree
export function walkAllVisitor (element, instance) {
  if (instance && instance.isLazyComponent === true) {
    return instance.load()
  }
}

// preloads all of the async components used in the current react tree
export function walkAll (app, visitor = walkAllVisitor, context = {}) {
  return reactTreeWalker(app, visitor, context)
}
*/

// preloads all of the async components used in the current react tree
export class RenderPromises {
  // Map from Query component instances to pending promises.
  chunkPromises = []

  load () {
    return Promise.all(this.chunkPromises).then(() => this.chunkPromises = [])
  }
}

export function loadAll (app, render = renderToStaticMarkup) {
  const renderPromises = new RenderPromises()

  class RenderPromisesProvider extends React.Component {
    static childContextTypes = {
      renderPromises: PropTypes.object,
    }

    getChildContext () {
      return {renderPromises}
    }

    render () {
      return app
    }
  }

  function process () {
    const html = render(<RenderPromisesProvider/>)
    return renderPromises.chunkPromises.length > 0
      ? renderPromises.load().then(process)
      : html
  }

  return Promise.resolve().then(process)
}

const globalChunkCache = createChunkCache()

export class LazyProvider extends React.Component {
  static contextTypes = {
    renderPromises: PropTypes.object
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
        this.invalidateChunks =
          status => status === 'apply' && this.chunkCache.forEach(
            (chunkName, chunk) => {
              if (chunk.status !== WAITING) {
                chunk.status = WAITING
                console.log('[Broker HMR] reloading', chunkName)
              }
            }
          )

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
      const promise = lazyComponent.promises[chunkName]()

      if (this.context && this.context.renderPromises) {
        this.context.renderPromises.chunkPromises.push(promise)
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
  const isMulti = Object.keys(promises).length > 1

  // Lazy is a 2-in-1 component in the sense that it renders differently
  // depending on whether or not there are multiple loaders assigned to it.
  //
  // When there are multiple loaders it acts like a render-prop component
  // without 'loading' and 'error' options.
  class Lazy extends React.Component {
    // since Promise isn't cancellable this is necessary for avoiding
    // 'update on unmounted component' errors in React
    mounted = false
    unmounted = false
    // used by Broker.loadAll() for determining whether or not a load()
    // method should be called on a component in the react tree
    isLazyComponent = true
    promises = promises

    constructor (props) {
      super(props)
      let status = {}, component = {}, error = {}

      for (let chunkName in this.promises) {
        // subscribes the component to changes in the chunk's status
        const promise = this.props.lazy.subscribe(chunkName, this)
        // gets the initial status of the chunk in checking whether or not
        // its already been subscribed/resolved
        status[chunkName] = this.props.lazy.getStatus(chunkName)
        // retrieves the initial component if there is one for this chunk
        component[chunkName] = this.props.lazy.getComponent(chunkName)
        error[chunkName] = null
      }
      // sets the initial state
      this.state = {status, component, error}
      // multi components need a multi context, singular components do not
      if (isMulti === true) {
        this.multiContext = {
          retry: this.load,
          isLoading: false,
          isError: false,
          isDone: false,
          status: emptyArr,
          error: emptyArr
        }
      }
      else {
        // caches the name of the chunk for singular components
        this.chunkName = Object.keys(this.promises)[0]
      }
    }

    componentDidMount () {
      this.mounted = true
    }

    componentWillUnmount () {
      this.unmounted = true

      for (let chunkName in this.promises) {
        this.props.lazy.unsubscribe(chunkName, this)
      }
    }

    // sets LOADING status for chunks that are currently resolving
    resolving =
      chunkName => this.mounted === true && this.setState(
        ({status, component, error}) => status === LOADING ? null : ({
          status: {...status, [chunkName]: LOADING},
          component: {...component, [chunkName]: null},
          error: {...error, [chunkName]: null}
        })
      )

    // sets RESOLVED status for chunks that have been resolved
    resolved =
      (chunkName, resolvedComponent) => this.unmounted === false && this.setState(
        ({status, error, component}) => ({
          status: {...status, [chunkName]: RESOLVED},
          component: {...component, [chunkName]: resolvedComponent},
          error: {...error, [chunkName]: null}
        })
      )

    // sets REJECTED status for chunks that have been rejected
    rejected =
      (chunkName, error) => this.unmounted === false && this.setState(
        ({status, error, component}) => ({
          status: {...status, [chunkName]: REJECTED},
          error: {...error, [chunkName]: error}
        })
      )

    // loads all of the chunks assigned to this component and passes any
    // defined props along to the promise wrapper
    load = () => Promise.all(
      Object.keys(this.promises).map(
        chunkName => this.props.lazy.load(chunkName, this)
      )
    )

    render () {
      let {status, component, error} = this.state
      // I avoid Babel destructuring here because this way is much more
      // performant than using Babel's loop
      let props = Object.assign({}, this.props)
      delete props.children
      delete props.lazy

      if (isMulti === false) {
        // this is a single-component lazy load it is treated it normally
        component = component[this.chunkName]

        switch (status[this.chunkName]) {
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
            error = error[this.chunkName]
            // if there isn't an explicitly defined 'error' component, the
            // 'loading' component will be used as a backup with the error
            // message passed in the second argument
            const render = opt.loading || opt.error
            return render ? render(props, {retry: this.load, error}) : null
          case RESOLVED:
            // returns the proper resolved component
            return React.createElement(component, props, this.props.children)
        }
      }
      else {
        // there are multiple components to load so we use our render props
        // style component
        //
        // this component type has no 'loading' or 'error' options like the
        // single component render does
        this.multiContext.status = Object.values(status)
        this.multiContext.error = Object.values(error)
        status = Math.min(...Object.values(status))
        this.multiContext.isLoading = status === WAITING || status === LOADING
        this.multiContext.isError = status === REJECTED
        this.multiContext.isDone = status === RESOLVED

        return this.props.children(...Object.values(component), this.multiContext)
      }
    }
  }

  // wraps the Lazy component with the context consumer so that it gets updated
  // when chunk status changes
  function LazyConsumer (props) {
    return <Consumer children={
      function (cxt) { return <Lazy lazy={cxt} {...props}/> }
    }/>
  }

  // necessary for calling Component.load from the application code
  LazyConsumer.load = () =>
    Promise.all(Object.values(promises).map(p => p()))

  // <Lazy(pages/Home)> makes visual grep'ing easier in react-dev-tools
  if (__DEV__) {
    Object.defineProperty(
      LazyConsumer,
      'name',
      {value: `Lazy(${Object.keys(promises).join(', ')})`}
    )
  }

  return LazyConsumer
}

// the lazy object acts like 'exports' here
lazy.load = load
// lazy.walkAll = walkAll
// lazy.walkAllVisitor = walkAllVisitor
lazy.loadAll = loadAll
lazy.createChunkCache = createChunkCache
lazy.Provider = LazyProvider
lazy.WAITING = WAITING
lazy.LOADING = LOADING
lazy.REJECTED = REJECTED
lazy.RESOLVED = RESOLVED
