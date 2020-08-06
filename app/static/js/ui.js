/**
 * Iroha Explorer, User Interface
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

// wait for rendered UI and available dependencies to initialize JS
setTimeout( () => { __initUi() }, 100)
function __initUi () {
  // check if umbrella and DOM is already available
  if (!u || !WebSocket || !fetch) {
    setTimeout(() => {
      __initUi()
    }, 50)
    return
  }

  Ui.make()
}

class Ui {
  /**
   * @public
   */
  static make () {
    // load non-critical css
    // u('link[rel="preload"][as="style"]').attr('rel', 'stylesheet')

    // menu
    u('a.navbar-item').removeClass('is-active')
    u('a.navbar-item[href="' + window.location.pathname + '"]').length ?
      u('a.navbar-item[href="' + window.location.pathname + '"]').addClass('is-active') :
      u(u('a.navbar-item').first()).addClass('is-active')

    // mobile menu
    u('.navbar-burger').off('click').handle('click', () => {
      // Toggle the "is-active" class on both the "navbar-burger" and the "navbar-menu"
      u('.navbar-burger').toggleClass('is-active')
      u('.navbar-menu').toggleClass('is-active')
    })

    Ui._initWebsocket()

    switch (window.location.pathname) {
      case '/':
      case '/ui/blocks':
        Ui._fetchBlocks()
        break
      case '/ui/peers-domains-roles':
        Ui._fetchPeers()
        Ui._fetchDomains()
        Ui._fetchRoles()
        break
      case '/ui/accounts':
        Ui._fetchAccounts()
        break
      case '/ui/assets':
        Ui._fetchAssets()
        break
    }
  }

  /**
   * @param q
   * @private
   */
  static _fetchBlocks (q = '') {
    fetch('/blocks?q=' + q)
      .then((response) => {
        return response.json()
      })
      .then((response) => {
        u('#heightBlockchain').text(response.height)
        u('#search input').first().value = response.filter
        u('table.blocks tbody').html(response.html)
        Ui._attachEvents()
      })
  }

  /**
   * @param q {string}
   * @private
   */
  static _fetchPeers (q = '') {
    fetch('/peers?q=' + q)
      .then((response) => {
        return response.json()
      })
      .then((response) => {
        u('table.peers tbody').html(response.html)
        Ui._attachEvents()
      })
  }

  /**
   * @param q {string}
   * @private
   */
  static _fetchDomains (q = '') {
    fetch('/domains?q=' + q)
      .then((response) => {
        return response.json()
      })
      .then((response) => {
        u('table.domains tbody').html(response.html)
        Ui._attachEvents()
      })
  }

  /**
   * @param q {string}
   * @private
   */
  static _fetchRoles (q = '') {
    fetch('/roles?q=' + q)
      .then((response) => {
        return response.json()
      })
      .then((response) => {
        u('table.roles tbody').html(response.html)
        Ui._attachEvents()
      })
  }

  /**
   * @param q {string}
   * @private
   */
  static _fetchAccounts (q = '') {
    fetch('/accounts?q=' + q)
      .then((response) => {
        return response.json()
      })
      .then((response) => {
        u('table.accounts tbody').html(response.html)
        Ui._attachEvents()
      })
  }

  /**
   * @param q {string}
   * @private
   */
  static _fetchAssets (q = '') {
    fetch('/assets?q=' + q)
      .then((response) => {
        return response.json()
      })
      .then((response) => {
        u('table.assets tbody').html(response.html)
        Ui._attachEvents()
      })
  }

  /**
   * @private
   */
  static _initWebsocket () {
    // connect to local websocket
    Ui.websocket = new WebSocket((/s:/.test(document.location.protocol) ? 'wss://' : 'ws://') + document.location.host)

    // Connection opened
    Ui.websocket.addEventListener('open', () => {
      u('#status-connection').removeClass('has-text-danger').addClass('has-text-success')
      u('#status-connection i').removeClass('icon-times').addClass('icon-check')
    })

    // Connection closed
    Ui.websocket.addEventListener('close', () => {
      u('#status-connection').removeClass('has-text-success').addClass('has-text-danger')
      u('#status-connection i').removeClass('icon-check').addClass('icon-times')
      Ui.websocket = null
      setTimeout(() => { Ui._initWebsocket() }, 2000)
    })

    // Listen for data
    Ui.websocket.addEventListener('message', async (event) => {
      let obj
      try {
        obj = JSON.parse(event.data)
        u('#status-update').removeClass('is-hidden')
        setTimeout(() => {
          u('#status-update').addClass('is-hidden')
        }, 3000)

        switch (obj.cmd || '') {
          case 'block':
            u('#heightBlockchain').text(obj.height)
            u('table.blocks tbody').prepend(obj.html)
            Ui._attachEvents()
            break
          default:
            Logger.warn(objData)
            break
        }
      } catch (error) {
        console.error(error)
      }
    })
  }

  /**
   * @private
   */
  static _attachEvents () {
    // search
    u('#search').off('submit').handle('submit', async () => {
      Ui._fetchBlocks(encodeURIComponent(u('input.search').first().value))
    })

    // load block data
    u('table.blocks td span, table.blocks td a').off('click').handle('click', async (e) => {
      const idBlock = u(e.currentTarget).data('id')

      const d = u('td.data[data-id="' + idBlock + '"]')
      let response = {}
      if (d.text() === '') {
        response = await (await fetch('/block?q=' + idBlock)).json()
        if (response) {
          d.text(JSON.stringify(response, null, 2))
        }
      }

      if (d.text() !== '') {
        d.toggleClass('is-hidden')
        u('td.marker[data-id="' + idBlock + '"] span i').toggleClass('icon-angle-down')
        u('td.marker[data-id="' + idBlock + '"] span i').toggleClass('icon-angle-right')
      }
    })

    // load account data
    u('table.accounts td span, table.accounts td a').off('click').handle('click', async (e) => {
      const idAccount = u(e.currentTarget).data('id')

      const d = u('td.data[data-id="' + idAccount + '"]')
      let response = {}
      if (d.text() === '') {
        response = await (await fetch('/account?q=' + idAccount)).json()
        if (response) {
          d.text(JSON.stringify(response, null, 2))
        }
      }

      if (d.text() !== '') {
        d.toggleClass('is-hidden')
        u('td.marker[data-id="' + idAccount + '"] span i').toggleClass('icon-angle-down')
        u('td.marker[data-id="' + idAccount + '"] span i').toggleClass('icon-angle-right')
      }
    })
  }
}
