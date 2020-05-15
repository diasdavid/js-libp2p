'use strict'
/* eslint-disable no-console */

/*
 * Dialer Node
 */

const multiaddr = require('multiaddr')
const PeerId = require('peer-id')
const Node = require('./libp2p-bundle')
const pipe = require('it-pipe')

async function run() {
  const [dialerId, listenerId] = await Promise.all([
    PeerId.createFromJSON(require('./id-d')),
    PeerId.createFromJSON(require('./id-l'))
  ])

  // Dialer
  const dialerNode = new Node({
    addresses: {
      listen: ['/ip4/0.0.0.0/tcp/0']
    },
    peerId: dialerId
  })

  // Add peer to Dial (the listener) into the PeerStore
  const listenerMultiaddr = '/ip4/127.0.0.1/tcp/10333/p2p/' + listenerId.toB58String()
  dialerNode.peerStore.addressBook.set(listenerId, [multiaddr(listenerMultiaddr)])

  // Start the dialer libp2p node
  await dialerNode.start()

  console.log('Dialer ready, listening on:')
  dialerNode.transportManager.getAddrs().forEach((ma) => console.log(ma.toString() +
        '/p2p/' + dialerId.toB58String()))

  // Dial the listener node
  console.log('Dialing to peer:', listenerMultiaddr.toString())
  const { stream } = await dialerNode.dialProtocol(listenerId, '/echo/1.0.0')

  console.log('nodeA dialed to nodeB on protocol: /echo/1.0.0')

  pipe(
    // Source data
    ['hey'],
    // Write to the stream, and pass its output to the next function
    stream,
    // Sink function
    async function (source) {
      // For each chunk of data
      for await (const data of source) {
        // Output the data
        console.log('received echo:', data.toString())
      }
    }
  )
}

run()
