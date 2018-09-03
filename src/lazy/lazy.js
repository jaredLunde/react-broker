import React from 'react'
import {CDLL} from 'cdll-memoize'
import emptyObj from 'empty/object'
import emptyArr from 'empty/array'
import reactTreeWalker from 'react-tree-walker'
import {getChunkScripts, graphChunks} from './utils'


// context is necessary for keeping track of which components in the
// current react tree depend on which corresponding chunks/promises
const {Provider, Consumer} = React.createContext({})
export const WAITING = 0  // promise has not yet started loading
export const LOADING = 1  // promise has started loading
export const REJECTED = 2 // promise was rejected
export const RESOLVED = 3 // promise was successfully resolved

// tracks the chunks used in the rendering of a tree
export const createChunkCache = () => {
  const map = {}
  const cache = {
    get: k => map[k],
    set: (k, v) => map[k] = v,
    // returns an array of chunk names used by the current react tree
    getChunkNames: () => Object.keys(map),
    // returns a Set of Webpack chunk objects used by the current react tree
    getChunks: stats => graphChunks(stats, cache.getChunkNames()),
    // returns a string of <script> tags for Webpack chunks used by the
    // current react tree
    getChunkScripts: stats => getChunkScripts(stats, cache.getChunks(stats))
  }

  return cache
}

// loads an array of Lazy components
export const load = instances => Promise.all(instances.map(i => i.load()))

// this is the visitor used by react-tree-walker which will load all of the
// async components required by the current react tree
function loadAllVisitor (element, instance) {
  if (instance && instance.isLazyComponent === true) {
    return instance.constructor.load()
  }
}

// preloads all of the async components used in the current react tree
export const loadAll = app => reactTreeWalker(app, loadAllVisitor, emptyObj)


export class LazyProvider extends React.Component {
  constructor (props) {
    super(props)
    // if there wasn't a chunkCache explicitly provided, one is created
    this.chunkCache = props.chunkCache || createChunkCache()
    // this is the context that is provided to the LazyConsumers
    this.providerContext = {
      load: this.load,
      reload: this.reload,
      subscribe: this.subscribe,
      unsubscribe: this.unsubscribe,
      getStatus: this.getStatus,
      getComponent: this.getComponent
    }
  }

  getStatus = chunkName => {
    // gets the cached status of a given chunk name
    const meta = this.chunkCache.get(chunkName)
    return meta === void 0 ? LOADING : meta.status
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

    if (chunk === void 0) {
      // a circular doubly linked list is used for maintaining the consumers
      // listening to a chunk's resolution because there are far fewer
      // operations in deleting a consumer from the listeners than you'd
      // have with a plain Array
      const lazy = new CDLL([lazyComponent])
      this.chunkCache.set(chunkName, {status: WAITING, lazy})
      return this.load(chunkName, lazyComponent.promises[chunkName])
    }
    else {
      // this chunk is already being listened to so all we need to do is add
      // the consumer to the list of consumers that need to be updated
      // once the chunk's promise resolves
      chunk.lazy.push(lazyComponent)
      return lazyComponent.promises[chunkName]
    }
  }

  unsubscribe = (chunkName, lazyComponent) => {
    // removes a consumer from the list of consumers listening for a chunk's
    // resolution
    const chunk = this.chunkCache.get(chunkName)
    const element = chunk.lazy.find(lazyComponent)
    element !== void 0 && chunk.lazy.delete(element)
  }

  reload = (chunkName, promise) => {
    // reloads a given chunk - this is necessary in cases where the underlying
    // promise changes due to a prop change in the Lazy component
    const chunk = this.chunkCache.get(chunkName)
    this.chunkCache.set(chunkName, {...chunk, status: WAITING})
    return this.load(chunkName, promise)
  }

  load = (chunkName, promise) => {
    // loads a given chunk and updates its consumers when it is resolved or
    // rejected. also sets the chunk's status to 'LOADING' if it hasn't
    // already resolved
    const chunk = this.chunkCache.get(chunkName)

    switch (chunk.status) {
      case RESOLVED:
        // return Promise.resolve(chunk.component)
        return promise
      // case LOADING is omitted here because we don't want to try loading
      // chunks that are ALREADY loading
      case REJECTED:
      case WAITING:
        this.chunkCache.set(chunkName, {...chunk, component: void 0, status: LOADING})
        // tells subscribed components that we've started loading this chunk
        chunk.lazy.forEach(c => c.resolving(chunkName))
        return promise.then(component => this.resolved(chunkName, component))
                      .catch(err => this.rejected(chunkName, err))

    }

    return promise
  }

  resolved = (chunkName, component) => {
    // updates a chunk's consumers when the chunk is resolved and sets the
    // chunk status to 'RESOLVED'
    const meta = this.chunkCache.get(chunkName)

    if (meta.status !== RESOLVED) {
      meta.status = RESOLVED
      // modules typically resolve with a 'default' attribute, but some don't.
      // likewise, fetch() never resolves with a 'default' attribute.
      meta.component =
        component && component.default !== void 0
          ? component.default
          : component
      // updates each chunk listener with the resolved component
      meta.lazy.forEach(c => c.resolved(chunkName, meta.component))
    }

    return component
  }

