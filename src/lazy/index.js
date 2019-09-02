import React, {
  useContext,
  useEffect,
  useCallback,
  useMemo,
  useReducer,
} from 'react'
import {ServerPromisesContext, loadPromises} from '@react-hook/server-promises'
import {getChunkScripts, findChunks} from './utils'

// context is necessary for keeping track of which components in the
// current react tree depend on which corresponding chunks/promises
const BrokerContext = React.createContext({}),
  WAITING = 0, // promise has not yet started loading
  LOADING = 1, // promise has started loading
  REJECTED = -1, // promise was rejected
  RESOLVED = 3 // promise was successfully resolved

// tracks the chunks used in the rendering of a tree
const createChunkCache = () => {
  let map = {},
    cache = {
      get: k => map[k],
      set: (k, v) => (map[k] = v),
      invalidate: k => delete map[k],
      // returns an array of chunk names used by the current react tree
      getChunkNames: () => Object.keys(map),
      // returns a Set of Webpack chunk objects used by the current react tree
      getChunks: stats => findChunks(stats, cache.getChunkNames()),
      // returns a string of <script> tags for Webpack chunks used by the
      // current react tree
      getChunkScripts: (stats, opt = {}) => getChunkScripts(stats, cache, opt),
    }

  if (__DEV__)
    cache.forEach = fn => Object.keys(map).forEach(k => fn(k, map[k]))
  return cache
}

// loads an array of Lazy components
const load = (...instances) => Promise.all(instances.map(i => i.load()))
// resolves components on the server
const loadAll = loadPromises
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
      new Promise(resolve => {
        if (script.getAttribute('data-loaded')) resolve()
        else script.addEventListener('load', resolve)
      })
    )
  }

  return Promise.all(loading).then(() =>
    Object.keys(chunks).forEach(chunkName => {
      let component

      try {
        component = __webpack_require__(chunks[chunkName]).default
      } finally {
        // sets the component in the chunk cache if it is valid
        if (typeof component === 'function') {
          if (typeof module !== 'undefined' && module.hot)
            __webpack_require__.c[chunks[chunkName]].hot.accept()

          chunkCache.set(chunkName, {status: RESOLVED, component})
        }
      }
    })
  )
}

const globalChunkCache = createChunkCache(),
  childContextDispatcher = (state, {chunkName, chunk}) => {
    state.chunks.set(chunkName, chunk)
    return Object.assign({}, state)
  }

const Provider = ({
  children,
  chunkCache = globalChunkCache,
  ssrContext = ServerPromisesContext,
}) => {
  const context = useContext(ssrContext)

  const resolved = useCallback(
    (chunkName, component) => {
      // updates a chunk's consumers when the chunk is resolved and sets the
      // chunk status to 'RESOLVED'
      const chunk = chunkCache.get(chunkName)

      if (chunk.status !== RESOLVED) {
        chunk.status = RESOLVED
        // modules typically resolve with a 'default' attribute, but some don't.
        // likewise, fetch() never resolves with a 'default' attribute.
        chunk.component =
          component && component.default !== void 0
            ? component.default
            : component
        // updates each chunk listener with the resolved component
        dispatchChildContext({chunkName, chunk})
      }

      return chunk.component
    },
    [chunkCache]
  )

  const rejected = useCallback(
    (chunkName, error) => {
      // updates a chunk's consumers when the chunk is rejected and sets the
      // chunk status to 'REJECTED'
      const chunk = chunkCache.get(chunkName)

      if (chunk.status !== REJECTED) {
        chunk.status = REJECTED
        chunk.error = error
        // updates each chunk listener with the caught error
        dispatchChildContext({chunkName, chunk})
      }

      return error
    },
    [chunkCache]
  )

  const load = useCallback(
    (chunkName, promise) => {
      // loads a given chunk and updates its consumers when it is resolved or
      // rejected. also sets the chunk's status to 'LOADING' if it hasn't
      // already resolved
      const chunk = chunkCache.get(chunkName)

      if (chunk.status === WAITING) {
        // tells registered components that we've started loading this chunk
        chunk.promise = promise
          .then(component => resolved(chunkName, component))
          .catch(err => rejected(chunkName, err))
        chunk.status = LOADING
        dispatchChildContext({chunkName, chunk})
      }

      return chunk.promise
    },
    [chunkCache, resolved, rejected]
  )

  const add = useCallback(
    (chunkName, promise) => {
      const chunk = chunkCache.get(chunkName)

      if (chunk === void 0 || chunk.status === WAITING) {
        // adds the chunk to the chunk cache
        chunkCache.set(chunkName, {status: WAITING})
        promise = promise()
        if (context) context.push(promise)
        return load(chunkName, promise)
      } else {
        // this chunk has already resolved
        return chunk.promise
      }
    },
    [chunkCache, load, ssrContext]
  )

  const initialState = () => ({load, add, chunks: chunkCache}),
    [childContext, dispatchChildContext] = useReducer(
      childContextDispatcher,
      null,
      initialState
    )

  if (__DEV__) {
    useEffect(() => {
      let invalidateChunks

      if (typeof module !== 'undefined' && module.hot) {
        invalidateChunks = status => {
          if (status === 'idle') {
            // fetches any preloaded chunks
            console.log('[Broker HMR] reloading')
            let chunks = document.getElementById('__INITIAL_BROKER_CHUNKS__')

            if (chunks) {
              // initial chunks were loaded and we need this workaround to get them to
              // refresh for some reason
              chunks = JSON.parse(chunks.firstChild.data)

              Object.keys(chunks).forEach(chunkName => {
                if (typeof module !== 'undefined' && module.hot) {
                  try {
                    __webpack_require__(chunks[chunkName]).default
                  } finally {
                    const chunk = chunkCache.get(chunkName)
                    chunk.status = WAITING

                    load(
                      chunkName,
                      Promise.resolve(
                        __webpack_require__.c[chunks[chunkName]].exports
                      )
                    )

                    __webpack_require__.c[chunks[chunkName]].hot.accept()
                    console.log(' -', chunkName)
                  }
                }
              })
            }
          } else if (status === 'apply') {
            chunkCache.forEach((chunkName, chunk) => {
              if (chunk.status !== WAITING && chunk.status !== LOADING) {
                chunk.status = WAITING
                console.log(' -', chunkName)
              }
            })
          }
        }

        module.hot.addStatusHandler(invalidateChunks)
      }

      return () =>
        invalidateChunks && module.hot.removeStatusHandler(invalidateChunks)
    }, [load, chunkCache])
  }

  return <BrokerContext.Provider value={childContext} children={children} />
}

const BrokerProvider = Provider,
  defaultOpt = {loading: null, error: null},
  emptyArr = []

const lazy = (chunkName, promise, opt = defaultOpt) => {
  const Lazy = props => {
    const broker = useContext(BrokerContext),
      load = useCallback(() => broker.load(chunkName, promise()), emptyArr),
      chunk = broker.chunks.get(chunkName)
    useMemo(() => broker.add(chunkName, promise), emptyArr)
    let render

    switch (chunk?.status) {
      case REJECTED:
        // returns 'error' component
        // if there isn't an explicitly defined 'error' component, the
        // 'loading' component will be used as a backup with the error
        // message passed in the second argument
        render = opt.error || opt.loading
        return render ? render(props, {retry: load, error: chunk.error}) : null
      case RESOLVED:
        // returns the proper resolved component
        return React.createElement(chunk.component, props)
      default:
        // returns 'loading' component
        return opt.loading
          ? opt.loading(props, {retry: load, error: null})
          : null
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
}
