


type Peer = {
    id: string
    connection: RTCPeerConnection
    channel: RTCDataChannel
    type: 'LOCAL' | 'REMOTE'
    status: 'AWAITING_ANSWER' | 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'AWAITING_CONFIRMATION'
    answer?: any
}

type Event<T, P> = {
  type: T,
  payload: P,
}

type JoinPayload = {
  answerNodeId: string,
  offerNodeId: string,
  description: RTCSessionDescription,
  candidate: RTCIceCandidate,
}

type TxPayload = unknown


type Invitation = { type: 'Invitation' } & JoinPayload
type Answer = { type: 'Answer' } & JoinPayload

type InvitationResponseEvent = Event<'InvitationResponse', JoinPayload & { requestId: string }>
type InvitationRequestEvent = Event<'InvitationRequest', {  requestId: string, answerNodeId: string, offerNodeId: string}>
type InvitationAnswerEvent = Event<'InvitationAnswer', JoinPayload>
type TxConfirmationEvent = Event<'TxConfirmation', TxPayload>


type InvitationEvent = InvitationRequestEvent | InvitationResponseEvent | InvitationAnswerEvent

type NetworkEvent =
  | InvitationResponseEvent
  | InvitationRequestEvent
  | InvitationAnswerEvent
  | TxConfirmationEvent




export class Node {
  id: string
  peers: { [remoteNodeId: string]: Peer }
  pendingJobs: { [requestId: string]: (payload: unknown) => unknown}
  txs: Array<TxPayload>
  onTx: (e: unknown) => unknown

  constructor(onTx: any) {
    this.id = `NODE-${Math.random()}`
    this.peers = {}
    this.txs = []
    this.pendingJobs = {}

    this.onTx = (txPayload: unknown) => {
      console.log('tx handler...............')
      this.txs.push(txPayload)
      return onTx(this.txs)
    }
  }

  // Public

  collectNetworkInvitations(remoteNodeId: string) {
    const pendingInvitationsFromNetwork = Object.values(this.peers)
      .map(peer => this.forwardInvitationRequest(peer, remoteNodeId))

    const localConnectionInvitation = this.createLocalConnectionAndInvitation(remoteNodeId)

    return Promise.all([
      localConnectionInvitation,
      ...pendingInvitationsFromNetwork,
    ])
  }

  createAnswers(networkInvitations: Array<Invitation>): Promise<Array<Answer>> {
    const pendingAnswers = networkInvitations.map(payload => this.createRemoteConnectionAndAnswer(payload))

    return Promise.all(pendingAnswers)
  }

  acceptAnswers(answers: Array<Answer>) {
    answers.forEach(answer => {
      if (answer.offerNodeId === this.id) {
        this.acceptAnswerForLocalConnection(answer)
      } else {
        const pendingPeer = this.peers[answer.offerNodeId]
        this.forwardAnswer(pendingPeer, answer)
      }
    })
  }

  postTxEvent(eventPayload: TxPayload) {
    const event = {
      payload: eventPayload,
      type: 'TxConfirmation'
    } as TxConfirmationEvent
    Object.values(this.peers).forEach(peer => {
      try {
        this.sendMessage(peer.channel, event)
      } catch(e) {
        console.log(e)
      }
    })
    this.onTx(eventPayload)
  }



  // Peers

  // Create local/remote peers with invitations/answers

  private networkEventHandler(event: NetworkEvent, peerId: string) {
    const channel = this.peers[peerId].channel
    console.log('NETWORK EVENT:', event)

    switch (event.type) {
      case 'InvitationRequest':
        this.respondToInvitationRequest(event.payload, channel)
        break

      case 'InvitationAnswer':
        this.acceptAnswerForLocalConnection(event.payload)
        break

      case 'InvitationResponse':
        this.resolveInvitationResponse(event.payload)
        break

      case 'TxConfirmation':
        this.onTx(event.payload)
        break

      default:
        console.log('unhandled event:', event)
        break
    }
  }

  private createLocalConnectionAndInvitation(answerNodeId: string): Promise<Invitation> {
    const connection = new RTCPeerConnection()
    const channel = connection.createDataChannel('events')

    this.peers[answerNodeId] = {
      id: answerNodeId,
      connection,
      channel,
      type: 'LOCAL',
      status: 'AWAITING_ANSWER'
    }


    channel.addEventListener('message', evt => this.networkEventHandler(JSON.parse(evt.data), answerNodeId))

    connection.onconnectionstatechange = () => {
      console.log("local connection state change:", connection.connectionState)
    }


    return new Promise(res => {
      connection.onicecandidate = e => {
        console.log("local candidate created")
        if (!connection.localDescription) throw new Error('oops')

        if (e.candidate) {
          res({
            answerNodeId,
            description: connection.localDescription,
            candidate: e.candidate,
            offerNodeId: this.id,
            type: 'Invitation'
          })
        }
      }

      console.log("creating invitation")
      connection.createOffer()
        .then(offer =>
          connection.setLocalDescription(offer)
        )
        .catch(console.log)
    })
  }

