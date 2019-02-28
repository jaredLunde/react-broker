import React from 'react'
import lazy from 'react-broker/macro'
const LazyUserList = lazy('../components/UserList', '../components/UserRenderer')


export default ({users}) => (
  <>
    <h1>Welcome!!</h1>

    <LazyUserList>
      {(UserList, UserRenderer, lazy) =>
        lazy.isLoading
          ? 'Loading...'
          : <UserList users={users} render={UserRenderer}/>}
    </LazyUserList>
  </>
)
