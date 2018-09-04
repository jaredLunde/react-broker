const createConfig = require('../../../hello-world/webpack/createConfig')
const path = require('path')
const webpack = require('webpack')
const UglifyJsPlugin = require('uglifyjs-webpack-plugin')


let productionPlugins = []
let productionOptimization = {}

if (process.env.NODE_ENV === 'production') {
  productionPlugins = [
    new webpack.optimize.AggressiveSplittingPlugin({minSize: 24000, maxSize: 96000}),
    new webpack.LoaderOptionsPlugin({minimize: false, debug: false})
  ]

  productionOptimization = {
    minimize: true,
    minimizer: [
      new UglifyJsPlugin({
        cache: true,
        uglifyOptions: {
          compress: {passes: 2, drop_console: false, dead_code: true},
          output: {comments: false},
          sourceMap: false
        }
      })
    ]
  }
}

module.exports = createConfig({
  name: 'client',
  target: 'web',
  mode: process.env.NODE_ENV || 'development',

  entry: [path.join(__dirname, '../../src/client/render.js')],

  output: {
    path: path.join(__dirname, '../../dist/client'),
    filename: `js/hello-world.development.js`,
    chunkFilename: `js/hello-world.development.[chunkhash].js`,
    publicPath: '/public/'
  },

  plugins: [
    new webpack.DefinePlugin({
      __PLATFORM__: JSON.stringify('client'),
      __DEV__: JSON.stringify(process.env.NODE_ENV === 'development')
    }),
    ...productionPlugins
  ],

  optimization: productionOptimization
})