  private createRemoteConnectionAndAnswer(invitation: Invitation): Promise<Answer> {
    const connection = new RTCPeerConnection()

    const peer: Peer = this.peers[invitation.offerNodeId] = {
      id: invitation.offerNodeId,
      type: 'REMOTE',
      status: 'AWAITING_CONFIRMATION',
      connection,
      channel: null as any,
    }

    connection.ondatachannel = e => {
      console.log('remote ondatachannel')
      const channel = e.channel
      peer.channel = channel

      channel.onmessage = evt => this.networkEventHandler(JSON.parse(evt.data), invitation.offerNodeId)
    }

    connection.onconnectionstatechange = () => {
      console.log("remote connection state change:", connection.connectionState)
    }


    connection.setRemoteDescription(invitation.description)
    connection.addIceCandidate(invitation.candidate).catch(console.log);

    const deferredAnswer: Promise<Answer> = new Promise(res => {
      connection.onicecandidate = e => {
        console.log("remote candidate created")
        if (e.candidate) {
          peer.status = 'ACCEPTED'
          const answer: Answer = {
            description: connection.localDescription as RTCSessionDescription,
            candidate: e.candidate,
            offerNodeId: invitation.offerNodeId,
            answerNodeId: this.id,
            type: 'Answer'
          }
          res(answer)
        }
      }
    })

    connection.createAnswer()
      .then(description => {
        connection.setLocalDescription(description)
      })
      .catch(console.log)

    return deferredAnswer
  }


  // request an invitation from a connection on behalf of the joining node
  private forwardInvitationRequest(peer: Peer, answerNodeId: string) {
    const requestId = 'join-package-' + Math.random()
    const pending = new Promise(res => this.pendingJobs[requestId] = res)

    this.sendMessage(peer.channel, {
      type: 'InvitationRequest',
      payload: {
        requestId,
        answerNodeId,
        offerNodeId: this.id
      }
    })

    return pending
  }

  private resolveInvitationResponse(payload: InvitationResponseEvent['payload']) {
    const resolve = this.pendingJobs[payload.requestId]
    if (!resolve) return
    else delete this.pendingJobs[payload.requestId]

    const invitation: Invitation = {
      type: 'Invitation',
      answerNodeId: payload.answerNodeId,
      offerNodeId: payload.offerNodeId,
      description: payload.description,
      candidate: payload.candidate,

    }
    resolve(invitation)
  }


  private async respondToInvitationRequest(payload: InvitationRequestEvent['payload'], channel: RTCDataChannel) {
    const invitation = await this.createLocalConnectionAndInvitation(payload.answerNodeId)
    this.sendMessage(channel, {
      type: 'InvitationResponse',
      payload: {
        description: invitation.description,
        candidate: invitation.candidate,
        requestId: payload.requestId,
        offerNodeId: this.id,
        answerNodeId: payload.answerNodeId,
      }
    })
  }

  private async acceptAnswerForLocalConnection({ description, candidate, answerNodeId }: Answer | InvitationAnswerEvent['payload']) {
    console.log('receiving answer...', { description, candidate })
    const peer = this.peers[answerNodeId]

    if (peer.status !== 'AWAITING_ANSWER') return
    peer.status = 'PENDING'

    try {
      await peer.connection.setRemoteDescription(description)
      await peer.connection.addIceCandidate(candidate)
      peer.status = 'ACCEPTED'
      console.log('answer accepted')
    } catch (e) {
        peer.status = 'REJECTED'
        console.log(e)
    }
  }

  private forwardAnswer(peer: Peer, answer: Answer) {
    console.log('sending invitation answer...')
    this.sendMessage(peer.channel, {
      type: 'InvitationAnswer',
      payload: {
        answerNodeId: answer.answerNodeId,
        offerNodeId: answer.offerNodeId,
        description: answer.description,
        candidate: answer.candidate,
      }
    })

  }

  private sendMessage(channel: RTCDataChannel, event: NetworkEvent) {
    channel.send(JSON.stringify(event))
  }
}


// For Nodes A, B, C
// A and B connect

// >>>>>>>>>>>>> offline: C gives B their id <<<<<<<<<<<<<<

// B creates an invitation collection using C's id (collectNetworkInvitations)
  // B creates its own invitation + local connection (createLocalConnectionAndInvitation)
  // B forwards the invitation request to A (forwardInvitationRequest)
  // A creates a local connection + responds with an invitation (respondToInvitationRequest)
  // B creates an invitation payload from A + its own invitation

// >>>>>>>>>>>>> offline: B gives C the invitation payload <<<<<<<<<<<<<<

// C creates a remote client for each invitation (createAnswers)
// C produces an answer payload for each client

// >>>>>>>>>>>>> offline: C gives B the answer payload <<<<<<<<<<<<<<

// B accepts the answer payload (acceptAnswers)
  // B accepts the C-B answer (acceptAnswerForLocalConnection)
  // B forwards the C-A answer to A (forwardAnswer)
  // A accepts the C-A anwer (acceptAnswerForLocalConnection)


