import React from 'react'
import lazy from 'react-broker/macro'


export const LazyHome = lazy('./pages/Home')
export const LazyUser = lazy('./pages/User')
export const LazyPrivacy = lazy('./pages/Privacy', {loading: () => 'Loading...'})

const USERS = [
  {username: 'Mitch', id: 0},
  {username: 'Ryan', id: 1},
  {username: 'Pamela', id: 2},
  {username: 'Francis', id: 3},
  {username: 'Kathryn', id: 4},
  {username: 'Michelle', id: 5},
  {username: 'Jon', id: 6},
]

const routes = [
  {
    path: '/',
    exact: true,
    component: () => <LazyHome users={USERS}/>
  },
  {
    path: '/user/:id',
    exact: true,
    component: ({match: {params}}) => <LazyUser data={USERS[params.id]} users={USERS}/>
  },
  {
    path: '/privacy-policy',
    exact: true,
    component: LazyPrivacy
  }
]

export default routes
