# future
- [x] Accept multiple loaders
  - [x] Use render props-like pattern for this component
        ```js
        const LazyPage = lazy(
          ['./path/to/Page', ({id}) => fetch('...${id}.json')],
          shouldBrokerUpdate: (prev, next) => next.id !== prev.id
        )
        const NextLazyPage = lazy('./path/to/NextPage', {loading: 'Loading...'})


        class App extends React.Component {
          render () {
            const {router: {match : {params}}} = this.props

            return (
              <main>
                <LazyPage id={params.id}>
                  {(Page, data, broker) =>
                    broker.isDone && (
                      <Page {...data}/>
                    )}
                </LazyPage>

                <a onMouseEnter={NextLazyPage.load}>
                  next >
                </a>
              </main>
            )
          }
        }

        ```
