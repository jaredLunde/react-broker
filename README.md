![Wolf of Wall Street gif](https://media.giphy.com/media/8Q31McooUHTNu/giphy.gif)
# `react-broker`

Asynchronous components for React 16.3+ perfect for code splitting and the
simplest SSR story you've ever seen out-of-the-box.

Critically, this package is only intended to work with Webpack, specifically
Webpack 4 and future versions. There are no plans to implement a design
accommodating Parcel or other bundlers. There is also a hard requirement
for `babel-plugin-macros` (which is shipped with CRA). 

```js
import lazy from 'react-broker/macro'

// Automatically generates require.ensure/dynamic imports for webpack with
// babel-plugin-macros. Just give it the path.
const LazyPage = lazy('../pages/Page', {loading: () => 'Loading...'})

////////////////////////////////////////////////////////////////////////////////
//                               ⬇ BECOMES ⬇                                //
///////////////////////////////////////////////////////////////////////////////

const LazyPage =
  (typeof Broker !== 'undefined' ? Broker : require('${pkgName}').default(
    {
      'pages/Page': new Promise(function (resolve) {
        return require.ensure(
          [],
          function (require) {resolve(require('../pages/Page'))},
          'pages/Page'
        )
      })
    },
    {loading: () => 'Loading...'}
  )
```

### Requirements
- Webpack 4+ (because `chunks`)
- React 16.3+ (because `createContext`)
- Babel (because `babel-plugin-macros`)

### Installation
`yarn add react-broker` or `npm i react-broker`

--------------------------------------------------------------------------------

## Documentation
### `react-broker/macro`
The function that transforms your imports and delegates your async components.

```js
import lazy from 'react-broker/macro'
```

#### `lazy(componentPath <Array|String|Function>, options <Object>)`
**componentPath**

**options**

--------------------------------------------------------------------------------

### `Broker.Lazy`
This is the component created by `react-broker/macro`.
#### `Lazy.load(props <Object>)`
Preloads the component.

--------------------------------------------------------------------------------

### `Broker.Provider`
Manages code-splitting and the resolution of your async components by
keeping track of which chunk names have been loaded and also determining
which `<scripts>` need to be included from the server-side.

#### Props
##### `chunkCache <Broker.createChunkCache>`

--------------------------------------------------------------------------------

### `Broker.createChunkCache`
Creates a context for `Broker.Provider` to track chunks in and provides
helper methods to provide access to those chunks.
##### `createChunkCache.getChunkNames()`
Returns an `array` of all the Webpack chunk names loaded into the current app.
##### `createChunkCache.getChunks(webpackStats)`
Returns a `Set` of all the Webpack chunks loaded into the current app.
##### `createChunkCache.getChunkScripts(webpackStats)`
Returns a `string` representation of all the `<script>` tags to include in the
output of your app when using with SSR.

--------------------------------------------------------------------------------

### `Broker.load(components <Array>)`
Preloads one or several `Lazy` components.

--------------------------------------------------------------------------------

### `Broker.loadAll(App: React.Element)`
Preloads all of the components in your app. This is used on the server-side and
in the pre-render phase of the client.

--------------------------------------------------------------------------------

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

Broker.loadAll(app).then(
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
  // These are the Webpack compiltaion stats returned by Webpack post-run.
  // https://webpack.js.org/api/stats/
  clientStats
}) {
  app = express()

  app.get('*', /* Note 'async' here */ async (req, res, next) => {
    res.set('Content-Type', 'text/html')
    // keeps track of lazy chunks used by the current page
    const chunkCache = createChunkCache()
    // chunkCache is passed to Broker.Provider as a prop
    const app = (
      <Broker.Provider chunkCache={chunkCache}>
        <App/>
      </Broker.Provider>
    )
    // Preloads the async components - this should always happen before
    // ReactDOMServer.renderToString()
    await Broker.loadAll(app)
    // renders the application to a string
    const page = ReactDOMServer.renderToString(app)

    res.send(`
      <html>
        <head>
          ${chunkCache.getChunkScripts(clientStats)}
        </head>
        <body>
          <div id='⚛️'>
            ${app}
          </div>
        </body>
      </html>
    `)
  })

  return app
}
```
