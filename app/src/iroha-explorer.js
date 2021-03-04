/**
 * Iroha Explorer
 *
 * Copyright (C) 2020 diva.exchange
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *
 * Author: Konrad Bächler, https://diva.exchange
 */

'use strict'

import { Client } from 'pg'
import dateFormat from 'dateformat'
import fs from 'fs'
import http from 'http'
import path from 'path'
import net from 'net'
import ws from 'ws'

import { Logger } from '@diva.exchange/diva-logger'
import { Router } from './router'

export class IrohaExplorer {
  /**
   * Factory
   *
   * @param config {object}
   * @return {IrohaExplorer}
   * @public
   */
  static make (config) {
    return new IrohaExplorer(config)
  }

  /**
   * @param config {object}
   * @throws {Error}
   * @private
   */
  constructor (config) {
    this._ip = config.ip
    this._port = config.port
    if (config.pathConfig && config.pathBlockstore) {
      this._pathConfig = config.pathConfig
      this._pathBlockstore = config.pathBlockstore
    } else if (config.pathIroha) {
      this._pathConfig = path.join(config.pathIroha, 'data', 'config.json')
      this._pathBlockstore = path.join(config.pathIroha, 'blockstore')
    }
    if (!this._pathConfig || !fs.existsSync(this._pathConfig)) {
      throw new Error(`Path to configuration file not found: ${this._pathConfig}`)
    }
    if (!this._pathBlockstore || !fs.existsSync(this._pathBlockstore)) {
      throw new Error(`Path to blockstore not found: ${this._pathBlockstore}`)
    }

    this._router = new Router((req, res, next) => { this._routeHandler(req, res, next) })
    this._router.getApp().set('port', this._port)

    this._server = http.createServer(this._router.getApp())
    this._server.on('listening', () => {
      Logger.info(`HttpServer listening on ${this._ip}:${this._port}`)
    })
    this._server.on('close', () => {
      Logger.info(`HttpServer closing on ${this._ip}:${this._port}`)
    })
    this._server.listen(this._port, this._ip)

    // attach a websocket server
    this._webSocket = new Map()
    this._idWebSocket = 1

    /** @type {ws.Server} */
    this._webSocketServer = new ws.Server({ server: this._server })
    this._webSocketServer.on('connection', (ws) => {
      const id = this._idWebSocket++
      this._webSocket.set(id, ws)
      ws.on('close', () => {
        this._webSocket.delete(id)
      })
      ws.on('error', (error) => {
        Logger.warn('websocket terminated').trace(error)
        ws.terminate()
      })
    })
    this._webSocketServer.on('close', () => {
      Logger.info('WebsocketServer closing')
    })

    this._initFileWatcher()
    this._testPostgres()
    this._pingWebsocket()
  }

  /**
   * @private
   */
  _pingWebsocket () {
    this._webSocket.forEach(async (ws) => {
      try {
        await ws.ping()
      } catch (error) {
        Logger.warn(error)
      }
    })
    setTimeout(() => { this._pingWebsocket() }, 30000)
  }

  /**
   * @returns {Promise<any>}
   */
  async shutdown () {
    if (this._watcher) {
      this._watcher.close()
    }
    if (this._webSocketServer) {
      await new Promise((resolve) => {
        this._webSocketServer.close(resolve)
      })
    }
    if (this._server) {
      await new Promise((resolve) => {
        this._server.close(resolve)
      })
    }
  }

  /**
   * @private
   */
  _initFileWatcher () {
    if (this._watcher) {
      this._watcher.close()
    }

    this._mapBlockCache = new Map()

    this._watcher = fs.watch(this._pathBlockstore, (eventType, nameFile) => {
      if (!nameFile) {
        return this._initFileWatcher()
      }
      if (!nameFile.test(/^[\d]+$/)) {
        return
      }

      fs.readFile(path.join(this._pathBlockstore, nameFile), (error, data) => {
        if (error) {
          Logger.warn('_watcher.readFile failed').trace(error)
          return
        }
        try {
          const objBlock = JSON.parse(data.toString())
          objBlock.id = nameFile
          objBlock.dateTimeFormatted = dateFormat(Math.floor(objBlock.blockV1.payload.createdTime || 1),
            'dd/mmm/yyyy HH:MM:ss', true)
          objBlock.lengthTransactions =
            objBlock.blockV1.payload.transactions ? objBlock.blockV1.payload.transactions.length : 0
          this._mapBlockCache.set(nameFile, objBlock)

          this._router.getApp().render('blocklist', { blocks: [objBlock] }, (error, html) => {
            if (error) {
              Logger.warn('_watcher.render failed').trace(error)
              return
            }
            this._webSocket.forEach((ws) => {
              ws.send(JSON.stringify({
                cmd: 'block',
                id: objBlock.id,
                block: objBlock,
                height: this._mapBlockCache.size,
                html: html
              }))
            })
          })
        } catch (error) {
          Logger.warn('_watcher.change failed').trace(error)
        }
      })
    })

    for (const nameFile of fs.readdirSync(this._pathBlockstore)) {
      if (!nameFile.test(/^[\d]+$/)) {
        continue
      }
      try {
        const objBlock = JSON.parse((fs.readFileSync(path.join(this._pathBlockstore, nameFile))).toString())
        objBlock.id = nameFile
        // 88322155000 = 1972-10-19 05:55:55 - just a great date/time for a genesis block
        objBlock.dateTimeFormatted = dateFormat(Math.floor(objBlock.blockV1.payload.createdTime || 88322155000),
          'dd/mmm/yyyy HH:MM:ss', true)
        objBlock.lengthTransactions =
          objBlock.blockV1.payload.transactions ? objBlock.blockV1.payload.transactions.length : 0
        this._mapBlockCache.set(nameFile, objBlock)
      } catch (error) {
        Logger.warn(`_initCache: could not parse ${nameFile}`)
      }
    }
  }

