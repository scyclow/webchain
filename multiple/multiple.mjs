import { LocalConnection, RemoteConnection } from './state.mjs'

const $invitation = document.getElementById('invitation')
const $answer = document.getElementById('answer')

const $createInvitation = document.getElementById('create-invitation')
const $acceptInvitation = document.getElementById('accept-invitation')

const $invitationOut = document.getElementById('invitation-out')

const $answerIn = document.getElementById('answer-in')

const $invitationIn = document.getElementById('invitation-in')
const $answerOut = document.getElementById('answer-out')
const $createAnswer = document.getElementById('create-answer')
const $acceptAnswer = document.getElementById('accept-answer')

const $chatHistoryResults = document.getElementById('chat-history-results')
const $newMessage = document.getElementById('new-message')
const $sendMessage = document.getElementById('send-message')



let localConnection, remoteConnection, channel

$createInvitation.onclick = () => {
  $invitation.style.display = ''
  createInvitation()
}

$acceptInvitation.onclick = () => {
  $answer.style.display = ''
}


$createAnswer.onclick = () => {
  acceptInvitation(
    JSON.parse($invitationIn.value),
  )
}

$acceptAnswer.onclick = () => {
  acceptAnswer(
    localConnection,
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
  channel.send(input)
}



function createInvitation() {
  localConnection = new LocalConnection(updateChat, noop, displayRemoteOfferingInfo)
  channel = localConnection.eventsChannel
}

function displayRemoteOfferingInfo(description, candidate) {
  $invitationOut.value = JSON.stringify({ description, candidate })
}








function acceptInvitation(invitation) {
  remoteConnection = new RemoteConnection(invitation, updateChat, noop, displayRemoteAnswerInfo)
  channel = remoteConnection.eventsChannel

}

function displayRemoteAnswerInfo(description, candidate) {
    $answerOut.value = JSON.stringify({ description, candidate })
}


function acceptAnswer(connection, invitation) {
  connection.acceptAnswer(invitation)
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
