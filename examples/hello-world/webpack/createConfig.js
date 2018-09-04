const webpack = require('webpack')
const merge = require('webpack-merge')
const WriteFilePlugin = require('write-file-webpack-plugin')
const path = require('path')


module.exports = function createConfig (...configs) {
  let {
    target = 'web',
    ...config
  } = merge.smartStrategy({'module.rules': 'prepend'})(...configs)

  const envTarget = target === 'node' ? {"node": "current"} : {"browsers": "defaults"}

  const mainFields =
    target === 'web'
    ? ['browser', 'jsnext', 'esnext', 'jsnext:main', 'main']
    : ['jsnext', 'esnext', 'jsnext:main', 'main']

  return merge.smartStrategy({'module.rules': 'prepend'})(
    {
      devtool: 'eval',
      target,

      // The base directory for resolving the entry option
      output: {
        publicPath: '/public/',
        pathinfo: true
      },

      // Where to resolve our loaders
      resolveLoader: {
        modules: ['node_modules'],
        moduleExtensions: ['-loader'],
      },

      resolve: {
        // Directories that contain our modules
        symlinks: false,
        modules: ['node_modules'],
        mainFields,
        descriptionFiles: ['package.json'],
        // Extensions used to resolve modules
        extensions: ['.js']
      },

      module: {
        rules: [
          {
            test: /(\.js)$/,
            use: {
              loader: 'babel',
              options: {
                cacheDirectory: true,
                presets: [
                  [
                    '@inst-app/esx', {
                      env: {
                        "useBuiltIns": "usage",
                        "loose": true,
                        "modules": false
                      },
                      "runtime": {corejs: 2}
                    }
                  ],
                  '@inst-app/react',
                ],
                plugins: ['macros']
              }
            },
            exclude: /node_modules/
          }
        ]
      },

      plugins: [
        new WriteFilePlugin(),
        new webpack.NoEmitOnErrorsPlugin(),
      ],

      // Include mocks for when node.js specific modules may be required
      node: {
        fs: 'empty',
        vm: 'empty',
        net: 'empty',
        tls: 'empty'
      }
    },
    config
  )
}
