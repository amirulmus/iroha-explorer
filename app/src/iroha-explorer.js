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
 *
 */

'use strict'

import dateFormat from 'dateformat'
import http from 'http'
import net from 'net'
import fs from 'fs'
import ws from 'ws'

import { Logger } from '@diva.exchange/diva-logger'
import { Router } from './router'

export class IrohaExplorer {
  /**
   * Factory
   *
   * @param ip {string}
   * @param port {number}
   * @param path {string}
   * @param postgres {string}
   * @return {IrohaExplorer}
   * @throws {Error}
   * @private
   */
  static async make (ip, port, path, postgres) {
    if (!fs.existsSync(path)) {
      throw new Error(path + ' not found')
    }

    try {
      await IrohaExplorer._isAvailable(postgres)
    } catch (error) {
      throw new Error(error)
    }

    return new IrohaExplorer(ip, port, path, postgres)
  }

  /**
   * @param ip {string}
   * @param port {number}
   * @param path {string}
   * @param postgres {string}
   * @private
   */
  constructor (ip, port, path, postgres) {
    this._ip = ip
    this._port = port
    this._path = path
    this._postgres = postgres

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
        Logger.error(error)
        ws.terminate()
      })
    })

    this._initFileWatcher()
  }

  /**
   * @returns {Promise<any>}
   */
  shutdown () {
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
      setTimeout(() => { this._initFileWatcher() }, 5000)
    }

    this._watcher = fs.watch(this._path, (eventType, nameFile) => {
      let dt = ''
      switch (eventType) {
        case 'change':
          dt = dateFormat(fs.statSync(this._path + nameFile).mtime.toUTCString(), 'dd/mmm/yyyy HH:MM:ss', true)
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
   * Check whether a service on the network is listening
   *
   * @param host {string} hostname:port, like localhost:443
   * @returns {Promise<void>}
   * @private
   */
  static _isAvailable (host) {
    return new Promise((resolve, reject) => {
      const [hostname, port] = host.split(':', 2)
      const socket = net.createConnection({ port: port, host: hostname }, () => {
        socket.destroy()
        resolve()
      })
        .on('error', (error) => {
          reject(error)
        })
    })
  }

  /**
   * @param req
   * @param res
   * @param next {Function}
   * @private
   */
  _routeHandler (req, res, next) {
    let data = null
    switch (req.path) {
      case '/':
      case '/ui/blocks':
        res.render('blocks')
        break
      case '/blocks':
        this._getBlocks(
          parseInt(req.query.pagesize || 0),
          parseInt(req.query.page || 0),
          (req.query.q || '').replace(/[^\w\-+*[\]().,;:]/gi, ''))
          .then((data) => res.json(data))
          .catch(() => res.status(404).json(false))
        break
      case '/block':
        data = req.query.q ? this._getBlock(req.query.q) : false
        data ? res.json(data) : res.status(404).json(false)
        break
      case '/ui/peers':
        res.render('peers')
        break
      case '/peers':
        data = this._getPeers(req, res)
        res.json(data)
        break
      case '/ui/accounts':
        res.render('accounts')
        break
      case '/accounts':
        data = this._getAccounts(req, res)
        res.json(data)
        break
      case '/ui/transactions':
        res.render('transactions')
        break
      case '/transactions':
        data = this._getTransactions(req, res)
        res.json(data)
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
      if (filter.length < 3 || (new RegExp(filter, 'i')).test(fs.readFileSync(this._path + nameFile))) {
        map.set(nameFile,
          dateFormat(fs.statSync(this._path + nameFile).mtime.toUTCString(), 'dd/mmm/yyyy HH:MM:ss', true))
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
      Logger.warn(error)
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
    for (const nameFile of fs.readdirSync(this._path)) {
      if (nameFile.match(/^[0-9]{16}$/)) {
        arrayNameFile.push(nameFile)
        if (limit && arrayNameFile.length === limit) {
          break
        }
      }
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
      return JSON.parse(fs.readFileSync(this._path + nameFile))
    } catch (error) {
      Logger.error(error)
      return false
    }
  }

  /**
   * @param req
   * @param res
   * @private
   */
  _getPeers (req, res) {
    return this._postgres
  }

  /**
   * @param req
   * @param res
   * @private
   */
  _getAccounts (req, res) {
    return this._postgres
  }

  /**
   * @param req
   * @param res
   * @private
   */
  _getTransactions (req, res) {
    return this._postgres
  }
}

module.exports = { IrohaExplorer }
