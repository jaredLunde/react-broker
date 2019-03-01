import React from 'react'
import lazy from 'react-broker/macro'
const UserList = lazy('../components/UserList')
const UserRenderer = lazy('../components/UserRenderer')


export default ({users}) => (
  <>
    <h1>Welcome!!</h1>
    <UserList users={users} render={UserRenderer}/>
  </>
)
