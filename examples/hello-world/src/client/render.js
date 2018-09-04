import React from 'react'
import ReactDOM from 'react-dom'
import Broker from 'react-broker'
import App from '../App'


async function hydrate (App) {
  const app = <App/>
  const mod = await Broker.loadAll(app)
  console.log('[Broker] loaded modules:', mod)
  ReactDOM.render(app, document.getElementById('⚛️'))
}

module.hot && module.hot.accept('../App', () => hydrate(require('../App').default))
hydrate(App)
