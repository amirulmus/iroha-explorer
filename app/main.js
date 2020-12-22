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

import { IrohaExplorer } from './src/iroha-explorer.js'
import { Logger } from '@diva.exchange/diva-logger'
import path from 'path'

process.env.LOG_LEVEL = process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'trace')
Logger.setOptions({ name: 'IrohaExplorer', level: process.env.LOG_LEVEL })

let config = {}

config.ip = process.env.IP_EXPLORER || '127.0.0.1'
config.port = process.env.PORT_EXPLORER || 3929
config.pathIroha = process.env.PATH_IROHA || path.join(__dirname, '../iroha-stub/')
config.pathBlockstore = process.env.PATH_BLOCKSTORE || ''
config.pathConfig = process.env.PATH_CONFIG || ''

const _explorer = IrohaExplorer.make(config)

process.once('SIGINT', () => {
  _explorer.shutdown().then(() => {
    process.exit(0)
  })
})
