![Wolf of Wall Street gif](https://media.giphy.com/media/8Q31McooUHTNu/giphy.gif)
# `react-broker`

Asynchronous components for React 16.3+ perfect for code splitting and the
simplest SSR story you've ever seen out-of-the-box.

```js
import Broker from 'react-broker'
import lazy from 'react-broker/macro'

// Automatically generates require.ensure/dynamic imports for webpack with
// babel-plugin-macros. Just give it the path.
const LazyPage = lazy('../pages/Page', {loading: () => 'Loading...'})
////////////////////////////////////////////////////////////////////////////////
//                               ⬇ BECOMES ⬇                                //
///////////////////////////////////////////////////////////////////////////////
const LazyPage = require('react-broker').default(
  new Promise(function (resolve) {
    return require.ensure(
      [],
      function (require) {resolve(require('../pages/Page'))},
      'pages/Page'
    )
  }),
  {loading: () => 'Loading...'},
  'pages/Page'
)

// Use it like a regular component
function App (props) {
  return (
    <Broker.Provider chunkCache={props.chunkCache/*for SSR and module resolution*/}>
      <LazyPage id={1}/>
    </Broker.Provider>
  )
}
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

--------------------------------------------------------------------------------

### `Broker.Lazy`
This is the component created by `react-broker/macro`.
#### `Lazy.load()`
Preloads the component.
#### `Lazy.retry()`
Retries loading the component in the event of a failure.

--------------------------------------------------------------------------------

### `Broker.Provider`
Manages code-splitting and the resolution of your async components by
keeping track of which chunk names have been loaded and also determining
which `<scripts>` need to be included from the server-side.

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

### `Broker.load(Lazy: Array)`
Preloads one or several `Lazy` components.

--------------------------------------------------------------------------------

### `Broker.loadAll(App: React.Element)`
Preloads all of the components in your app. This is used on the server-side and
in the pre-render phase of the client.
