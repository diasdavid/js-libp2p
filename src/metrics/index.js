'use strict'

const mergeOptions = require('merge-options')
const pipe = require('it-pipe')
const oldPeerLRU = require('./old-peers')
const { METRICS: defaultOptions } = require('../constants')
const Stats = require('./stats')

const initialCounters = [
  'dataReceived',
  'dataSent'
]

const directionToEvent = {
  in: 'dataReceived',
  out: 'dataSent'
}

class Metrics {
  /**
   *
   * @param {object} options
   * @param {number} options.computeThrottleMaxQueueSize
   * @param {number} options.computeThrottleTimeout
   * @param {Array<number>} options.movingAverageIntervals
   * @param {number} options.maxOldPeersRetention
   */
  constructor (options) {
    this._options = mergeOptions(defaultOptions, options)
    this._globalStats = new Stats(initialCounters, this._options)
    this._peerStats = new Map()
    this._protocolStats = new Map()
    this._oldPeers = oldPeerLRU(this._options.maxOldPeersRetention)
    this._running = false
    this.onMessage = this.onMessage.bind(this)
  }

  /**
   * Must be called for stats to saved. Any data pushed for tracking
   * will be ignored.
   */
  start () {
    this._running = true
  }

  /**
   * Stops all averages timers and prevents new data from being tracked.
   * Once `stop` is called, `start` must be called to resume stats tracking.
   */
  stop () {
    this._running = false
    this._globalStats.stop()
    for (const stats of this._peerStats.values()) {
      stats.stop()
    }
    for (const stats of this._protocolStats.values()) {
      stats.stop()
    }
  }

  /**
   * Gets the global `Stats` object
   * @returns {Stats}
   */
  get global () {
    return this._globalStats
  }

  /**
   * Returns a list of `PeerId` strings currently being tracked
   * @returns {Array<string>}
   */
  get peers () {
    return Array.from(this._peerStats.keys())
  }

  /**
   * Returns a list of `PeerId` strings currently in the
   * LRU, disconnected peer cache.
   * @returns {Array<string>}
   */
  get oldPeers () {
    return Array.from(this._oldPeers.keys())
  }

  /**
   * Returns the `Stats` object for the given `PeerId` whether it
   * is a live peer, or in the disconnected peer LRU cache.
   * @param {PeerId} peerId
   * @returns {Stats}
   */
  forPeer (peerId) {
    const idString = peerId.toString()
    return this._peerStats.get(idString) || this._oldPeers.get(idString)
  }

  /**
   * Returns a list of all protocol strings currently being tracked.
   * @returns {Array<string>}
   */
  get protocols () {
    return Array.from(this._protocolStats.keys())
  }

  /**
   * Returns the `Stats` object for the given `protocol`.
   * @param {string} protocol
   * @returns {Stats}
   */
  forProtocol (protocol) {
    return this._protocolStats.get(protocol)
  }

  /**
   * Should be called when all connections to a given peer
   * have closed. The `Stats` collection for the peer will
   * be stopped and moved to an LRU for temporary retention.
   * @param {PeerId} peerId
   */
  onPeerDisconnected (peerId) {
    const idString = peerId.toString()
    const peerStats = this._peerStats.get(idString)
    if (peerStats) {
      peerStats.stop()
      this._peerStats.delete(idString)
      this._oldPeers.set(idString, peerStats)
    }
  }

  onMessage ({ remotePeer, protocol, direction, dataLength }) {
    if (!this._running) return

    const key = directionToEvent[direction]

    let peerStats = this.forPeer(remotePeer)
    if (!peerStats) {
      peerStats = new Stats(initialCounters, this._options)
      this._peerStats.set(remotePeer.toString(), peerStats)
    }

    // Protocol specific stats
    if (protocol) {
      let protocolStats = this.forProtocol(protocol)
      if (!protocolStats) {
        protocolStats = new Stats(initialCounters, this._options)
        this._protocolStats.set(protocol, protocolStats)
      }
      protocolStats.push(key, dataLength)
    // General stats
    } else {
      peerStats.push(key, dataLength)
      this._globalStats.push(key, dataLength)
    }
  }

  /**
   * Replaces the `PeerId` string with the given `peerId`.
   * If stats are already being tracked for the given `peerId`, the
   * placeholder stats will be merged with the existing stats.
   *
   *
   * @param {string} placeholder A peerId string
   * @param {PeerId} peerId
   */
  updatePlaceholder (placeholder, peerId) {
    if (!this._running) return
    const placeholderStats = this.forPeer(placeholder)
    const peerIdString = peerId.toString()
    const existingStats = this.forPeer(peerId)
    let mergedStats = placeholderStats

    // If we already have stats, merge the two
    if (existingStats) {
      // If existing, merge
      mergedStats = Metrics.mergeStats(existingStats, mergedStats)
      // Attempt to delete from the old peers list just in case it was tracked there
      this._oldPeers.delete(peerIdString)
    }

    this._peerStats.delete(placeholder.toString())
    this._peerStats.set(peerIdString, mergedStats)
    mergedStats.start()
  }

  /**
   * Tracks data running through a given Duplex Iterable `stream`. If
   * the `peerId` is not provided, a placeholder string will be created and
   * returned. This allow lazy tracking of a peer when the peer is not yet known.
   * When the `PeerId` is known, `Metrics.updatePlaceholder` should be called
   * with the placeholder string returned from here, and the known `PeerId`.
   *
   * @param {Object} options
   * @param {{ sink: function(*), source: function() }} options.stream A duplex iterable stream
   * @param {PeerId} [options.peerId] The id of the remote peer that's connected
   * @param {string} [options.protocol] The protocol the stream is running
   * @returns {string} The peerId string or placeholder string
   */
  trackStream ({ stream, remotePeer, protocol }) {
    const metrics = this
    const _source = stream.source
    stream.source = (async function * () {
      for await (const chunk of _source) {
        metrics.onMessage({ remotePeer, protocol, direction: 'in', dataLength: chunk.length })
        yield chunk
      }
    })()

    const _sink = stream.sink
    stream.sink = source => {
      pipe(
        source,
        source => (async function * () {
          for await (const chunk of source) {
            metrics.onMessage({ remotePeer, protocol, direction: 'out', dataLength: chunk.length })
            yield chunk
          }
        })(),
        _sink
      )
    }

    return stream
  }

  /**
   * Merges `other` into `target`. `target` will be modified
   * and returned.
   * @param {Stats} target
   * @param {Stats} other
   * @returns {Stats}
   */
  static mergeStats (target, other) {
    target.stop()
    other.stop()

    // Merge queues
    target._queue = [...target.queue, other._queue]

    // TODO: how to merge moving averages?
    return target
  }
}

module.exports = Metrics