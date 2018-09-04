import React from 'react'
import Broker from 'react-broker'
import {Header, Main, Footer} from './components'


export default class App extends React.PureComponent {
  render () {
    const {chunkCache} = this.props

    return (
      <Broker.Provider chunkCache={chunkCache}>
        <div id='app'>
          <Header/>
          <Main/>
          <Footer/>
        </div>
      </Broker.Provider>
    )
  }
}
