import React from 'react'
import {Link} from 'react-router-dom'
import {LazyHome, LazyUser} from '../routes'


export default ({data: {username, id}, users}) => (
  <div>
    <Link to='/' onMouseEnter={LazyHome.load}>
      &lt; back
    </Link>

    <h1>👋🏻 Hello {username}</h1>

    <ul>
      {users.map(
        u => (
          <li key={u.id}>
            <Link to={`/user/${u.id}`} children={u.username}/>
          </li>
        )
      )}
    </ul>
  </div>
)
