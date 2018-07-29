/**
 * beaker-favicon:
 *
 * Helper protocol to serve site favicons from the sitedata db.
 **/

import {protocol, screen} from 'electron'
import * as beakerCore from '@beaker/core'
const {dat} = beakerCore
const {sitedata} = beakerCore.dbs
import fs from 'fs'
import path from 'path'
import pda from 'pauls-dat-api'
import ICO from 'icojs'

export function setup () {
  // load default favicon
  var defaultFaviconBuffer = -6 // not found, till we load it
  fs.readFile(path.join(__dirname, './assets/img/default-favicon.png'), (err, buf) => {
    if (err) { console.error('Failed to load default favicon', path.join(__dirname, './assets/img/default-favicon.png'), err) }
    if (buf) { defaultFaviconBuffer = buf }
  })

  // detect if is retina
  let display = screen.getPrimaryDisplay()
  const isRetina = display.scaleFactor >= 2

  // register favicon protocol
  protocol.registerBufferProtocol('beaker-favicon', async (request, cb) => {
    // parse the URL
    let {url, faviconSize} = parseBeakerFaviconURL(request.url)
    if (isRetina) {
      faviconSize *= 2
    }

    // if a dat, see if there's a favicon.ico or .png
    try {
      let data, fs
      // pick the filesystem
      let datResolvedUrl = url
      if (url.startsWith('dat://')) {
        datResolvedUrl = await dat.dns.resolveName(url)
        fs = dat.library.getArchive(datResolvedUrl) // (only try if the dat is loaded)
      }
      if (fs) {
        // try .ico
        try {
          data = await pda.readFile(fs, '/favicon.ico', 'binary')
          if (data) {
            // select the best-fitting size
            let images = await ICO.parse(data, 'image/png')
            let image = images[0]
            for (let i = 1; i < images.length; i++) {
              if (Math.abs(images[i].width - faviconSize) < Math.abs(image.width - faviconSize)) {
                image = images[i]
              }
            }
            let buf = Buffer.from(image.buffer)
            sitedata.set(url, 'favicon', `data:image/png;base64,${buf.toString('base64')}`) // cache
            return cb({mimeType: 'image/png', data: buf})
          }
        } catch (e) {
          // .ico failed, ignore
          data = null
        }

        // try .png
        data = await pda.readFile(fs, '/favicon.png', 'binary')
        if (data) {
          sitedata.set(url, 'favicon', `data:image/png;base64,${data.toString('base64')}`) // cache
          return cb({mimeType: 'image/png', data})
        }
      }
    } catch (e) {
      // ignore
    }

    try {
      // look up in db
      let data = await sitedata.get(url, 'favicon')
      if (data) {
        // `data` is a data url ('data:image/png;base64,...')
        // so, skip the beginning and pull out the data
        data = data.split(',')[1]
        if (data) {
          return cb({ mimeType: 'image/png', data: Buffer.from(data, 'base64') })
        }
      }
    } catch (e) {
      // ignore
    }

    cb({ mimeType: 'image/png', data: defaultFaviconBuffer })
  }, e => {
    if (e) { console.error('Failed to register beaker-favicon protocol', e) }
  })
}

const BEAKER_FAVICON_URL_RE = /^beaker-favicon:(\d*),?(.*)/
function parseBeakerFaviconURL (str) {
  const match = BEAKER_FAVICON_URL_RE.exec(str)
  let res = {
    faviconSize: (+match[1]) || 16,
    url: match[2]
  }
  // special case: in beaker://library, use the dat being viewed
  if (res.url.startsWith('beaker://library/dat://')) {
    res.url = res.url.slice('beaker://library/'.length)
  }
  return res
}
