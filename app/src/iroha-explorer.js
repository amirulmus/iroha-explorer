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
   * @param ip {string}
   * @param port {number}
   * @param pathIroha {string}
   * @return {IrohaExplorer}
   * @throws {Error}
   * @public
   */
  static async make (ip, port, pathIroha) {
    return new IrohaExplorer(ip, port, pathIroha)
  }

  /**
   * @param ip {string}
   * @param port {number}
   * @param pathIroha {string}
   * @private
   */
  constructor (ip, port, pathIroha) {
    this._ip = ip
    this._port = port
    this._pathData = path.join(pathIroha, 'data')
    this._pathBlockstore = path.join(pathIroha, 'blockstore')

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

    this._mapBlockCache = new Map()

    this._initFileWatcher()
    this._connectPostgres()
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
  shutdown () {
    if (this._dbClient) {
      this._dbClient.end()
    }
    if (this._watcher) {
      this._watcher.close()
    }

    return new Promise((resolve) => {
      this._webSocketServer.close(() => {
        this._server.close(() => { resolve() })
      })
    })
  }

  /**
   * @private
   */
  _initFileWatcher () {
    if (this._watcher) {
      this._watcher.close()
    }
    if (!this._getArrayBlockFile(false, 1).length) {
      setTimeout(() => { this._initFileWatcher() }, 30000)
      return
    }

    this._watcher = fs.watch(this._pathBlockstore, (eventType, nameFile) => {
      let dt = ''
      switch (eventType) {
        case 'change':
          dt = dateFormat(fs.statSync(path.join(this._pathBlockstore, nameFile)).mtime.toUTCString(),
            'dd/mmm/yyyy HH:MM:ss', true)
          this._router.getApp().render('blocklist', { arrayBlock: [[nameFile, dt]] }, (error, html) => {
            if (!error) {
              this._webSocket.forEach((ws) => {
                ws.send(JSON.stringify({
                  cmd: 'block',
                  blocks: [[nameFile, dt]],
                  height: parseInt(nameFile),
                  html: html
                }))
              })
            } else {
              Logger.warn(error)
            }
          })
          break
        case 'rename':
          if (!nameFile) {
            return this._initFileWatcher()
          }
          break
      }
    })
  }

  /**
   * @private
   */
  _connectPostgres () {
    let config = {}
    try {
      // load the config file
      Logger.info('Reading config from: ' + path.join(this._pathData, 'config.json'))
      config = JSON.parse(fs.readFileSync(path.join(this._pathData, 'config.json')))
      const socket = net.connect({ port: config.database.port, host: config.database.host }, () => {
        socket.end()
        this._dbClient = new Client({
          host: config.database.host,
          port: config.database.port,
          database: config.database['working database'],
          user: config.database.user,
          password: config.database.password
        })

        this._dbClient.connect()
          .then(() => {
            // only after a successful connection attach an error handler
            this._dbClient.once('error', (error) => {
              this._errorPostgres(error)
            })
          })
          .catch((error) => {
            this._errorPostgres(error)
          })
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
    if (this._dbClient) {
      this._dbClient.end()
      delete this._dbClient
    }
    setTimeout(() => { this._connectPostgres() }, 30000)
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
          (req.query.q || '').replace(/[^\w\-+*[\]().,;:]/gi, '')
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
   * @returns {Promise<{blocks: [any, any][], sizePage: number, html: any, page: number, height: number}>}
   * @private
   */
  _getBlocks (sizePage = 0, page = 0, filter = '') {
    // sorting
    let arrayNameFile = this._getArrayBlockFile(true).reverse()

    // paging
    // @TODO hard coded upper limit
    const upperLimit = arrayNameFile.length > 1000 ? 1000 : arrayNameFile.length
    sizePage = sizePage > 0 && sizePage <= upperLimit ? sizePage : upperLimit
    page = page > 0 && page * sizePage < upperLimit + sizePage ? page : 0

    arrayNameFile = arrayNameFile.slice(page * sizePage, (page + 1) * sizePage)

    const map = new Map()
    arrayNameFile.forEach((nameFile) => {
      const key = path.join(this._pathBlockstore, nameFile)
      if (!this._mapBlockCache.has(key)) {
        try {
          const json = JSON.parse(fs.readFileSync(key))
          this._mapBlockCache.set(key,
            dateFormat(Math.floor(json.blockV1.payload.createdTime || 1), 'dd/mmm/yyyy HH:MM:ss', true))
        } catch (error) {
          Logger.warn('_getBlocks json error').trace(error)
        }
      }
      if (filter.length < 3 || (new RegExp(filter, 'i')).test(fs.readFileSync(key))) {
        map.set(nameFile, this._mapBlockCache.get(key))
      }
    })

    return new Promise((resolve, reject) => {
      this._router.getApp().render('blocklist', { arrayBlock: Array.from(map) }, (error, html) => {
        if (!error) {
          resolve(html)
        } else {
          reject(error)
        }
      })
    }).then((html) => {
      return {
        blocks: Array.from(map),
        filter: filter,
        height: arrayNameFile.length,
        html: html
      }
    }).catch((error) => {
      Logger.trace('_getBlocks failed').trace(error)
    })
  }

  /**
   * @param sorted {boolean}
   * @param limit {number}
   * @returns {Array}
   * @private
   */
  _getArrayBlockFile (sorted = false, limit = 0) {
    const arrayNameFile = []
    try {
      for (const nameFile of fs.readdirSync(this._pathBlockstore)) {
        if (nameFile.match(/^[0-9]{16}$/)) {
          arrayNameFile.push(nameFile)
          if (limit && arrayNameFile.length === limit) {
            break
          }
        }
      }
    } catch (error) {
      Logger.warn('_getArrayBlockFile failed').trace(error)
    }
    return sorted ? arrayNameFile : arrayNameFile.sort()
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
   * @param q {string}
   * @returns {Promise<{filter: string, peers: *, html: any}>}
   * @private
   */
  async _getPeers (q = '') {
    try {
      const data = await this._dbClient.query('SELECT * FROM peer')
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
      const data = await this._dbClient.query('SELECT * FROM domain')
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
      const data = await this._dbClient.query('SELECT * FROM role LEFT JOIN role_has_permissions USING (role_id)')
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
      const data = await this._dbClient.query('SELECT * FROM account')
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
      const data = await this._dbClient.query('SELECT * FROM asset')
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
