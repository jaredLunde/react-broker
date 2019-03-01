![Wolf of Wall Street gif](https://media.giphy.com/media/8Q31McooUHTNu/giphy.gif)
# `react-broker`

A  [lightweight](https://bundlephobia.com/result?p=react-broker) library for lazy components using React 16.3+. It's perfect for 
code splitting and has the simplest SSR story you've ever seen out-of-the-box.

Critically, this package is only intended to work with Webpack, specifically
Webpack 4 and future versions. There are no plans to implement a design
accommodating Parcel or other bundlers. There is also a hard requirement
for `babel-plugin-macros` (which is shipped with CRA).

```js
import lazy from 'react-broker/macro'

// Automatically generates dynamic imports for webpack with babel-plugin-macros. 
// Just give it the path.
const LazyPage = lazy('../pages/Page', {loading: props => 'Loading...'})

////////////////////////////////////////////////////////////////////////////////
//                               ⬇ BECOMES ⬇                                //
///////////////////////////////////////////////////////////////////////////////

const LazyPage =
  (typeof Broker !== 'undefined' ? Broker : require('react-broker').default)(
    {
      'src/pages/Page': import(/* webpackChunkName: "src/pages/Page" */ '../pages/Page')
    },
    {loading: props => 'Loading...'}
  )
  
function App () {
  // Look at me! I'm used like a normal component.
  return <LazyPage id='1'/>
}
```

### Requirements
- Webpack 4+ (because `chunks`)
- React 16.3+ (because `createContext`)
- Babel (because `babel-plugin-macros`)

### Installation
`yarn add react-broker` or `npm i react-broker`

### Examples
**[Hello world](examples/hello-world)**<br/>
**[Hello world w/ Router](examples/hello-world-router)**

--------------------------------------------------------------------------------

## Documentation
### `react-broker/macro`
The function that transforms your imports and delegates your async components.

```js
import lazy from 'react-broker/macro'
```

#### `lazy(component <String>, options <Object>)`
**component** `{String}`<br/>
A path to a React component you want to lazy load. The component must be in the `default` 
export of the file. 

Paths cannot be passed via an identifier, it has to be a plain string. It is used just like a 
regular component. 

You may also lazy load external library components, but just know that the component in question must be the 
`default` export.
```js
// Single component macro
// Used like a regular component
const LazyPage = lazy('./pages/Home', {loading: props => 'Loading ${props.id}...'})
<LazyPage id={1}>
  // ...
</LazyPage>
```

**options** `{Object}`<br/>
NOTE: Only single-component macros have these options
- `loading (props, context{retry, error})`
  - **props** props passed the component
  - **context**
    - `retry` is a function which will force a reload of the component
    - `error` is any error returned by `Promise.reject`, this is only relevant
      if an `error` component isn't also defined in options
- `error (props, context{retry, error})`
  - See `loading`
--------------------------------------------------------------------------------

### `Broker.Provider`
Manages code-splitting and the resolution of your async components by
keeping track of which chunk names have been loaded and also determining
which `<scripts>` need to be included from the server-side. `Broker.Provider`
must be defined at the top-level of your lazy loaded components.

#### Props
##### chunkCache `{Broker.createChunkCache}`
You only provide a `chunkCache` on the server side. In the client it is not
allowed. The chunk cache is used for tracking which chunks were loaded during
the latest render phase of the app.
`Broker.createChunkCache`

```js
import Broker from 'react-broker'

const chunkCache = Broker.createChunkCache()

function App (props) {
  return (
    <Broker.Provider chunkCache={chunkCache}>
      <LazyPage id={props.id}/>
    </Broker.Provider>
  )
}
```
--------------------------------------------------------------------------------

### `Broker.createChunkCache`
Creates a context for `Broker.Provider` to track chunks in and provides
helper methods to provide access to those chunks.

##### `createChunkCache.getChunkNames()`
Returns an `array` of all the Webpack chunk names loaded into the current app.

##### `createChunkCache.getChunks(webpackStats)`
Returns a `Set` of all the Webpack chunks loaded into the current app.
- `webpackStats` `<Object>`
  - The [stats](https://webpack.js.org/configuration/stats/) object created by 
    Webpack.
    
##### `createChunkCache.getChunkScripts(webpackStats, options)`
Returns a `string` representation of all the `<script>` tags to include in the
output of your app when using with SSR.
- `webpackStats` `{Object}`
  - The [stats](https://webpack.js.org/configuration/stats/) object created by 
    Webpack.
- `options` `{Object}`
  - `preload` `{Bool|Object}`
     - If `true`, this will generate `<link rel='preload'>` tags with your scripts.
     - If an `object`, the key/value pairs will be added to the `<link rel='preload'>` 
       tags as attributes. e.g. `{preload: {crossorigin: 'anonymous'}}` generates
       `<link rel='preload' as='script' crossorigin='anonymous' href='...'>`
  - `async` `{Bool}`
     - If `true`, an `async` flag will be added to your `<script>` tags
     - **default** `true`
  - `defer` `{Bool}`
     - If `true`, a `defer` flag will be added to your `<script>` tags and `async`
       will be omitted
     - **default** `false`

#### See the [SSR section](#serverrenderjs) for an example

--------------------------------------------------------------------------------

### `Broker.Lazy`
This is the component created by `react-broker/macro`.

To skip the macro you could do something like this with the Webpack code-splitting
API:
```js
import Broker from 'react-broker'
Broker({uniqueChunkName: import(...)}, {loading: props => 'Loading...'})
```

#### `Lazy.load()`
Preloads the component.
```js
const LazyPage = lazy('./pages/Home')
// ...
<Link onMouseEnter={LazyPage.load}>
  Home
</Link>
```

--------------------------------------------------------------------------------

### `Broker.load(...components <String>)`
Preloads one or several `Lazy` components.

```js
import Broker from 'react-broker'
import lazy from 'react-broker/macro'

const LazyA = lazy('./A')
const LazyB = lazy('./B')

Broker.load(LazyA, LazyB).then(/*...*/)
```

--------------------------------------------------------------------------------

### `Broker.loadAll(`
#### `  App: React.Element,`
#### `  renderer: ReactDOM.renderToStaticMarkup|renderToString`
### `)`
Tracks all of the chunks used in your app during the server side render and
optionally renders your app to a string

- `App` `{React.Element}`
  - Your React application
- `renderer` `{ReactDOM.renderToStaticMarkup|ReactDOM.renderToString}`
  - **default** `ReactDOM.renderToStaticMarkup`
  - The renderer used for determining the chunks used in your app. To avoid,
    extra renders, you could change this to `ReactDOM.renderToString.
  
#### See the [SSR section](#serverrenderjs) for an example

--------------------------------------------------------------------------------

### `Broker.loadInitial(chunkCache: Broker.createChunkCache)`
Populates your chunk cache with the async components present in your application.
This requires that `Broker.getChunkScripts` was used on the server side. The primary
use case for this function is elimination loading components and flashes when 
initially rendering your app in the browser.

#### See the [SSR section](#clientrenderjs) for an example

--------------------------------------------------------------------------------

### Playing nice with `react-apollo`
To make Broker load correctly with `react-apollo` and avoid Promise-level conflicts,
see this [custom getMarkupFromTree](https://github.com/jaredLunde/stellar-apps/blob/master/packages/apollo/src/getMarkupFromTree.js).

You can use this as a drop-in replacement for `react-apollo/getMarkupFromTree`,
`react-apollo/getDataFromTree`, and `Broker.loadAll`.

#### Example
```js
import {getMarkupFromTree} from '@stellar-apps/apollo'

const page = await getMarkupFromTree({
  tree: app, 
  renderFunction: ReactDOMServer.renderToString
})
```

-------------------------------------------------------------------------------

## Server-side Rendering

#### client/render.js
```js
import React from 'react'
import ReactDOM from 'react-dom'
import Broker from 'react-broker'
import App from '../App'


const app = (
  <Broker.Provider>
    <App/>
  </Broker.Provider>
)

Broker.loadInitial().then(
  () => ReactDOM.hydrate(app, document.getElementById('⚛️'))
)
```

#### server/render.js
```js
import React from 'react'
import ReactDOMServer from 'react-dom/server'
import express from 'express'
import Broker from 'react-broker'
import App from '../App'


export default function createRenderer({
  // These are the Webpack compilation stats returned by Webpack post-run.
  // https://webpack.js.org/api/stats/
  clientStats
}) {
  app = express()

  app.get('*', /* Note 'async' here */ async (req, res, next) => {
    res.set('Content-Type', 'text/html')
    // keeps track of lazy chunks used by the current page
    const chunkCache = Broker.createChunkCache()
    // chunkCache is passed to Broker.Provider as a prop
    const app = (
      <Broker.Provider chunkCache={chunkCache}>
        <App/>
      </Broker.Provider>
    )
    // Preloads the async components and renders the app to a string
    const page = await Broker.loadAll(app, ReactDOMServer.renderToString)
    // You could also do this if you have other requirements in addition to preloading with
    // react-broker
    // await Broker.loadAll(app, ReactDOMServer.renderToStaticMarkup)
    // const page = await ReactDOMServer.renderToString(app)
    
    // Generates <script> and <preload> tags for this page
    const chunks = chunkCache.getChunkScripts(clientStats, {preload: true})

    res.send(`
      <html>
        <head>
          ${chunks.preload}
        </head>
        <body>
          <div id='⚛️'>
            ${app}
          </div>
          ${chunks.scripts}
        </body>
      </html>
    `)
  })

  return app
}
```
