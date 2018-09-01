### Macro
- [ ] Don't 'join' if the path isn't relative (doesn't `.startWith('./')`)

### lazy
- [ ] lazy.getChunkScripts([webpackStats, chunkNames])
  - [ ] graphChunks(findChunks(clientStats, chunkNames))

# future
- [ ] Accept multiple loaders
  - [ ] Use render props-like pattern for this component
        ```js
        const LazyPage = lazy(['./path/to/Page', ({id}) => fetch('...${id}.json')])
        const NextLazyPage = lazy('./path/to/NextPage', {loading: 'Loading...'})


        class App extends React.Component {
          render () {
            const {router: {match : {params}}} = this.props

            return (
              <main>
                <LazyPage id={params.id}>
                  {(Page, data) => <Page {...data}/>}}
                </LazyPage>

                <a onMouseEnter={NextLazyPage.load}>
                  next >
                </a>
              </main>
            )
          }
        }

        ```
