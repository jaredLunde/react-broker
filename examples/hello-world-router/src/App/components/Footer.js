import React from 'react'
import {Link} from 'react-router-dom'
import {LazyPrivacy} from '../routes'


export default () => (
  <footer style={{padding: '1rem 0', margin: '1rem 0 0', borderTop: '1px solid #ccc'}}>
    <Link to='/privacy-policy' onMouseEnter={LazyPrivacy.load}>
      Privacy policy
    </Link>
  </footer>
)
