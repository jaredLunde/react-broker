import React from 'react'
import {Link} from 'react-router-dom'
import {LazyHome} from '../routes'


export default () => (
  <div>
    <Link to='/' onMouseEnter={LazyHome.load}>
      &lt; back
    </Link>

    <h1>You can have no expectation of privacy so long as you're here on the interwebs</h1>
  </div>
)
