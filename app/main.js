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
import path from 'path'

(async () => {
  const ip = process.env.IP_EXPLORER || '0.0.0.0'
  const port = process.env.PORT_EXPLORER || 3921
  const pathIroha = process.env.PATH_IROHA || path.join(__dirname, '../iroha-stub/')

  const explorer = await IrohaExplorer.make(ip, port, pathIroha)

  for (const sig of ['SIGINT', 'SIGTERM']) {
    process.once(sig, () => {
      explorer.shutdown().then(() => {
        process.exit(0)
      })
    })
  }
})()