  rejected = (chunkName, err) => {
    // updates a chunk's consumers when the chunk is rejected and sets the
    // chunk status to 'REJECTED'
    const meta = this.chunkCache.get(chunkName)

    if (meta.status !== REJECTED) {
      meta.status = REJECTED
      // updates each chunk listener with the caught error
      meta.lazy.forEach(c => c.rejected(chunkName, err))
    }

    return err
  }

  render () {
    const children = React.Children.only(this.props.children)
    return <Provider value={this.providerContext} children={children}/>
  }
}


const defaultOpt = {loading: null, error: null, shouldBrokerUpdate: null}

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
    // used by Broker.loadAll() for determining whether or not a load()
    // method should be called on a component in the react tree
    isLazyComponent = true

    static defaultProps = {
      // shouldBrokerUpdate() option in lazy() can be overridden here
      shouldBrokerUpdate: opt.shouldBrokerUpdate
    }

    constructor (props) {
      super(props)
      this.promises = {}
      let status = {}, component = {}, error = {}
      // duplicates props without the lazy context for calling promise
      // arrow functions. I avoid Babel destructuring here because this way is
      // much more performant than using Babel's loop.
      props = Object.assign({}, props)
      delete props.lazy
      delete props.shouldBrokerUpdate
      delete props.children

      for (let chunkName in promises) {
        // gets the initial status of the chunk in checking whether or not
        // its already been subscribed/resolved
        status[chunkName] = this.props.lazy.getStatus(chunkName)
        this.promises[chunkName] = promises[chunkName](props)

        // subscribes the component to changes in the chunk's status
        this.props.lazy.subscribe(chunkName, this)

        // retrieves the initial component if there is one for this chunk
        component[chunkName] = this.props.lazy.getComponent(chunkName)
        error[chunkName] = null
      }
      // sets the initial state
      this.state = {status, component, error}
      // multi components need a multi context, singular components do not
      if (isMulti === true) {
        this.multiContext = {
          retry: this.retry,
          isLoading: null,
          isFailed: null,
          isDone: null,
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

    componentDidUpdate (prevProps) {
      // in the event that this components props change you can optionally
      // choose to reload the chunks with the new props. this is useful
      // in situations where you have a fetch() that changes with each
      // new page that is loaded/
      const {shouldBrokerUpdate} = this.props

      if (shouldBrokerUpdate !== null  && shouldBrokerUpdate !== void 0) {
        // I avoid Babel destructuring here because this way is much more
        // performant than using Babel's loop
        prevProps = Object.assign({}, prevProps)
        delete prevProps.lazy
        delete prevProps.shouldBrokerUpdate
        delete prevProps.children

        const props = Object.assign({}, this.props)
        delete props.lazy
        delete props.shouldBrokerUpdate
        delete props.children

        if (shouldBrokerUpdate(prevProps, props) === true) {
          this.promises = {}
          let status = {}, component = {}, error = {}

          for (let chunkName in promises) {
            status[chunkName] = LOADING
            component[chunkName] = null
            error[chunkName] = null
            this.promises[chunkName] = promises[chunkName](this.props)
            this.props.lazy.reload(chunkName, this.promises[chunkName])
          }

          this.setState({status, component, error})
        }
      }
    }

    componentWillUnmount () {
      this.mounted = false
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
      (chunkName, resolvedComponent) => this.mounted === true && this.setState(
        ({status, error, component}) => ({
          status: {...status, [chunkName]: RESOLVED},
          component: {...component, [chunkName]: resolvedComponent},
          error: {...error, [chunkName]: null}
        })
      )

    // sets REJECTED status for chunks that have been rejected
    rejected =
      (chunkName, error) => this.mounted === true && this.setState(
        ({status, error, component}) => ({
          status: {...status, [chunkName]: REJECTED},
          error: {...error, [chunkName]: error}
        })
      )

    // loads all of the chunks assigned to this component and passes any
    // defined props along to the promise wrapper
    static load = (props = emptyObj) =>
      Promise.all(Object.values(promises).map(p => p(props)))

    // reloads all chunks
    retry = () => Promise.all(
      Object.keys(this.promises).map(
        chunkName => {
          this.promises[chunkName] = promises[chunkName](this.props)
          this.props.lazy.reload(chunkName, this.promises[chunkName])
        }
      )
    )

    render () {
      let {status, component, error} = this.state
      // I avoid Babel destructuring here because this way is much more
      // performant than using Babel's loop
      let props = Object.assign({}, this.props)
      delete props.children
      delete props.shouldBrokerUpdate
      delete props.lazy

      if (isMulti === false) {
        // this is a single-component lazy load it is treated it normally
        component = component[this.chunkName]

        switch (status[this.chunkName]) {
          case WAITING:
          case LOADING:
            // returns 'loading' component
            return opt.loading ? opt.loading(props, {retry: this.retry}) : null
          case REJECTED:
            // returns 'error' component
            error = error[this.chunkName]
            // if there isn't an explicitly defined 'error' component, the
            // 'loading' component will be used as a backup with the error
            // message passed in the second argument
            const render = opt.loading || opt.error
            return render ? render(props, {retry: this.retry, error}) : null
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
        this.multiContext.isFailed = status === REJECTED
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
  LazyConsumer.load = Lazy.load

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
lazy.loadAll = loadAll
lazy.createChunkCache = createChunkCache
lazy.Provider = LazyProvider
lazy.WAITING = 0
lazy.LOADING = 1
lazy.REJECTED = 2
lazy.RESOLVED = 3
