import { Node } from './state.mjs'

const $invitation = document.getElementById('invitation')
const $answer = document.getElementById('answer')

const $createInvitation = document.getElementById('create-invitation')
const $acceptInvitation = document.getElementById('accept-invitation')

const $invitationOut = document.getElementById('invitation-out')

const $answerIn = document.getElementById('answer-in')

const $invitationIn = document.getElementById('invitation-in')
const $answerOut = document.getElementById('answer-out')
const $createAnswer = document.getElementById('create-answer')
const $acceptAnswers = document.getElementById('accept-answer')

const $chatHistoryResults = document.getElementById('chat-history-results')
const $newMessage = document.getElementById('new-message')
const $sendMessage = document.getElementById('send-message')

const $nodeId = document.getElementById('node-id')
const $remoteNodeId = document.getElementById('remote-node-id')




const node = new Node(updateChat)
window.node = node
$nodeId.innerHTML = node.id

$createInvitation.onclick = () => {
  $invitation.style.display = ''

  createInvitation($remoteNodeId.value)
}

$acceptInvitation.onclick = () => {
  $answer.style.display = ''
}


$createAnswer.onclick = () => {
  acceptInvitation(
    JSON.parse($invitationIn.value),
  )
}

$acceptAnswers.onclick = () => {
  acceptAnswers(
    JSON.parse($answerIn.value),
  )
}


$sendMessage.onclick = () => {
  const input = $newMessage.value
  if (!input) return

  $newMessage.value = ''
  updateChat(input)
  sendMessage(input)
}


function updateChat(input) {
  $chatHistoryResults.innerHTML += '<br>' + input
}




function sendMessage(input) {
  node.emitEvent(input)
}



async function createInvitation(remoteNodeId) {
  const invitations = await node.collectNetworkInvitations(remoteNodeId)
  displayRemoteOfferingInfo(invitations)
}

function displayRemoteOfferingInfo(invitations) {
  $invitationOut.value = JSON.stringify(invitations)
}








async function acceptInvitation(invitations) {
  const answers = await node.createAnswers(invitations)
  displayRemoteAnswerInfo(answers)

}

function displayRemoteAnswerInfo(answers) {
    $answerOut.value = JSON.stringify(answers)
}


function acceptAnswers(answers) {
  node.acceptAnswers(answers)
}

function noop() {}


// refactor offer/answer + candidate into single invitation object




// new workflow:
  // A creates an offering
  // B accepts offering
  // A confirms the connection

  // A communicates over all it's "join" channels that C wants to join the network
  // B et. al send A their invitations
  // A forwards its (+ everyon else's) invitations to C
  // C accepts all invitations, and forwards all answers to A
  // A accepts C's answer, and forwards B's answer to B
