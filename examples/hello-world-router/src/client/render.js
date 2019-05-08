import React from 'react'
import ReactDOM from 'react-dom'
import * as Broker from 'react-broker'
import App from '../App'


async function hydrate (App) {
  const app = <App/>
  await Broker.loadInitial()
  ReactDOM.hydrate(app, document.getElementById('⚛️'))
}

module.hot && module.hot.accept('../App', () => hydrate(require('../App').default))
hydrate(App)
