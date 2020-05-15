/* eslint-disable no-console */
'use strict'

const Libp2p = require('../..')
const TCP = require('libp2p-tcp')
const SECIO = require('libp2p-secio')
const MPLEX = require('libp2p-mplex')

const pipe = require('it-pipe')
const concat = require('it-concat')

const createNode = async () => {
  const node = await Libp2p.create({
    addresses: {
      // To signall the addresses we want to be available, we use
      // the multiaddr format, a self describable address
      listen: ['/ip4/0.0.0.0/tcp/0']
    },
    modules: {
      transport: [TCP],
      connEncryption: [SECIO],
      streamMuxer: [MPLEX]
    }
  })

  await node.start()
  return node
}

function printAddrs (node, number) {
  console.log('node %s is listening on:', number)
  node.transportManager.getAddrs().forEach((ma) => console.log(`${ma.toString()}/p2p/${node.peerId.toB58String()}`))
}

;(async () => {
  const [node1, node2] = await Promise.all([
    createNode(),
    createNode()
  ])

  printAddrs(node1, '1')
  printAddrs(node2, '2')

  node2.handle('/print', async ({ stream }) => {
    const result = await pipe(
      stream,
      concat
    )
    console.log(result.toString())
  })

  node1.peerStore.addressBook.set(node2.peerId, node2.multiaddrs)
  const { stream } = await node1.dialProtocol(node2.peerId, '/print')

  await pipe(
    ['Hello', ' ', 'p2p', ' ', 'world', '!'],
    stream
  )
})();
