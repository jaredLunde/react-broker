import React from 'react'
import lazy from 'react-broker/macro'
const Emojify = lazy(
  'react-emojione',
  {
    loading: (props, broker) => <span style={{
      width: 24,
      height: 24,
      backgroundColor: '#ccc',
      borderRadius: 12,
      ...props.style
    }}/>
  }
)


export default function Main (props) {
  return (
    <Emojify>
      🌎 Hello 🌍 world 🌏
    </Emojify>
  )
}
