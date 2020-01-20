

type NodeId = string
type BlockId = string

type Maybe<V> = V | null

type Peer = {
    id: string
    connection: RTCPeerConnection
    channel: RTCDataChannel
    type: 'LOCAL' | 'REMOTE'
    status: 'AWAITING_ANSWER' | 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'AWAITING_CONFIRMATION'
    answer?: any
}

type Event<T, P> = {
  metadata: {
    id: string,
    originNodeId: NodeId,
    timestamp: number
  },
  type: T,
  payload: P,
}

// This is all super insecure and easy to manipulate, but w/e
export type Block = {
  id: BlockId,
  previousId: Maybe<BlockId>,
  txs: Array<ProposeTxEvent>,
  timestamp: number
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
type InvitationRequestEvent = Event<'InvitationRequest', {  requestId: string, answerNodeId: NodeId, offerNodeId: NodeId}>
type InvitationAnswerEvent = Event<'InvitationAnswer', JoinPayload>
type StateTransferEvent = Event<'StateTransfer', { state: Array<Block>, leader: Maybe<NodeId> }>

type ProposeTxEvent = Event<'ProposeTx', TxPayload>
type ClaimLeadershipEvent = Event<'ClaimLeadership', { nodeId: NodeId }>
type ProposeTxBlockEvent = Event<'ProposeTxBlock', Block>
type PrepareTxBlockEvent = Event<'PrepareTxBlock', { blockId: BlockId, prepare: boolean }>
type CommitTxBlockEvent = Event<'CommitTxBlock', { blockId: BlockId }>



type InvitationEvent = InvitationRequestEvent | InvitationResponseEvent | InvitationAnswerEvent

type NetworkEvent =
  | InvitationResponseEvent
  | InvitationRequestEvent
  | InvitationAnswerEvent
  | StateTransferEvent
  | ProposeTxEvent
  | ClaimLeadershipEvent
  | ProposeTxBlockEvent
  | PrepareTxBlockEvent
  | CommitTxBlockEvent



type Vote = {
  originNodeId: NodeId,
  blockId: BlockId,
  type: 'prepare' | 'reject' | 'commit'
}


const BLOCK_SIZE = 2

export class Node {
  id: NodeId
  peers: { [remoteNodeId: string]: Peer }
  pendingJobs: { [requestId: string]: (payload: unknown) => unknown}
  blocks: Array<Block>
  txProposals: Array<ProposeTxEvent>
  currentProposal: Maybe<Block>
  pendingVotes: Array<Vote>

  onBlock: (e: unknown) => unknown
  leader: Maybe<NodeId>

  constructor(onBlock: any) {
    this.id = `NODE-${Math.random()}`
    this.peers = {}
    this.blocks = []
    this.txProposals = []
    this.pendingVotes = []
    this.pendingJobs = {}
    this.leader = null
    this.currentProposal = null

    this.onBlock = onBlock
  }

  // Public

  collectNetworkInvitations(remoteNodeId: NodeId) {
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

    setTimeout(() => {
      const peer = this.peers[answers[0].answerNodeId]
      this.sendMessage(peer.channel, {
        type: 'StateTransfer',
        metadata: this.createMetadata(),
        payload: {
          state: this.blocks,
          leader: this.leader
        }
      })
    }, 2000)
  }

  claimLeadership() {
    console.log('Claiming leadership')
    this.emitMessage({
      type: 'ClaimLeadership',
      metadata: this.createMetadata(),
      payload: { nodeId: this.id }
    })
  }

  postTxEvent(eventPayload: TxPayload) {
    const event: ProposeTxEvent = {
      type: 'ProposeTx',
      metadata: this.createMetadata(),
      payload: eventPayload,
    }

    this.emitMessage(event)
  }



  // Peers

  // Create local/remote peers with invitations/answers

  private networkEventHandler(event: NetworkEvent, peerId?: NodeId) {
    console.log('NETWORK EVENT:', event)

    switch (event.type) {
      case 'InvitationRequest':
        if (!peerId) throw new Error('no peer found for ' + peerId)
        const channel = this.peers[peerId]?.channel
        this.respondToInvitationRequest(event.payload, channel)
        break

      case 'InvitationAnswer':
        this.acceptAnswerForLocalConnection(event.payload)
        break

      case 'InvitationResponse':
        this.resolveInvitationResponse(event.payload)
        break

      case 'StateTransfer':
        this.receiveStateTransfer(event.payload)
        break

      case 'ClaimLeadership':
        this.handleLeadershipClaim(event.payload)
        break

      case 'ProposeTx':
        this.handleTxProposal(event)
        break

      case 'ProposeTxBlock':
        this.handleTxBlockProposal(event)
        break

      case 'PrepareTxBlock':
        this.handleTxBlockPreparation(event)
        break

      case 'CommitTxBlock':
        this.handleTxBlockCommit(event)
        break

      default:
        console.log('unhandled event:', event)
        break
    }
  }

  private createLocalConnectionAndInvitation(answerNodeId: NodeId): Promise<Invitation> {
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
  private forwardInvitationRequest(peer: Peer, answerNodeId: NodeId) {
    const requestId = 'join-package-' + Math.random()
    const pending = new Promise(res => this.pendingJobs[requestId] = res)

    this.sendMessage(peer.channel, {
      type: 'InvitationRequest',
      metadata: this.createMetadata(),
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
      metadata: this.createMetadata(),
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
      metadata: this.createMetadata(),
      payload: {
        answerNodeId: answer.answerNodeId,
        offerNodeId: answer.offerNodeId,
        description: answer.description,
        candidate: answer.candidate,
      }
    })

  }

  private receiveStateTransfer(payload: StateTransferEvent['payload']) {
    this.blocks = payload.state
    this.leader = payload.leader
  }

  private handleLeadershipClaim({ nodeId }: ClaimLeadershipEvent['payload']) {
    this.leader = nodeId
  }

  private handleTxProposal(proposal: ProposeTxEvent) {
    this.txProposals.push(proposal)
    if (this.leader === this.id) {
      if (this.txProposals.length === BLOCK_SIZE) {
        this.proposeBlock()
      }
    }
  }

  private proposeBlock() {
    const previousId = this.blocks.length ? this.blocks[this.blocks.length - 1].id : null
    const txs = this.txProposals.slice()
    const proposedBlock: Block = {
      id: 'BLOCK-' + Math.random(),
      timestamp: Date.now(),
      previousId,
      txs,
    }

    const event: ProposeTxBlockEvent = {
      type: 'ProposeTxBlock',
      metadata: this.createMetadata(),
      payload: proposedBlock
    }

    this.emitMessage(event)

    // actually vote on the block
  }

  private handleTxBlockProposal(event: ProposeTxBlockEvent) {
    const { payload: block, metadata: { originNodeId } } = event
    if (this.currentProposal || originNodeId !== this.leader) {
      this.emitMessage({
        type: 'PrepareTxBlock',
        metadata: this.createMetadata(),
        payload: {
          blockId: block.id,
          prepare: false,
        }
      })
      return
    }

    this.currentProposal = block
    // Question: what happens if a block is proposed before all the nodes get all the txs?


    // Check if block is valid-ish
    const blockPreviousIdMatch =
      block.previousId === (this.blocks.length
        ? this.blocks[this.blocks.length - 1].id
        : null
      )
    const proposedTxIds = this.txProposals.map(proposal => proposal.metadata.id)
    const blockTxsAreValid = block.txs.every(tx => proposedTxIds.includes(tx.metadata.id))

    const prepare = blockPreviousIdMatch && blockTxsAreValid

    // maybe wait a tick to prevent race conditions
    this.emitMessage({
      type: 'PrepareTxBlock',
      metadata: this.createMetadata(),
      payload: {
        prepare, blockId: block.id,
      }
    })
  }

  private handleTxBlockPreparation(event: PrepareTxBlockEvent) {
    // a lot of room for race conditions
    // what if a vote gets to this node before the original leader proposal?
    const { blockId, prepare } = event.payload

    if (!this.currentProposal) return
    if (blockId !== this.currentProposal.id) return

    const { originNodeId } = event.metadata

    this.pendingVotes.push({
      originNodeId,
      blockId,
      type: prepare ? 'prepare' : 'reject'
    })

    const confirmationVotes = this.pendingVotes.filter(vote => vote.type === "prepare" && vote.blockId === blockId)
    const rejectionVotes = this.pendingVotes.filter(vote => vote.type === "reject" && vote.blockId === blockId)
    const twoThirdsConfirmation = confirmationVotes.length > Object.values(this.peers).length * (2/3)
    const oneThirdRejection = rejectionVotes.length >= (Object.values(this.peers).length / 3)

    if (event.payload.prepare) {
      if (twoThirdsConfirmation) {
        const commit: CommitTxBlockEvent = {
          type: 'CommitTxBlock',
          metadata: this.createMetadata(),
          payload: {
            blockId,
          }
        }
        this.emitMessage(commit)
      }
    } else {
      if (oneThirdRejection) {
        this.currentProposal = null
      }
    }
  }

  private handleTxBlockCommit({ metadata, payload}: CommitTxBlockEvent) {
    const { originNodeId } = metadata
    const { blockId } = payload

    this.pendingVotes.push({
      originNodeId,
      blockId,
      type: 'commit'
    })

    const commitVotes = this.pendingVotes.filter(vote => vote.blockId === blockId && vote.type === 'commit')
    const twoThirdsCommit = commitVotes.length >= Object.values(this.peers).length * (2/3)
    const ownNodeCommit = commitVotes.some(vote => vote.originNodeId === this.id)

    // question: what happens if own node hasn't comitted, but gets quorum?
    if (twoThirdsCommit && ownNodeCommit && this.currentProposal) {
      this.blocks.push(this.currentProposal)
      this.txProposals = this.txProposals.filter(tx => !this.currentProposal?.txs.includes(tx))
      this.currentProposal = null
      this.onBlock(this.blocks)
    }
  }

  private sendMessage(channel: RTCDataChannel, event: NetworkEvent) {
    channel.send(JSON.stringify(event))
  }

  private emitMessage(event: NetworkEvent) {
    Object.values(this.peers).forEach(peer => this.sendMessage(peer.channel, event))
    this.networkEventHandler(event, this.id)
  }

  private createMetadata() {
    return {
      id: 'id-' + Math.random(),
      originNodeId: this.id,
      timestamp: Date.now()
    }
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



// Consensus

// Node A claims leadership, tells B, C, D
// EVENT: ClaimLeadership

// Round 0
  // txs are broadcast to A, B, C, D
  // A, B, C, D put txs in pending queue
// Event: ProposeTx

// Round 1
  // A submits a block of txs to B, C, D
// Event ProposeTxBlock

// Round 2
  // B tells A, C, D if it votes to prepare block
  // B commits

  // C tells A, B, D if it votes to prepare block
  // C commits

  // D tells A, B, C if it votes to prepare block
  // D commits
// Event: PrepareTxBlock

// Round 3
  // When each node gets quarum of prepare votes, they emit commit votes
// Event: CommitTxBlock

// upon 2/3 of commit votes, they commit the block locally