  /**
   * @private
   */
  _testPostgres () {
    this._pgConfig = {}
    let config = {}
    try {
      // load the config file
      Logger.info('Reading config from: ' + this._pathConfig)
      config = JSON.parse(fs.readFileSync(this._pathConfig))
      const socket = net.connect({ port: config.database.port, host: config.database.host }, () => {
        socket.end()
        const conf = {
          host: config.database.host,
          port: config.database.port,
          database: config.database['working database'],
          user: config.database.user,
          password: config.database.password
        }
        try {
          const _c = new Client(conf)
          _c.end()
        } catch (error) {
          this._errorPostgres(error)
        }

        this._pgConfig = conf
      })
    } catch (error) {
      this._errorPostgres(error)
    }
  }

  /**
   * @param error {Error}
   * @private
   */
  _errorPostgres (error) {
    if (error) {
      Logger.warn('postgres error. will try to reconnect.').trace(error)
    }
    setTimeout(() => { this._testPostgres() }, 30000)
  }

  /**
   * @param req
   * @param res
   * @param next {Function}
   * @private
   */
  _routeHandler (req, res, next) {
    let data = null
    const _p = req.path.replace(/\/+$/, '')
    switch (_p) {
      case '':
      case '/ui/blocks':
        res.render('blocks')
        break
      case '/blocks':
        this._getBlocks(
          parseInt(req.query.pagesize || 0),
          parseInt(req.query.page || 0),
          (req.query.q || '').replace(/[^\w\-+*[\]/().,;: ]/gi, '')
        )
          .then((data) => {
            res.json(data)
          })
          .catch(() => {
            res.status(404).json(false)
          })
        break
      case '/block':
        data = req.query.q ? this._getBlock(req.query.q) : false
        data ? res.json(data) : res.status(404).json(false)
        break
      case '/ui/peers-domains-roles':
        res.render('peers-domains-roles')
        break
      case '/peers':
        this._getPeers(req.query.q || '')
          .then((data) => {
            res.json(data)
          })
          .catch(() => {
            res.status(404).json(false)
          })
        break
      case '/domains':
        this._getDomains(req.query.q || '')
          .then((data) => {
            res.json(data)
          })
          .catch(() => {
            res.status(404).json(false)
          })
        break
      case '/roles':
        this._getRoles(req.query.q || '')
          .then((data) => {
            res.json(data)
          })
          .catch(() => {
            res.status(404).json(false)
          })
        break
      case '/ui/accounts':
        res.render('accounts')
        break
      case '/accounts':
        this._getAccounts(req.query.q || '')
          .then((data) => {
            res.json(data)
          })
          .catch(() => {
            res.status(404).json(false)
          })
        break
      case '/ui/assets':
        res.render('assets')
        break
      case '/assets':
        this._getAssets(req.query.q || '')
          .then((data) => {
            res.json(data)
          })
          .catch(() => {
            res.status(404).json(false)
          })
        break
      default:
        next()
    }
  }

