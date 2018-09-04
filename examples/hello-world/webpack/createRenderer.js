import React from 'react'
import ReactDOMServer from 'react-dom/server'
import express from 'express'
import emptyArr from 'empty/array'
import emptyObj from 'empty/object'
import Broker from 'react-broker'


export default function createRenderer({
  // express middleware to apply to each request
  middleware = emptyArr,
  // contents of clientStats.json from the client compiler
  clientStats,
  // the React app to render
  App,
}) {
  // initializes express
  const app = express()
  // applies any user-defined middleware
  middleware.forEach(mw => app.use(mw))

  // only needs one route
  app.get(
    '*',
    async (req, res, next) => {
      // keeps track of lazy chunks used by the current page
      const chunkCache = Broker.createChunkCache()
      const app = <App chunkCache={chunkCache}/>
      // preloads the async components and when done renders the app string
      await Broker.loadAll(app)
      // renders the app to a string
      const page = ReactDOMServer.renderToString(app)
      // outputs the request
      res.set('Content-Type', 'text/html')
      res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <title>Hello world app</title>
          <meta charset="utf-8">
          <meta
            name="viewport"
            content="width=device-width, user-scalable=yes, initial-scale=1.0"
          >
          ${chunkCache.getChunkScripts(clientStats)}
        </head>
        <body>
          <div id="⚛️">
            ${page}
          </div>
        </body>
        </html>
      `)
    }
  )

  return app
}
