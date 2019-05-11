import React from 'react'


export default ({users, render}) => (
  <ul>
    {users.map(data => React.createElement(render, {key: data.id, ...data}))}
  </ul>
)