import React from 'react'
import lazy from 'react-broker/macro'
const name = 'UserList'
const LazyUserList = lazy(`../components/${name}`, '../components/UserRenderer')


export default ({users}) => (
  <>
    <h1>Welcome</h1>

    <LazyUserList>
      {(UserList, UserRenderer, lazy) =>
        lazy.isLoading
          ? 'Loading...'
          : <UserList users={users} render={UserRenderer}/>}
    </LazyUserList>
  </>
)
