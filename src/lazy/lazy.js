import React from 'react'
import PropTypes from 'prop-types'
import {CDLL} from 'cdll-memoize'
import emptyObj from 'empty/object'
import getDisplayName from 'react-display-name'
import reactTreeWalker from 'react-tree-walker'


const {Provider, Consumer} = React.createContext({})
const WAITING = 0
const LOADING = 1
const RESOLVED = 2
const REJECTED = 3

CDLL.prototype.forEach = function (cb) {
  let next = this.head.next
  cb(next.value)
  while (next !== this.head) {
    cb(next.value)
    next = next.next
  }
}

function visitor (element, instance) {
  if (instance && instance.isBrokerComponent === true) {
    return instance.pointer
  }
}

export const createChunkCache = () => new Map()
export const load = components => Promise.all(components.map(c => c.pointer))
export const loadAll = app => reactTreeWalker(app, visitor, emptyObj)


export class BrokerProvider extends React.Component {
  constructor (props) {
    super(props)
    this.chunkCache = props.chunkCache || new Map()
    this.providerContext = {
      load: this.load,
      subscribe: this.subscribe,
      unsubscribe: this.unsubscribe,
      getStatus: this.getStatus,
      getComponent: this.getComponent
    }
  }

  getStatus = chunkName => {
    const meta = this.chunkCache.get(chunkName)
    return meta === void 0 ? WAITING : meta.status
  }

  getComponent = chunkName => {
    const chunk = this.chunkCache.get(chunkName)
    return chunk && chunk.component
  }

  subscribe = (chunkName, lazyComponent) => {
    const chunk = this.chunkCache.get(chunkName)

    if (chunk === void 0) {
      const lazy = new CDLL()
      lazy.push(lazyComponent)
      this.chunkCache.set(chunkName, {status: WAITING, lazy})
      return this.load(chunkName, lazyComponent.pointer)
    }
    else {
      chunk.lazy.push(lazyComponent)
      return lazyComponent.pointer
    }
  }

  unsubscribe = (chunkName, lazyComponent) => {
    const chunk = this.chunkCache.get(chunkName)
    const element = chunk.lazy.find(lazyComponent)
    element !== void 0 && chunk.lazy.delete(element)
  }

  load = (chunkName, pointer) => {
    const chunk = this.chunkCache.get(chunkName)

    switch (chunk.status) {
      case RESOLVED:
        return Promise.resolve(chunk.component)
      case REJECTED:
      case WAITING:
        this.chunkCache.set(chunkName, {...chunk, status: LOADING})
        return pointer.then(
          component => this.resolved(chunkName, component),
          err => this.rejected(chunkName, err)
        )
    }

    return pointer
  }

  resolved = (chunkName, component) => {
    const meta = this.chunkCache.get(chunkName)

    if (meta.status !== RESOLVED) {
      meta.status = RESOLVED
      meta.component = component.default === void 0 ? component : component.default
      meta.lazy.forEach(c => c.resolved(meta.component))
    }

    return component
  }

  rejected = (chunkName, err) => {
    const meta = this.chunkCache.get(chunkName)

    if (meta.status !== REJECTED) {
      meta.status = REJECTED
      meta.lazy.forEach(c => c.rejected(err))
    }
  }

  render () {
    const children = React.Children.only(this.props.children)
    return <Provider value={this.providerContext} children={children}/>
  }
}


export default function lazy (
  promise,
  opt = {
    loading: null,
    error: null
  },
  chunkName
) {
  let state = {}

  class Lazy extends React.Component {
    isBrokerComponent = true
    unmounted = false
    pointer = promise()

    static propTypes = {
      lazy: PropTypes.object,
      loading: PropTypes.func,
      error: PropTypes.func
    }

    constructor (props) {
      super(props)
      const status = props.lazy.getStatus(chunkName)
      const component = props.lazy.getComponent(chunkName)
      status !== RESOLVED && props.lazy.subscribe(chunkName, this)
      this.state = {status, component, error: null}
    }

    componentWillUnmount () {
      this.unmounted = true
      this.props.lazy.unsubscribe(chunkName, this)
    }

    resolved = component => this.setState({
      status: RESOLVED,
      error: null,
      component,
    })

    rejected = error => this.setState({status: REJECTED, error})

    retry = () => this.props.lazy.load(this.pointer, chunkName)
    static load = promise

    render () {
      const {status, component, error} = this.state
      let props = Object.assign({}, this.props)
      delete props.lazy

      switch (status) {
        case WAITING:
        case LOADING:
          return opt.loading ? opt.loading(props) : null
        case REJECTED:
          props.retry = this.retry
          return opt.loading ? opt.error(props, error) : null
        case RESOLVED:
          return React.createElement(component, props)
      }
    }
  }

  return function LazyConsumer (props) {
    return (
      <Consumer>
        {cxt => <Lazy lazy={cxt} {...props}/>}
      </Consumer>
    )
  }
}

lazy.load = load
lazy.loadAll = loadAll
lazy.createChunkCache = createChunkCache
lazy.Provider = BrokerProvider
