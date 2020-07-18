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
 */

'use strict'

import http from 'http'
import net from 'net'
import fs from 'fs'

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

    this._router = new Router()
    this._router.getApp().set('port', this._port)

    this._server = http.createServer(this._router.getApp())
    this._server.on('listening', () => {
      Logger.info(`HttpServer listening on ${this._ip}:${this._port}`)
    })
    this._server.on('close', () => {
      Logger.info(`HttpServer closing on ${this._ip}:${this._port}`)
    })
    this._server.listen(this._port, this._ip)

    fs.watch(this._path, (eventType, filename) => {
      Logger.trace(eventType).trace(filename)
    })
  }

  /**
   * @returns {Http2Server | Server}
   */
  getHttpServer () {
    return this._server
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
}

module.exports = { IrohaExplorer }
