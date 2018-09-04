import React from 'react'


export default function UserList ({users, render}) {
  return (
    <ul>
      {users.map(render)}
    </ul>
  )
}
