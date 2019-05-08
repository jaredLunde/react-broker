import React from 'react'
import ReactDOM from 'react-dom'
import * as Broker from 'react-broker'
import App from '../App'


function hydrate (App) {
  const app = <App/>
  return Broker.loadInitial().then(
    () => ReactDOM.render(app, document.getElementById('⚛️'))
  )
}

module.hot && module.hot.accept()
hydrate(App)
