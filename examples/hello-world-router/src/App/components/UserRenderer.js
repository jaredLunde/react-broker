import React from 'react'
import {Link} from 'react-router-dom'
import {LazyUser} from '../routes'


export default function UserRenderer (props) {
  return (
    <li key={props.id}>
      <Link to={`/user/${props.id}`} onMouseEnter={LazyUser.load}>
        {props.username}
      </Link>
    </li>
  )
}
