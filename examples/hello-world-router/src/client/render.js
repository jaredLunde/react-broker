import React from 'react'
import ReactDOM from 'react-dom'
import Broker from 'react-broker'
import App from '../App'


function hydrate (App) {
  const app = <App/>
  return Broker.loadAll(app).then(
    () => ReactDOM.hydrate(app, document.getElementById('⚛️'))
  )
}

module.hot && module.hot.accept('../App', () => hydrate(require('../App').default))
hydrate(App)
