let startServer = require('../../webpack/startServer')
let clientConfig = require('../../webpack/client')
let serverConfig = require('../../webpack/server')


module.exports = startServer({clientConfig, serverConfig})
