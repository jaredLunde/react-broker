import React from 'react'
import * as Broker from 'react-broker'
import lazy from 'react-broker/macro'
import {BrowserRouter, StaticRouter, Switch, Route} from 'react-router-dom'
import routes from './routes'


const Footer = lazy('./components/Footer')

export default class App extends React.PureComponent {
  render () {
    const {chunkCache, location} = this.props
    const Router = __PLATFORM__ === 'client' ? BrowserRouter : StaticRouter

    return (
      <Broker.Provider chunkCache={chunkCache}>
        <Router context={{}} location={location}>
          <div id='app'>
            <Switch>
              {routes.map(route => <Route key={route.path} {...route}/>)}
            </Switch>

            <Footer/>
          </div>
        </Router>
      </Broker.Provider>
    )
  }
}
