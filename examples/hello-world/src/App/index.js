import React from 'react'
import Broker from 'react-broker'
import lazy from 'react-broker/macro'


const lazyOptions = {
  loading: (props, broker) => <span style={{
    width: 24,
    height: 24,
    backgroundColor: '#ccc',
    borderRadius: 12,
    ...props.style
  }}/>
}

const Emojify = lazy('react-emojione', lazyOptions)


export default class App extends React.PureComponent {
  render () {
    const {chunkCache} = this.props

    return (
      <Broker.Provider chunkCache={chunkCache}>
        <Emojify style={{width: 48, height: 48}}>
          🌎 Hello 🌍 world 🌏
        </Emojify>
      </Broker.Provider>
    )
  }
}
