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

import { IrohaExplorer } from './src/iroha-explorer.js'

(async () => {
  const ip = process.env.IP_EXPLORER || '0.0.0.0'
  const port = process.env.PORT_EXPLORER || 3900
  const path = process.env.PATH_IROHA || '/tmp/iroha/'
  const postgres = process.env.POSTGRES_HOST_IROHA || 'postgres.diva.local:5432'

  const explorer = await IrohaExplorer.make(ip, port, path, postgres)

  for (const sig of ['SIGINT', 'SIGTERM']) {
    process.once(sig, () => {
      explorer.shutdown().then(() => {
        process.exit(0)
      })
    })
  }
})()
