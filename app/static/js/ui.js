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
setTimeout( () => { __initUi() }, 10)
function __initUi () {
  // check if umbrella and DOM is already available
  if (!u || !WebSocket || !fetch) {
    setTimeout(() => {
      __initUi()
    }, 20)
    return
  }

  Ui.make()
}

class Ui {
  /**
   * @public
   */
  static make () {
    // mobile menu
    u('.navbar-burger').off('click').handle('click', () => {
      // Toggle the "is-active" class on both the "navbar-burger" and the "navbar-menu"
      u('.navbar-burger').toggleClass('is-active')
      u('.navbar-menu').toggleClass('is-active')
    })

    // notifications
    u('#modal-notification').removeClass('is-active')
    u('#modal-notification .message-header p').text('')
    u('#modal-notification .message-body p').text('')

    Ui._initWebsocket()

    Ui._fetchBlocks()
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
   * @private
   */
  static _initWebsocket () {
    // connect to local websocket
    Ui.websocket = new WebSocket('ws://' + document.location.host)

    // Connection opened
    Ui.websocket.addEventListener('open', () => {
      u('#status-connection').removeClass('has-text-danger').addClass('has-text-success')
      u('#status-connection i').removeClass('fa-times').addClass('fa-check')
    })

    // Connection closed
    Ui.websocket.addEventListener('close', () => {
      u('#status-connection').removeClass('has-text-success').addClass('has-text-danger')
      u('#status-connection i').removeClass('fa-check').addClass('fa-times')
      Ui.websocket = null
      setTimeout(() => { Ui._initWebsocket() }, 2000)
    })

    // Listen for data
    Ui.websocket.addEventListener('message', async (event) => {
      let obj
      try {
        obj = JSON.parse(event.data)
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
   * @param header {string}
   * @param body {string}
   */
  static message (header, body) {
    u('#modal-notification .message-header p').text(header)
    u('#modal-notification .message-body p').text(body)
    u('#modal-notification').addClass('is-active')
  }

  /**
   * @private
   */
  static _attachEvents () {
    // search
    u('#search').off('submit').handle('submit', async () => {
      Ui._fetchBlocks(encodeURIComponent(u('input.search').first().value))
    })

    // notifications
    u('#modal-notification .modal-background, #modal-notification button.delete').off('click')
      .handle('click', () => {
        u('#modal-notification').removeClass('is-active')
        u('#modal-notification .message-header p').text('')
        u('#modal-notification .message-body p').text('')
      })

    // load block data
    u('table.blocks td span, table.blocks td a').off('click').handle('click', async (e) => {
      const idBlock = u(e.currentTarget).data('id')

      let response = {}
      if (u('#block-data-' + idBlock).text() === '') {
        response = await (await fetch('/block?q=' + idBlock)).json()
        if (response) {
          u('#block-data-' + idBlock).text(JSON.stringify(response, null, 2))
        }
      }

      if (u('#block-data-' + idBlock).text() !== '') {
        u('#block-data-' + idBlock).toggleClass('is-hidden')
        u('td.marker[data-id="' + idBlock + '"] span i').toggleClass('fa-angle-down')
        u('td.marker[data-id="' + idBlock + '"] span i').toggleClass('fa-angle-right')
      }
    })
  }
}