  /**
   * @param sizePage {number}
   * @param page {number}
   * @param filter {string}
   * @returns {Promise<*>}
   * @private
   */
  async _getBlocks (sizePage = 0, page = 1, filter = '') {
    // sorting
    let arrayId = Array.from(this._mapBlockCache.keys()).sort().reverse()

    // filtering
    let map = filter !== '' ? new Map() : this._mapBlockCache
    if (filter !== '') {
      const re = filter.length > 2 ? new RegExp(filter, 'i') : false
      arrayId.forEach(async (id) => {
        if (!re || re.test(JSON.stringify(this._mapBlockCache.get(id)))) {
          map.set(id, this._mapBlockCache.get(id))
        }
      })
      arrayId = Array.from(map.keys()).sort().reverse()
    }

    // paging
    // @TODO hard coded upper limit
    const upperLimit = arrayId.length > 500 ? 500 : arrayId.length
    sizePage = sizePage > 0 && sizePage <= upperLimit ? sizePage : upperLimit
    const pageMax = Math.ceil(arrayId.length / sizePage)
    page = page < 1 ? pageMax : (page < pageMax ? page : pageMax)
    if (arrayId.length > sizePage) {
      arrayId = arrayId.slice((page - 1) * sizePage, page * sizePage)
    }

    // important: keep reverse order
    map = new Map()
    arrayId.forEach(async (id) => {
      map.set(id, this._mapBlockCache.get(id))
    })

    try {
      const arrayBlocks = Array.from(map.values())
      const html = await new Promise((resolve, reject) => {
        this._router.getApp().render('blocklist', { blocks: arrayBlocks }, (error, html) => {
          error ? reject(error) : resolve(html)
        })
      })
      return {
        blocks: arrayBlocks,
        filter: filter,
        page: page,
        pages: pageMax,
        sizePage: sizePage,
        height: this._mapBlockCache.size,
        html: html
      }
    } catch (error) {
      Logger.trace('_getBlocks failed').trace(error)
    }
  }

  /**
   * @param nameFile {string}
   * @returns {Object|false} Block
   * @private
   */
  _getBlock (nameFile) {
    try {
      return JSON.parse(fs.readFileSync(path.join(this._pathBlockstore, nameFile)))
    } catch (error) {
      Logger.warn('_getBlock failed').trace(error)
      return false
    }
  }

  /**
   * @param sql
   * @returns {Promise<void>}
   * @private
   */
  async _query (sql) {
    const c = new Client(this._pgConfig)
    await c.connect()
    const data = await c.query(sql)
    c.end()
    return data
  }

  /**
   * @param q {string}
   * @returns {Promise<{filter: string, peers: *, html: any}>}
   * @private
   */
  async _getPeers (q = '') {
    try {
      const data = await this._query('SELECT * FROM peer')
      const html = await new Promise((resolve, reject) => {
        this._router.getApp().render('peerlist', { arrayPeer: data.rows }, (error, html) => {
          error ? reject(error) : resolve(html)
        })
      })

      return {
        peers: data.rows,
        filter: q,
        html: html
      }
    } catch (error) {
      Logger.warn('_getPeers failed').trace(error)
      throw new Error(error)
    }
  }

  /**
   * @param q {string}
   * @returns {Promise<{filter: string, peers: *, html: any}>}
   * @private
   */
  async _getDomains (q = '') {
    try {
      const data = await this._query('SELECT * FROM domain')
      const html = await new Promise((resolve, reject) => {
        this._router.getApp().render('domainlist', { arrayDomain: data.rows }, (error, html) => {
          error ? reject(error) : resolve(html)
        })
      })

      return {
        domains: data.rows,
        filter: q,
        html: html
      }
    } catch (error) {
      Logger.warn('_getDomains failed').trace(error)
      throw new Error(error)
    }
  }

  /**
   * @param q {string}
   * @returns {Promise<{filter: string, peers: *, html: any}>}
   * @private
   */
  async _getRoles (q = '') {
    try {
      const data = await this._query('SELECT * FROM role LEFT JOIN role_has_permissions USING (role_id)')
      const html = await new Promise((resolve, reject) => {
        this._router.getApp().render('rolelist', { arrayRole: data.rows }, (error, html) => {
          error ? reject(error) : resolve(html)
        })
      })

      return {
        roles: data.rows,
        filter: q,
        html: html
      }
    } catch (error) {
      Logger.warn('_getRoles failed').trace(error)
      throw new Error(error)
    }
  }

  /**
   * @param q {string}
   * @returns {Promise<{filter: string, peers: *, html: any}>}
   * @private
   */
  async _getAccounts (q = '') {
    try {
      const data = await this._query('SELECT * FROM account')
      const html = await new Promise((resolve, reject) => {
        this._router.getApp().render('accountlist', { arrayAccount: data.rows }, (error, html) => {
          error ? reject(error) : resolve(html)
        })
      })

      return {
        accounts: data.rows,
        filter: q,
        html: html
      }
    } catch (error) {
      Logger.warn('_getAccounts failed').trace(error)
      throw new Error(error)
    }
  }

  /**
   * @param q {string}
   * @returns {Promise<{filter: string, peers: *, html: any}>}
   * @private
   */
  async _getAssets (q = '') {
    try {
      const data = await this._query('SELECT * FROM asset')
      const html = await new Promise((resolve, reject) => {
        this._router.getApp().render('assetlist', { arrayAsset: data.rows }, (error, html) => {
          error ? reject(error) : resolve(html)
        })
      })

      return {
        assets: data.rows,
        filter: q,
        html: html
      }
    } catch (error) {
      Logger.warn('_getAssets failed').trace(error)
      throw new Error(error)
    }
  }
}

module.exports = { IrohaExplorer }
