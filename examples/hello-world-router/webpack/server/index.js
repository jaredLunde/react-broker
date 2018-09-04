const createConfig = require('../../../hello-world/webpack/createConfig')
const webpack = require('webpack')
const path = require('path')


module.exports = createConfig({
  name: 'server',
  target: 'node',
  mode: process.env.NODE_ENV || 'development',

  entry: {
    m: path.join(__dirname, '../../src/server/render.js')
  },

  externals: ['encoding', 'express'],

  output: {
    path: path.join(__dirname, '../../dist/server'),
    filename: `js/hello-world.development.js`,
    chunkFilename: `js/hello-world.development.[chunkhash].js`,
    libraryTarget: 'commonjs2',
    publicPath: '/public/'
  },

  plugins: [
    new webpack.optimize.LimitChunkCountPlugin({maxChunks: 1}),
    new webpack.DefinePlugin({
      __PLATFORM__: JSON.stringify('server'),
      __DEV__: JSON.stringify(process.env.NODE_ENV === 'development')
    })
  ],

  optimization: {minimize: false}
})
