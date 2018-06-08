import createHttpServer from './http-server'
import createSocketServer from './socket-server'
import createManager from './server-stage-manager'

import Logger from './logger'
import * as Network from './network'
import * as Util from '../util'
import { builtinAdminCommands } from './commands'
import { builtinEvents } from './events'

import * as Events from '../events'

export default function createServer ({
  network = Network.pairs(16),
  logger = Logger({}),
  events = {},
  commands = {},
  adminCommands = {},
  stages = [],
  options: {
    port = 3000,
    resumeCurrentStage = false,
    clientPassword = '',
    adminPassword = ''
  } = {}
} = {}) {
  let stageManager
  const nameMap = {}

  const httpServer = createHttpServer({
    port,
    clientPassword,
    adminPassword
  })
  const socketServer = createSocketServer(httpServer.getIO())

  // Log/Messaging
  function log (msg, fileOrExtra, extra) {
    logger.log(msg, fileOrExtra, extra)
  }

  function send (topic, message) {
    const event = { type: topic, payload: message }
    return {
      toAll () {
        socketServer.sendEvent(event).toAll()
      },
      toClient (clientId) {
        socketServer.sendEvent(event).toClients([clientId])
      },
      toNeighboursOf (clientId) {
        socketServer
          .sendEvent(event)
          .toClients([clientId].concat(network.getNeighbours(clientId)))
      },
      toNeighboursOfExclusive (clientId) {
        socketServer
          .sendEvent(event)
          .toClients(network.getNeighbours(clientId))
      },
      toClients (clients = []) {
        socketServer.sendEvent(event).toClients(clients)
      },
      toAdmin () {
        socketServer.sendEvent(event).toAdmin()
      }
    }
  }

  // Running
  function run () {
    stageManager = createManager({
      stages,
      getContext: () => monsterr,
      getPlayers: () => network.getPlayers(),
      onStageStarted: stage =>
        handleEvent({ type: Events.START_STAGE, payload: stage }),
      onStageEnded: stage =>
        handleEvent({ type: Events.END_STAGE, payload: stage }),
      onGameOver: () =>
        handleEvent({ type: Events.GAME_OVER })
    })
  }

  // Event handling
  function handleEvent (event) {
    Util.handleEvent(event, [
      builtinEvents,
      events,
      stageManager.getEvents()
    ], monsterr)
  }

  function handleCommand (cmd) {
    Util.handleCommand(cmd, [
      !cmd.clientId ? adminCommands : {},
      !cmd.clientId ? builtinAdminCommands : {},
      commands,
      stageManager.getCommands()
    ], monsterr)
  }

  // Add/Remove players
  const addPlayer = (player) => {
    if (network.getPlayers(player).indexOf(player) === -1) {
      network.addPlayer(player)
    }

    // possibly resume current stage
    const currentStage = stageManager.getCurrentStage()
    if (resumeCurrentStage && currentStage && currentStage.number !== -1) {
      setTimeout(
        () => monsterr.send(Events.START_STAGE, currentStage.number).toClient(player),
        200
      )
    }
  }
  const removePlayer = (player) => {
    network.removePlayer(player)
    stageManager.playerDisconnected(player)
  }

  // Naming
  const setName = (id, name) => {
    const prevName = monsterr.getName(id)
    nameMap[id] = name
    monsterr.send(Events.SET_NAME, { id, name, prevName }).toClient(id)
    monsterr.send(Events.RENAME, { id, name, prevName }).toNeighboursOf(id)
  }
  const getName = id => nameMap[id] || id

  // Simple util to handle different connection
  // events in the same way
  const connectionHandler = event => [
    event,
    player => handleEvent({
      type: event,
      payload: player,
      clientId: player
    })
  ]

  // Wiring up socketServer events
  socketServer.on('cmd', handleCommand)
  socketServer.on('event', handleEvent)
  socketServer.on(
    ...connectionHandler(Events.CLIENT_CONNECTED)
  )
  socketServer.on(
    ...connectionHandler(Events.CLIENT_RECONNECTED)
  )
  socketServer.on(
    ...connectionHandler(Events.CLIENT_DISCONNECTED)
  )

  /** API */
  const monsterr = {
    // Basic
    run,
    send,
    log,

    // getNetwork: () => network,

    // Players
    setName,
    getName,
    addPlayer,
    removePlayer,
    getPlayers: () => network.getPlayers(),
    getLatencies: () => socketServer.getLatencies(),

    // Stages
    start: () => stageManager.start(),
    nextStage: () => stageManager.next(),
    reset: () => stageManager.reset(),
    getCurrentStage: () => stageManager.getCurrentStage(),
    playerFinishedStage: (player, stageNo) => stageManager.playerFinishedStage(player, stageNo)
  }

  return monsterr
}
