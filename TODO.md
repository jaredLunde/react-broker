### Macro
- [x] Don't 'join' if the path isn't relative (doesn't `.startWith('./')`)

### lazy
- [x] lazy.getChunkScripts([webpackStats, chunkNames])
  - [x] graphChunks(findChunks(clientStats, chunkNames))

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

### Need to know:
- referencePath.parentPath.get('arguments')
  - [i].type (StringLiteral, ObjectExpression, ArrowFunctionExpression, FunctionExpression)
- StringLiteral
  - .node.value
- ObjectExpression
  - .node.properties
    - [i]
      - .key.name
      - value.name
- ArrayExpression
  - .node.elements
    - [i]
      - .value
      - .type (
        StringLiteral,
        ArrowFunctionExpression/FunctionExpression [.body]
      )
