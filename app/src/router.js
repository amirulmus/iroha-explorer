/**
 * Iroha Explorer, Router
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

import compression from 'compression'
import createError from 'http-errors'
import express from 'express'
import path from 'path'

import { Logger } from '@diva.exchange/diva-logger'

export class Router {
  /**
   * @param routeHandler {Function}
   * @throws {Error}
   * @protected
   */
  constructor (routeHandler) {
    /** @type {Function} */
    this._app = express()
    // generic
    this._app.set('x-powered-by', false)

    // compression
    this._app.use(compression())

    // static content
    this._app.use(express.static(path.join(__dirname, '/../static/')))

    // view engine setup
    this._app.set('views', path.join(__dirname, '/../view/'))
    this._app.set('view engine', 'pug')

    this._app.use(express.json())

    // routes
    this._app.use(routeHandler)

    // catch unavailable favicon.ico
    this._app.get('/favicon.ico', (req, res) => res.sendStatus(204))

    // catch 404 and forward to error handler
    this._app.use((req, res, next) => {
      next(createError(404))
    })

    // error handler
    this._app.use((err, req, res, next) => Router._errorHandler(err, req, res, next))
  }

  /**
   * @returns {Function}
   * @public
   */
  getApp () {
    return this._app
  }

  /**
   * @param err
   * @param req
   * @param res
   * @param next
   */
  static _errorHandler (err, req, res, next) {
    Logger.trace(req.originalUrl).warn(err)

    // set locals, only providing error in development
    res.locals.status = err.status
    res.locals.message = err.message
    res.locals.error = req.app.get('env') === 'development' ? err : {}

    res.status(err.status || 500)

    // render the error page
    if (req.accepts('html')) {
      res.render('error')
    } else {
      res.json({
        message: res.locals.message,
        error: res.locals.error
      })
    }
  }
}

module.exports = { Router }
