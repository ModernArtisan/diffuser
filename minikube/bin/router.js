var cadence = require('cadence')
var delta = require('delta')
var Diffuser = require('../..')
var http = require('http')
var destroyer = require('server-destroy')
var Conduit = require('conduit')

var Reactor = require('reactor')
var connect = require('connect')

var destroyer = require('server-destroy')

var Middleware = require('./middleware')

var Worker = require('./worker')
var Tracker = require('./tracker')

var Keyify = require('keyify')

module.exports = cadence(function (async, destructible, olio, properties) {
    var tracker = new Tracker
    var expirator = setInterval(tracker.expire.bind(tracker), 1000)
    destructible.destruct.wait(function () { clearInterval(expirator) })
    async(function () {
        destructible.durable('diffuser', Diffuser, {
            olio: olio,
            receiver: tracker.receive.bind(tracker),
            buckets: properties.diffuser.buckets,
            timeout: 5000,
            monkey: true
        }, async())
    }, function (diffuser) {
        var identifier = { address: properties.address, index: olio.index }
        var middleware = new Middleware(diffuser, identifier)
        async(function () {
            diffuser.register(Keyify.stringify(identifier), async())
        }, function () {
            olio.sender('mingle', cadence(function (async, destructible, inbox, outbox) {
                destructible.durable('conduit', Conduit, inbox, outbox, null, async())
            }), async())
        }, function (mingle) {
            destructible.durable('worker', Worker, tracker, diffuser, mingle.processes[0].conduit, identifier, async())
        }, function (worker) {
            var server = http.createServer(connect()
                .use(Reactor.json())
                .use(middleware.middleware))
            destroyer(server)
            async(function () {
                delta(async()).ee(server).on('listening')
                server.listen(properties.bind.port, properties.bind.iface)
            }, function () {
                destructible.destruct.wait(server, 'destroy')
                delta(destructible.durable('http')).ee(server).on('close')
                return null
            })
        })
    })
})
