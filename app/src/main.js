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

import { IrohaExplorer } from './iroha-explorer.js'
import { Logger } from '@diva.exchange/diva-logger'

import process from 'process'

const ip = process.env.IP_EXPLORER || '127.0.0.1'
const port = process.env.PORT_EXPLORER || 3900
const path = process.env.PATH_BLOCKSTORE_IROHA || '/tmp/iroha-blockstore/'
const postgres = process.env.POSTGRES_HOST_IROHA || '127.18.1.1:5432' // 'iroha:5432'

IrohaExplorer.make(ip, port, path, postgres)
  .then((explorer) => {
    process.on('SIGINT', async () => {
      try {
        await explorer.shutdown()
      } catch (error) {
        Logger.error(error)
      }
      process.exit(0)
    })
  })
  .catch((error) => {
    Logger.error(error)
  })
