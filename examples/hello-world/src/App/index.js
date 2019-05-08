import React from 'react'
import * as Broker from 'react-broker'
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

const Emojis = lazy('react-emoji-component', lazyOptions)


export default class App extends React.PureComponent {
  render () {
    const {chunkCache} = this.props

    return (
      <Broker.Provider chunkCache={chunkCache}>
        <div style={{textAlign: 'center', width: '100%'}}>
          <Emojis size={64}>
            <div>
              🌏
            </div>
          </Emojis>

          <Emojis size={16}>
            🌎 Hello 🌍 world 🌏
          </Emojis>
        </div>
      </Broker.Provider>
    )
  }
}
