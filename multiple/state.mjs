const NODE_ID = `NODE-${Math.random()}`

class Node {
  constructor(connections=[], txs=[]) {
    this.id = NODE_ID
    this.connections = connections
    this.txs = txs
  }
}


export class LocalConnection {
  constructor(onNetworkEvent, onNodeJoinEvent, onIceCandidate) {
    const connection = new RTCPeerConnection()
    const joinChannel = connection.createDataChannel('join')
    const eventsChannel = connection.createDataChannel('events')

    this.local_id = NODE_ID
    this.connection = connection
    this.joinChannel = joinChannel
    this.eventsChannel = eventsChannel
    this.type = 'LOCAL'
    this.status = 'AWAITING_ANSWER'
    this.joinInfo = {}
    this.answer = {}

    joinChannel.onmessage = evt => onNodeJoinEvent(evt.data, this)
    eventsChannel.onmessage = evt => onNetworkEvent(evt.data)

    connection.onconnectionstatechange = () => {
      console.log("local connection state change:", connection.connectionState)
    }

    connection.onicecandidate = e => {
      console.log("local candidate created")
      if (e.candidate) {
        this.joinInfo.candidate = e.candidate
        onIceCandidate(this.joinInfo.description, this.joinInfo.candidate)
      }
    }

    console.log("creating invitation")
    connection.createOffer()
      .then(offer => {
        connection.setLocalDescription(offer)
        this.joinInfo.description = connection.localDescription
      })
      .catch(console.log)
  }

  getJoinInfo() {
    if (this.status !== 'AWAITING_ANSWER') return
    else return this.joinInfo
  }

  async acceptAnswer({ description, candidate }) {
    if (this.status !== 'AWAITING_ANSWER') return
    this.status = 'PENDING'

    this.answer.description = description
    this.answer.candidate = candidate


    try {
      await this.connection.setRemoteDescription(description)
      await this.connection.addIceCandidate(candidate)
      this.status = 'ACCEPTED'
      console.log('answer accepted')
    } catch (e) {
        this.status = 'REJECTED'
        console.log(e)
    }
  }
}

export class RemoteConnection {
  constructor(invitation, onNetworkEvent, onNodeJoinEvent, onIceCandidate) {
    const connection = new RTCPeerConnection()

    this.local_id = NODE_ID
    this.connection = connection
    this.joinChannel = null
    this.eventsChannel = null
    this.type = 'REMOTE'
    this.status = 'AWAITING_CONFIRMATION'
    this.joinInfo = invitation
    this.answer = {}


    connection.onconnectionstatechange = () => {
      console.log("remote connection state change:", connection.connectionState)
    }

    connection.onicecandidate = e => {
      console.log("remote candidate created")
      if (e.candidate) {
        this.answer.candidate = e.candidate
        onIceCandidate(this.answer.description, this.answer.candidate)
      }
    }

    connection.ondatachannel = e => {
      console.log('remote ondatachannel')
      const channel = e.channel

      if (channel.label === 'join') {
        this.joinChannel = channel
        channel.onmessage = evt => onNodeJoinEvent(evt.data)
      } else if (channel.label === 'events') {
        this.eventsChannel = channel
        channel.onmessage = evt => onNetworkEvent(evt.data)

      }
    }

    const { description, candidate } = invitation

    connection.setRemoteDescription(description)
    connection.addIceCandidate(candidate).catch(console.log);

    connection.createAnswer()
      .then(description => {
        this.answer.description = description
        connection.setLocalDescription(description)
      })
  }
}
