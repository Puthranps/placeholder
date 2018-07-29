(function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
'use strict';

var rpcAPI = require('pauls-electron-rpc');
var beakerCoreWebview = require('@beaker/core/webview');
var electron = require('electron');

// exported api
// =

function setup$1 () {
  // attach site info override methods
  // - only allowed on internal pages
  if (window.location.protocol === 'beaker:') {
    window.locationbar.setSiteInfoOverride = setSiteInfoOverride;
    window.locationbar.clearSiteInfoOverride = clearSiteInfoOverride;
    window.locationbar.openUrl = openUrl;
    window.locationbar.closeMenus = closeMenus;
    window.locationbar.toggleLiveReloading = toggleLiveReloading;
  }
}

function setSiteInfoOverride ({ title, url }) {
  electron.ipcRenderer.sendToHost('site-info-override:set', { title, url });
}

function clearSiteInfoOverride () {
  electron.ipcRenderer.sendToHost('site-info-override:clear');
}

function openUrl (url, {newTab} = {}) {
  electron.ipcRenderer.sendToHost('open-url', {url, newTab});
}

function closeMenus () {
  electron.ipcRenderer.sendToHost('close-menus');
}

function toggleLiveReloading () {
  electron.ipcRenderer.sendToHost('toggle-live-reloading');
}

/*
This provides window.prompt(), which electron does not do for us.
*/

// exported api
// =

function setup$2 () {
  // we have use ipc directly instead of using rpc, because we need custom
  // repsonse-lifecycle management in the main thread
  window.prompt = (message, def) => (
    electron.ipcRenderer.sendSync('page-prompt-dialog', message, def)
  );
}

// HACK
// electron has a problem handling redirects correctly, so we need to handle it for them
// see https://github.com/electron/electron/issues/3471
// thanks github.com/sokcuri and github.com/alexstrat for this fix
// -prf

var setupRedirectHackfix = function () {
  electron.ipcRenderer.on('redirect-hackfix', function (event, url) {
    window.location.assign(url);
  });
};

// HACK
// we dont have an api for getting a webview out of html5 fullscreen mode
// but we cant just executeJavaScript(`document.webkitExitFullscreen()`)
// because an adversarial app could change the function reference to a noop
// so we capture the reference here and expose it via RPC to be sure we
// will have access to it
// -prf

const documentCtx = document;
const webkitExitFullscreen = document.webkitExitFullscreen;

var setupExitFullScreenHackfix = function () {
  electron.ipcRenderer.on('exit-full-screen-hackfix', () => {
    webkitExitFullscreen.call(documentCtx);
  });
};

// HACKS
setupRedirectHackfix();
setupExitFullScreenHackfix();

// register protocol behaviors
/* This marks the scheme as:
 - Secure
 - Allowing Service Workers
 - Supporting Fetch API
 - CORS Enabled
*/
electron.webFrame.registerURLSchemeAsPrivileged('dat', { bypassCSP: false });

beakerCoreWebview.setup({rpcAPI});
setup$1();
setup$2();

},{"@beaker/core/webview":17,"electron":undefined,"pauls-electron-rpc":21}],2:[function(require,module,exports){
const DatArchive = require('./fg/dat-archive')
const beaker = require('./fg/beaker')
const experimental = require('./fg/experimental')

exports.setup = function ({rpcAPI}) {
  // setup APIs
  if (['beaker:', 'dat:', 'https:'].includes(window.location.protocol) ||
      (window.location.protocol === 'http:' && window.location.hostname === 'localhost')) {
    window.DatArchive = DatArchive.setup(rpcAPI)
  }
  if (['beaker:', 'dat:'].includes(window.location.protocol)) {
    window.beaker = beaker.setup(rpcAPI)
    window.experimental = experimental.setup(rpcAPI)
  }
}

},{"./fg/beaker":3,"./fg/dat-archive":4,"./fg/experimental":6}],3:[function(require,module,exports){
const {EventTarget, bindEventStream, fromEventStream} = require('./event-target')
const errors = require('beaker-error-constants')

const archivesManifest = require('../manifests/internal/archives')
const bookmarksManifest = require('../manifests/internal/bookmarks')
const historyManifest = require('../manifests/internal/history')
const downloadsManifest = require('../manifests/internal/downloads')
const sitedataManifest = require('../manifests/internal/sitedata')
const beakerBrowserManifest = require('../manifests/internal/browser')

exports.setup = function (rpc) {
  const beaker = {}
  const opts = {timeout: false, errors}

  // internal only
  if (window.location.protocol === 'beaker:') {
    const historyRPC = rpc.importAPI('history', historyManifest, opts)
    const bookmarksRPC = rpc.importAPI('bookmarks', bookmarksManifest, opts)
    const archivesRPC = rpc.importAPI('archives', archivesManifest, opts)
    const downloadsRPC = rpc.importAPI('downloads', downloadsManifest, opts)
    const sitedataRPC = rpc.importAPI('sitedata', sitedataManifest, opts)
    const beakerBrowserRPC = rpc.importAPI('beaker-browser', beakerBrowserManifest, opts)

    // beaker.bookmarks
    beaker.bookmarks = {}
    beaker.bookmarks.getBookmark = bookmarksRPC.getBookmark
    beaker.bookmarks.isBookmarked = bookmarksRPC.isBookmarked
    beaker.bookmarks.bookmarkPublic = bookmarksRPC.bookmarkPublic
    beaker.bookmarks.unbookmarkPublic = bookmarksRPC.unbookmarkPublic
    beaker.bookmarks.listPublicBookmarks = bookmarksRPC.listPublicBookmarks
    beaker.bookmarks.setBookmarkPinned = bookmarksRPC.setBookmarkPinned
    beaker.bookmarks.setBookmarkPinOrder = bookmarksRPC.setBookmarkPinOrder
    beaker.bookmarks.listPinnedBookmarks = bookmarksRPC.listPinnedBookmarks
    beaker.bookmarks.bookmarkPrivate = bookmarksRPC.bookmarkPrivate
    beaker.bookmarks.unbookmarkPrivate = bookmarksRPC.unbookmarkPrivate
    beaker.bookmarks.listPrivateBookmarks = bookmarksRPC.listPrivateBookmarks
    beaker.bookmarks.listBookmarkTags = bookmarksRPC.listBookmarkTags

    // beaker.archives
    beaker.archives = new EventTarget()
    beaker.archives.status = archivesRPC.status
    beaker.archives.add = archivesRPC.add
    beaker.archives.remove = archivesRPC.remove
    beaker.archives.bulkRemove = archivesRPC.bulkRemove
    beaker.archives.delete = archivesRPC.delete
    beaker.archives.list = archivesRPC.list
    beaker.archives.validateLocalSyncPath = archivesRPC.validateLocalSyncPath
    beaker.archives.setLocalSyncPath = archivesRPC.setLocalSyncPath
    beaker.archives.ensureLocalSyncFinished = archivesRPC.ensureLocalSyncFinished
    beaker.archives.getDraftInfo = archivesRPC.getDraftInfo
    beaker.archives.listDrafts = archivesRPC.listDrafts
    beaker.archives.addDraft = archivesRPC.addDraft
    beaker.archives.removeDraft = archivesRPC.removeDraft
    beaker.archives.getTemplate = archivesRPC.getTemplate
    beaker.archives.listTemplates = archivesRPC.listTemplates
    beaker.archives.putTemplate = archivesRPC.putTemplate
    beaker.archives.removeTemplate = archivesRPC.removeTemplate
    beaker.archives.touch = archivesRPC.touch
    beaker.archives.clearFileCache = archivesRPC.clearFileCache
    beaker.archives.clearGarbage = archivesRPC.clearGarbage
    beaker.archives.clearDnsCache = archivesRPC.clearDnsCache
    beaker.archives.getDebugLog = archivesRPC.getDebugLog
    beaker.archives.createDebugStream = () => fromEventStream(archivesRPC.createDebugStream())
    try {
      bindEventStream(archivesRPC.createEventStream(), beaker.archives)
    } catch (e) {
      // permissions error
    }

    // beaker.history
    beaker.history = {}
    beaker.history.addVisit = historyRPC.addVisit
    beaker.history.getVisitHistory = historyRPC.getVisitHistory
    beaker.history.getMostVisited = historyRPC.getMostVisited
    beaker.history.search = historyRPC.search
    beaker.history.removeVisit = historyRPC.removeVisit
    beaker.history.removeAllVisits = historyRPC.removeAllVisits
    beaker.history.removeVisitsAfter = historyRPC.removeVisitsAfter

    // beaker.downloads
    beaker.downloads = {}
    beaker.downloads.getDownloads = downloadsRPC.getDownloads
    beaker.downloads.pause = downloadsRPC.pause
    beaker.downloads.resume = downloadsRPC.resume
    beaker.downloads.cancel = downloadsRPC.cancel
    beaker.downloads.remove = downloadsRPC.remove
    beaker.downloads.open = downloadsRPC.open
    beaker.downloads.showInFolder = downloadsRPC.showInFolder
    beaker.downloads.createEventsStream = () => fromEventStream(downloadsRPC.createEventsStream())

    // beaker.sitedata
    beaker.sitedata = {}
    beaker.sitedata.get = sitedataRPC.get
    beaker.sitedata.set = sitedataRPC.set
    beaker.sitedata.getPermissions = sitedataRPC.getPermissions
    beaker.sitedata.getAppPermissions = sitedataRPC.getAppPermissions
    beaker.sitedata.getPermission = sitedataRPC.getPermission
    beaker.sitedata.setPermission = sitedataRPC.setPermission
    beaker.sitedata.setAppPermissions = sitedataRPC.setAppPermissions
    beaker.sitedata.clearPermission = sitedataRPC.clearPermission
    beaker.sitedata.clearPermissionAllOrigins = sitedataRPC.clearPermissionAllOrigins

    // beaker.browser
    beaker.browser = {}
    beaker.browser.createEventsStream = () => fromEventStream(beakerBrowserRPC.createEventsStream())
    beaker.browser.getInfo = beakerBrowserRPC.getInfo
    beaker.browser.checkForUpdates = beakerBrowserRPC.checkForUpdates
    beaker.browser.restartBrowser = beakerBrowserRPC.restartBrowser
    beaker.browser.getSetting = beakerBrowserRPC.getSetting
    beaker.browser.getSettings = beakerBrowserRPC.getSettings
    beaker.browser.setSetting = beakerBrowserRPC.setSetting
    beaker.browser.getUserSetupStatus = beakerBrowserRPC.getUserSetupStatus
    beaker.browser.setUserSetupStatus = beakerBrowserRPC.setUserSetupStatus
    beaker.browser.getDefaultLocalPath = beakerBrowserRPC.getDefaultLocalPath
    beaker.browser.setStartPageBackgroundImage = beakerBrowserRPC.setStartPageBackgroundImage
    beaker.browser.getDefaultProtocolSettings = beakerBrowserRPC.getDefaultProtocolSettings
    beaker.browser.setAsDefaultProtocolClient = beakerBrowserRPC.setAsDefaultProtocolClient
    beaker.browser.removeAsDefaultProtocolClient = beakerBrowserRPC.removeAsDefaultProtocolClient
    beaker.browser.fetchBody = beakerBrowserRPC.fetchBody
    beaker.browser.downloadURL = beakerBrowserRPC.downloadURL
    beaker.browser.listBuiltinFavicons = beakerBrowserRPC.listBuiltinFavicons
    beaker.browser.getBuiltinFavicon = beakerBrowserRPC.getBuiltinFavicon
    beaker.browser.setWindowDimensions = beakerBrowserRPC.setWindowDimensions
    beaker.browser.showOpenDialog = beakerBrowserRPC.showOpenDialog
    beaker.browser.showContextMenu = beakerBrowserRPC.showContextMenu
    beaker.browser.openUrl = beakerBrowserRPC.openUrl
    beaker.browser.openFolder = beakerBrowserRPC.openFolder
    beaker.browser.doWebcontentsCmd = beakerBrowserRPC.doWebcontentsCmd
    beaker.browser.doTest = beakerBrowserRPC.doTest
    beaker.browser.closeModal = beakerBrowserRPC.closeModal
  }

  return beaker
}

},{"../manifests/internal/archives":11,"../manifests/internal/bookmarks":12,"../manifests/internal/browser":13,"../manifests/internal/downloads":14,"../manifests/internal/history":15,"../manifests/internal/sitedata":16,"./event-target":5,"beaker-error-constants":18}],4:[function(require,module,exports){
const errors = require('beaker-error-constants')
const parseDatURL = require('parse-dat-url')
const datArchiveManifest = require('../manifests/external/dat-archive')
const {EventTarget, Event, fromEventStream} = require('./event-target')
const Stat = require('./stat')

const LOAD_PROMISE = Symbol('LOAD_PROMISE')
const URL_PROMISE = Symbol('URL_PROMISE')
const NETWORK_ACT_STREAM = Symbol() // eslint-disable-line

exports.setup = function (rpc) {
  // create the rpc apis
  const datRPC = rpc.importAPI('dat-archive', datArchiveManifest, { timeout: false, errors })

  class DatArchive extends EventTarget {
    constructor (url) {
      super()
      var errStack = (new Error()).stack

      // simple case: new DatArchive(window.location)
      if (url === window.location) {
        url = window.location.toString()
      }

      // basic URL validation
      if (!url || typeof url !== 'string') {
        throwWithFixedStack(new Error('Invalid dat:// URL'), errStack)
      }

      // parse the URL
      const urlParsed = parseDatURL(url)
      if (!urlParsed || (urlParsed.protocol !== 'dat:')) {
        throwWithFixedStack(new Error('Invalid URL: must be a dat:// URL'), errStack)
      }
      url = 'dat://' + urlParsed.hostname + (urlParsed.version ? `+${urlParsed.version}` : '')

      // load into the 'active' (in-memory) cache
      setHidden(this, LOAD_PROMISE, datRPC.loadArchive(url))

      // resolve the URL (DNS)
      const urlPromise = DatArchive.resolveName(url).then(url => {
        if (urlParsed.version) {
          url += `+${urlParsed.version}`
        }
        return 'dat://' + url
      })
      setHidden(this, URL_PROMISE, urlPromise)

      // define this.url as a frozen getter
      Object.defineProperty(this, 'url', {
        enumerable: true,
        value: url
      })
    }

    static load (url) {
      var errStack = (new Error()).stack
      const a = new DatArchive(url)
      return Promise.all([a[LOAD_PROMISE], a[URL_PROMISE]])
        .then(() => a)
        .catch(e => throwWithFixedStack(e, errStack))
    }

    static create (opts = {}) {
      var errStack = (new Error()).stack
      return datRPC.createArchive(opts)
        .then(newUrl => new DatArchive(newUrl))
        .catch(e => throwWithFixedStack(e, errStack))
    }

    static fork (url, opts = {}) {
      var errStack = (new Error()).stack
      url = (typeof url.url === 'string') ? url.url : url
      if (!isDatURL(url)) {
        throwWithFixedStack(new Error('Invalid URL: must be a dat:// URL'), errStack)
      }
      return datRPC.forkArchive(url, opts)
        .then(newUrl => new DatArchive(newUrl))
        .catch(e => throwWithFixedStack(e, errStack))
    }

    static unlink (url) {
      var errStack = (new Error()).stack
      url = (typeof url.url === 'string') ? url.url : url
      if (!isDatURL(url)) {
        throwWithFixedStack(new Error('Invalid URL: must be a dat:// URL'), errStack)
      }
      return datRPC.unlinkArchive(url)
        .catch(e => throwWithFixedStack(e, errStack))
    }

    // override to create the activity stream if needed
    addEventListener (type, callback) {
      if (type === 'network-changed' || type === 'download' || type === 'upload' || type === 'sync') {
        createNetworkActStream(this)
      }
      super.addEventListener(type, callback)
    }

    async getInfo (opts = {}) {
      var errStack = (new Error()).stack
      try {
        var url = await this[URL_PROMISE]
        return await datRPC.getInfo(url, opts)
      } catch (e) {
        throwWithFixedStack(e, errStack)
      }
    }

    async configure (info, opts = {}) {
      var errStack = (new Error()).stack
      try {
        var url = await this[URL_PROMISE]
        return await datRPC.configure(url, info, opts)
      } catch (e) {
        throwWithFixedStack(e, errStack)
      }
    }

    checkout (version) {
      const urlParsed = parseDatURL(this.url)
      version = typeof version === 'number' ? `+${version}` : ''
      return new DatArchive(`dat://${urlParsed.hostname}${version}`)
    }

    async diff (opts = {}) {
      // noop
      console.warn('The DatArchive diff() API has been deprecated.')
      return []
    }

    async commit (opts = {}) {
      // noop
      console.warn('The DatArchive commit() API has been deprecated.')
      return []
    }

    async revert (opts = {}) {
      // noop
      console.warn('The DatArchive revert() API has been deprecated.')
      return []
    }

    async history (opts = {}) {
      var errStack = (new Error()).stack
      try {
        var url = await this[URL_PROMISE]
        return await datRPC.history(url, opts)
      } catch (e) {
        throwWithFixedStack(e, errStack)
      }
    }

    async stat (path, opts = {}) {
      var errStack = (new Error()).stack
      try {
        var url = await this[URL_PROMISE]
        return new Stat(await datRPC.stat(url, path, opts))
      } catch (e) {
        throwWithFixedStack(e, errStack)
      }
    }

    async readFile (path, opts = {}) {
      var errStack = (new Error()).stack
      try {
        var url = await this[URL_PROMISE]
        return await datRPC.readFile(url, path, opts)
      } catch (e) {
        throwWithFixedStack(e, errStack)
      }
    }

    async writeFile (path, data, opts = {}) {
      var errStack = (new Error()).stack
      try {
        var url = await this[URL_PROMISE]
        return await datRPC.writeFile(url, path, data, opts)
      } catch (e) {
        throwWithFixedStack(e, errStack)
      }
    }

    async unlink (path, opts = {}) {
      var errStack = (new Error()).stack
      try {
        var url = await this[URL_PROMISE]
        return await datRPC.unlink(url, path, opts)
      } catch (e) {
        throwWithFixedStack(e, errStack)
      }
    }

    async copy (path, dstPath, opts = {}) {
      var errStack = (new Error()).stack
      try {
        var url = await this[URL_PROMISE]
        return datRPC.copy(url, path, dstPath, opts)
      } catch (e) {
        throwWithFixedStack(e, errStack)
      }
    }

    async rename (path, dstPath, opts = {}) {
      var errStack = (new Error()).stack
      try {
        var url = await this[URL_PROMISE]
        return datRPC.rename(url, path, dstPath, opts)
      } catch (e) {
        throwWithFixedStack(e, errStack)
      }
    }

    async download (path = '/', opts = {}) {
      var errStack = (new Error()).stack
      try {
        var url = await this[URL_PROMISE]
        return await datRPC.download(url, path, opts)
      } catch (e) {
        throwWithFixedStack(e, errStack)
      }
    }

    async readdir (path = '/', opts = {}) {
      var errStack = (new Error()).stack
      try {
        var url = await this[URL_PROMISE]
        var names = await datRPC.readdir(url, path, opts)
        if (opts.stat) {
          names.forEach(name => { name.stat = new Stat(name.stat) })
        }
        return names
      } catch (e) {
        throwWithFixedStack(e, errStack)
      }
    }

    async mkdir (path, opts = {}) {
      var errStack = (new Error()).stack
      try {
        var url = await this[URL_PROMISE]
        return await datRPC.mkdir(url, path, opts)
      } catch (e) {
        throwWithFixedStack(e, errStack)
      }
    }

    async rmdir (path, opts = {}) {
      var errStack = (new Error()).stack
      try {
        var url = await this[URL_PROMISE]
        return await datRPC.rmdir(url, path, opts)
      } catch (e) {
        throwWithFixedStack(e, errStack)
      }
    }

    createFileActivityStream (pathSpec = null) {
      console.warn('The DatArchive createFileActivityStream() API has been deprecated, use watch() instead.')
      return this.watch(pathSpec)
    }

    watch (pathSpec = null) {
      var errStack = (new Error()).stack
      try {
        return fromEventStream(datRPC.watch(this.url, pathSpec))
      } catch (e) {
        throwWithFixedStack(e, errStack)
      }
    }

    createNetworkActivityStream () {
      console.warn('The DatArchive createNetworkActivityStream() API has been deprecated, use addEventListener() instead.')
      var errStack = (new Error()).stack
      try {
        return fromEventStream(datRPC.createNetworkActivityStream(this.url))
      } catch (e) {
        throwWithFixedStack(e, errStack)
      }
    }

    static async resolveName (name) {
      var errStack = (new Error()).stack
      try {
        // simple case: DatArchive.resolveName(window.location)
        if (name === window.location) {
          name = window.location.toString()
        }
        return await datRPC.resolveName(name)
      } catch (e) {
        throwWithFixedStack(e, errStack)
      }
    }

    static selectArchive (opts = {}) {
      var errStack = (new Error()).stack
      return datRPC.selectArchive(opts)
        .then(url => new DatArchive(url))
        .catch(e => throwWithFixedStack(e, errStack))
    }
  }

  // add internal methods
  if (window.location.protocol === 'beaker:') {
    DatArchive.importFromFilesystem = async function (opts = {}) {
      var errStack = (new Error()).stack
      try {
        return await datRPC.importFromFilesystem(opts)
      } catch (e) {
        throwWithFixedStack(e, errStack)
      }
    }

    DatArchive.exportToFilesystem = async function (opts = {}) {
      var errStack = (new Error()).stack
      try {
        return await datRPC.exportToFilesystem(opts)
      } catch (e) {
        throwWithFixedStack(e, errStack)
      }
    }

    DatArchive.exportToArchive = async function (opts = {}) {
      var errStack = (new Error()).stack
      try {
        return await datRPC.exportToArchive(opts)
      } catch (e) {
        throwWithFixedStack(e, errStack)
      }
    }

    DatArchive.diff = async function (srcUrl, dstUrl, opts = {}) {
      if (srcUrl && typeof srcUrl.url === 'string') srcUrl = srcUrl.url
      if (dstUrl && typeof dstUrl.url === 'string') dstUrl = dstUrl.url
      var errStack = (new Error()).stack
      return datRPC.diff(srcUrl, dstUrl, opts)
        .catch(e => throwWithFixedStack(e, errStack))
    }

    DatArchive.merge = async function (srcUrl, dstUrl, opts = {}) {
      if (srcUrl && typeof srcUrl.url === 'string') srcUrl = srcUrl.url
      if (dstUrl && typeof dstUrl.url === 'string') dstUrl = dstUrl.url
      var errStack = (new Error()).stack
      return datRPC.merge(srcUrl, dstUrl, opts)
        .catch(e => throwWithFixedStack(e, errStack))
    }
  }

  // internal methods
  // =

  function setHidden (t, attr, value) {
    Object.defineProperty(t, attr, {enumerable: false, value})
  }

  function isDatURL (url) {
    var urlp = parseDatURL(url)
    return urlp && urlp.protocol === 'dat:'
  }

  function throwWithFixedStack (e, errStack) {
    e = e || new Error()
    e.stack = e.stack.split('\n')[0] + '\n' + errStack.split('\n').slice(2).join('\n')
    throw e
  }

  function createNetworkActStream (archive) {
    if (archive[NETWORK_ACT_STREAM]) return
    var s = archive[NETWORK_ACT_STREAM] = fromEventStream(datRPC.createNetworkActivityStream(archive.url))
    s.addEventListener('network-changed', detail => archive.dispatchEvent(new Event('network-changed', {target: archive, peers: detail.connections})))
    s.addEventListener('download', detail => archive.dispatchEvent(new Event('download', {target: archive, feed: detail.feed, block: detail.block, bytes: detail.bytes})))
    s.addEventListener('upload', detail => archive.dispatchEvent(new Event('upload', {target: archive, feed: detail.feed, block: detail.block, bytes: detail.bytes})))
    s.addEventListener('sync', detail => archive.dispatchEvent(new Event('sync', {target: archive, feed: detail.feed})))
  }

  return DatArchive
}

},{"../manifests/external/dat-archive":8,"./event-target":5,"./stat":7,"beaker-error-constants":18,"parse-dat-url":20}],5:[function(require,module,exports){
// this emulates the implementation of event-targets by browsers

const LISTENERS = Symbol() // eslint-disable-line
const CREATE_STREAM = Symbol() // eslint-disable-line
const STREAM_EVENTS = Symbol() // eslint-disable-line
const STREAM = Symbol() // eslint-disable-line

class EventTarget {
  constructor () {
    this[LISTENERS] = {}
  }

  addEventListener (type, callback) {
    if (!(type in this[LISTENERS])) {
      this[LISTENERS][type] = []
    }
    this[LISTENERS][type].push(callback)
  }

  removeEventListener (type, callback) {
    if (!(type in this[LISTENERS])) {
      return
    }
    var stack = this[LISTENERS][type]
    var i = stack.findIndex(cb => cb === callback)
    if (i !== -1) {
      stack.splice(i, 1)
    }
  }

  dispatchEvent (event) {
    if (!(event.type in this[LISTENERS])) {
      return
    }
    event.target = this
    var stack = this[LISTENERS][event.type]
    stack.forEach(cb => cb.call(this, event))
  }
}

class EventTargetFromStream extends EventTarget {
  constructor (createStreamFn, events) {
    super()
    this[CREATE_STREAM] = createStreamFn
    this[STREAM_EVENTS] = events
    this[STREAM] = null
  }

  addEventListener (type, callback) {
    if (!this[STREAM]) {
      // create the event stream
      let s = this[STREAM] = fromEventStream(this[CREATE_STREAM]())
      // proxy all events
      this[STREAM_EVENTS].forEach(event => {
        s.addEventListener(event, details => {
          details = details || {}
          details.target = this
          this.dispatchEvent(new Event(event, details))
        })
      })
    }
    return super.addEventListener(type, callback)
  }
}

class Event {
  constructor (type, opts) {
    this.type = type
    for (var k in opts) {
      this[k] = opts[k]
    }
    Object.defineProperty(this, 'bubbles', {value: false})
    Object.defineProperty(this, 'cancelBubble', {value: false})
    Object.defineProperty(this, 'cancelable', {value: false})
    Object.defineProperty(this, 'composed', {value: false})
    Object.defineProperty(this, 'currentTarget', {value: this.target})
    Object.defineProperty(this, 'deepPath', {value: []})
    Object.defineProperty(this, 'defaultPrevented', {value: false})
    Object.defineProperty(this, 'eventPhase', {value: 2}) // Event.AT_TARGET
    Object.defineProperty(this, 'timeStamp', {value: Date.now()})
    Object.defineProperty(this, 'isTrusted', {value: true})
    Object.defineProperty(this, 'createEvent', {value: () => undefined})
    Object.defineProperty(this, 'composedPath', {value: () => []})
    Object.defineProperty(this, 'initEvent', {value: () => undefined})
    Object.defineProperty(this, 'preventDefault', {value: () => undefined})
    Object.defineProperty(this, 'stopImmediatePropagation', {value: () => undefined})
    Object.defineProperty(this, 'stopPropagation', {value: () => undefined})
  }
}

exports.EventTarget = EventTarget
exports.EventTargetFromStream = EventTargetFromStream
exports.Event = Event

const bindEventStream = exports.bindEventStream = function (stream, target) {
  stream.on('data', data => {
    var event = data[1] || {}
    event.type = data[0]
    target.dispatchEvent(event)
  })
}

const fromEventStream = exports.fromEventStream = function (stream) {
  var target = new EventTarget()
  bindEventStream(stream, target)
  target.close = () => {
    target.listeners = {}
    stream.close()
  }
  return target
}

exports.fromAsyncEventStream = function (asyncStream) {
  var target = new EventTarget()
  asyncStream.then(
    stream => bindEventStream(stream, target),
    err => {
      target.dispatchEvent({type: 'error', details: err})
      target.close()
    }
  )
  target.close = () => {
    target.listeners = {}
    asyncStream.then(stream => stream.close())
  }
  return target
}

},{}],6:[function(require,module,exports){
/* globals Request Response */

const {EventTargetFromStream} = require('./event-target')
const errors = require('beaker-error-constants')

const experimentalLibraryManifest = require('../manifests/external/experimental/library')
const experimentalGlobalFetchManifest = require('../manifests/external/experimental/global-fetch')

exports.setup = function (rpc) {
  const experimental = {}
  const opts = {timeout: false, errors}

  // dat or internal only
  if (window.location.protocol === 'beaker:' || window.location.protocol === 'dat:') {
    const libraryRPC = rpc.importAPI('experimental-library', experimentalLibraryManifest, opts)
    const globalFetchRPC = rpc.importAPI('experimental-global-fetch', experimentalGlobalFetchManifest, opts)

    // experimental.library
    let libraryEvents = ['added', 'removed', 'updated', 'folder-synced', 'network-changed']
    experimental.library = new EventTargetFromStream(libraryRPC.createEventStream.bind(libraryRPC), libraryEvents)
    experimental.library.add = libraryRPC.add
    experimental.library.remove = libraryRPC.remove
    experimental.library.get = libraryRPC.get
    experimental.library.list = libraryRPC.list
    experimental.library.requestAdd = libraryRPC.requestAdd
    experimental.library.requestRemove = libraryRPC.requestRemove

    // experimental.globalFetch
    experimental.globalFetch = async function globalFetch (input, init) {
      var request = new Request(input, init)
      if (request.method !== 'HEAD' && request.method !== 'GET') {
        throw new Error('Only HEAD and GET requests are currently supported by globalFetch()')
      }
      var responseData = await globalFetchRPC.fetch({
        method: request.method,
        url: request.url,
        headers: request.headers
      })
      return new Response(responseData.body, responseData)
    }
  }

  return experimental
}

},{"../manifests/external/experimental/global-fetch":9,"../manifests/external/experimental/library":10,"./event-target":5,"beaker-error-constants":18}],7:[function(require,module,exports){
// http://man7.org/linux/man-pages/man2/stat.2.html
// mirrored from hyperdrive/lib/stat.js

const Stat = module.exports = function Stat (data) {
  if (!(this instanceof Stat)) return new Stat(data)

  /*
  TODO- are the following attrs needed?
  this.dev = 0
  this.nlink = 1
  this.rdev = 0
  this.blksize = 0
  this.ino = 0
  this.uid = data ? data.uid : 0
  this.gid = data ? data.gid : 0 */

  this.mode = data ? data.mode : 0
  this.size = data ? data.size : 0
  this.offset = data ? data.offset : 0
  this.blocks = data ? data.blocks : 0
  this.downloaded = data ? data.downloaded : 0
  this.atime = new Date(data ? data.mtime : 0) // we just set this to mtime ...
  this.mtime = new Date(data ? data.mtime : 0)
  this.ctime = new Date(data ? data.ctime : 0)

  this.linkname = data ? data.linkname : null
}

Stat.IFSOCK = 49152 // 0b1100...
Stat.IFLNK = 40960 // 0b1010...
Stat.IFREG = 32768 // 0b1000...
Stat.IFBLK = 24576 // 0b0110...
Stat.IFDIR = 16384 // 0b0100...
Stat.IFCHR = 8192 // 0b0010...
Stat.IFIFO = 4096 // 0b0001...

Stat.prototype.isSocket = check(Stat.IFSOCK)
Stat.prototype.isSymbolicLink = check(Stat.IFLNK)
Stat.prototype.isFile = check(Stat.IFREG)
Stat.prototype.isBlockDevice = check(Stat.IFBLK)
Stat.prototype.isDirectory = check(Stat.IFDIR)
Stat.prototype.isCharacterDevice = check(Stat.IFCHR)
Stat.prototype.isFIFO = check(Stat.IFIFO)

function check (mask) {
  return function () {
    return (mask & this.mode) === mask
  }
}

},{}],8:[function(require,module,exports){
module.exports = {
  loadArchive: 'promise',
  createArchive: 'promise',
  forkArchive: 'promise',
  unlinkArchive: 'promise',

  getInfo: 'promise',
  configure: 'promise',
  history: 'promise',

  stat: 'promise',
  readFile: 'promise',
  writeFile: 'promise',
  unlink: 'promise',
  copy: 'promise',
  rename: 'promise',
  download: 'promise',

  readdir: 'promise',
  mkdir: 'promise',
  rmdir: 'promise',

  watch: 'readable',
  createNetworkActivityStream: 'readable',

  resolveName: 'promise',
  selectArchive: 'promise',

  diff: 'promise',
  merge: 'promise',

  importFromFilesystem: 'promise',
  exportToFilesystem: 'promise',
  exportToArchive: 'promise',
}

},{}],9:[function(require,module,exports){
module.exports = {
  fetch: 'promise'
}

},{}],10:[function(require,module,exports){
module.exports = {
  add: 'promise',
  remove: 'promise',
  get: 'promise',
  list: 'promise',

  requestAdd: 'promise',
  requestRemove: 'promise',

  createEventStream: 'readable'
}

},{}],11:[function(require,module,exports){
module.exports = {
  // system state
  status: 'promise',

  // local cache management and querying
  add: 'promise',
  remove: 'promise',
  bulkRemove: 'promise',
  delete: 'promise',
  list: 'promise',

  // folder sync
  validateLocalSyncPath: 'promise',
  setLocalSyncPath: 'promise',
  ensureLocalSyncFinished: 'promise',

  // drafts
  getDraftInfo: 'promise',
  listDrafts: 'promise',
  addDraft: 'promise',
  removeDraft: 'promise',

  // templates
  getTemplate: 'promise',
  listTemplates: 'promise',
  putTemplate: 'promise',
  removeTemplate: 'promise',

  // internal management
  touch: 'promise',
  clearFileCache: 'promise',
  clearGarbage: 'promise',
  clearDnsCache: 'promise',

  // events
  createEventStream: 'readable',
  getDebugLog: 'promise',
  createDebugStream: 'readable'
}

},{}],12:[function(require,module,exports){
module.exports = {
  // current user
  getBookmark: 'promise',
  isBookmarked: 'promise',

  // public
  bookmarkPublic: 'promise',
  unbookmarkPublic: 'promise',
  listPublicBookmarks: 'promise',

  // pins
  setBookmarkPinned: 'promise',
  setBookmarkPinOrder: 'promise',
  listPinnedBookmarks: 'promise',

  // private
  bookmarkPrivate: 'promise',
  unbookmarkPrivate: 'promise',
  listPrivateBookmarks: 'promise',

  // tags
  listBookmarkTags: 'promise'
}

},{}],13:[function(require,module,exports){
module.exports = {
  createEventsStream: 'readable',
  getInfo: 'promise',
  checkForUpdates: 'promise',
  restartBrowser: 'sync',

  getSettings: 'promise',
  getSetting: 'promise',
  setSetting: 'promise',
  getUserSetupStatus: 'promise',
  setUserSetupStatus: 'promise',
  getDefaultLocalPath: 'promise',
  setStartPageBackgroundImage: 'promise',
  getDefaultProtocolSettings: 'promise',
  setAsDefaultProtocolClient: 'promise',
  removeAsDefaultProtocolClient: 'promise',

  listBuiltinFavicons: 'promise',
  getBuiltinFavicon: 'promise',

  fetchBody: 'promise',
  downloadURL: 'promise',

  setWindowDimensions: 'promise',
  showOpenDialog: 'promise',
  showContextMenu: 'promise',
  openUrl: 'promise',
  openFolder: 'promise',
  doWebcontentsCmd: 'promise',
  doTest: 'promise',
  closeModal: 'sync'
}

},{}],14:[function(require,module,exports){
module.exports = {
  getDownloads: 'promise',
  pause: 'promise',
  resume: 'promise',
  cancel: 'promise',
  remove: 'promise',
  open: 'promise',
  showInFolder: 'promise',
  createEventsStream: 'readable'
}

},{}],15:[function(require,module,exports){
module.exports = {
  addVisit: 'promise',
  getVisitHistory: 'promise',
  getMostVisited: 'promise',
  search: 'promise',
  removeVisit: 'promise',
  removeAllVisits: 'promise',
  removeVisitsAfter: 'promise'
}

},{}],16:[function(require,module,exports){
module.exports = {
  get: 'promise',
  set: 'promise',
  getPermissions: 'promise',
  getPermission: 'promise',
  getAppPermissions: 'promise',
  setPermission: 'promise',
  setAppPermissions: 'promise',
  clearPermission: 'promise',
  clearPermissionAllOrigins: 'promise'
}

},{}],17:[function(require,module,exports){
const webApis = require('./web-apis/fg')

exports.setup = function ({rpcAPI}) {
  webApis.setup({rpcAPI})
}

},{"./web-apis/fg":2}],18:[function(require,module,exports){
class ExtendableError extends Error {
  constructor(msg) {
    super(msg)
    this.name = this.constructor.name
    this.message = msg
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, this.constructor)
    } else {
      this.stack = (new Error(msg)).stack
    }
  }
}

exports.NotFoundError = class NotFoundError extends ExtendableError {
  constructor(msg) {
    super(msg || 'File not found')
    this.notFound = true
  }
}

exports.NotAFileError = class NotAFileError extends ExtendableError {
  constructor(msg) {
    super(msg || 'Target must be a file')
    this.notAFile = true
  }
}

exports.NotAFolderError = class NotAFolderError extends ExtendableError {
  constructor(msg) {
    super(msg || 'Target must be a folder')
    this.notAFolder = true
  }
}

exports.InvalidEncodingError = class InvalidEncodingError extends ExtendableError {
  constructor(msg) {
    super(msg || 'Invalid encoding')
    this.invalidEncoding = true
  }
}

exports.TimeoutError = class TimeoutError extends ExtendableError {
  constructor(msg) {
    super(msg || 'Timed out')
    this.timedOut = true
  }
}

exports.ArchiveNotWritableError = class ArchiveNotWritableError extends ExtendableError {
  constructor(msg) {
    super(msg || 'Cannot write to this archive ; Not the owner')
    this.archiveNotWritable = true
  }
}

exports.EntryAlreadyExistsError = class EntryAlreadyExistsError extends ExtendableError {
  constructor(msg) {
    super(msg || 'A file or folder already exists at this path')
    this.entryAlreadyExists = true
  }
}

exports.ParentFolderDoesntExistError = class ParentFolderDoesntExistError extends ExtendableError {
  constructor(msg) {
    super(msg || 'Cannot write to this location ; No parent folder exists')
    this.parentFolderDoesntExist = true
  }
}

exports.InvalidPathError = class InvalidPathError extends ExtendableError {
  constructor(msg) {
    super(msg || 'The given path is not valid')
    this.invalidPath = true
  }
}

exports.SourceNotFoundError = class SourceNotFoundError extends ExtendableError {
  constructor(msg) {
    super(msg || 'Cannot read a file or folder at the given source path')
    this.sourceNotFound = true
  }
}

exports.DestDirectoryNotEmpty = class DestDirectoryNotEmpty extends ExtendableError {
  constructor(msg) {
    super(msg || 'Destination path is not empty ; Aborting')
    this.destDirectoryNotEmpty = true
  }
}

exports.ProtocolSetupError = class ProtocolSetupError extends ExtendableError {
  constructor(msg) {
    super(msg || 'Error setting up the URL protocol')
    this.protocolSetupError = true
  }
}

exports.UserDeniedError = class UserDeniedError extends ExtendableError {
  constructor(msg) {
    super(msg || 'User denied permission')
    this.permissionDenied = true
  }
}
exports.PermissionsError = class PermissionsError extends ExtendableError {
  constructor(msg) {
    super(msg || 'Permissions denied')
    this.permissionDenied = true
  }
}
exports.QuotaExceededError = class QuotaExceededError extends ExtendableError {
  constructor(msg) {
    super(msg || 'Disk space quota exceeded')
    this.quotaExceeded = true
  }
}

exports.SourceTooLargeError = class SourceTooLargeError extends ExtendableError {
  constructor(msg) {
    super(msg || 'The source file is too large')
    this.sourceTooLarge = true
  }
}

exports.InvalidURLError = class InvalidURLError extends ExtendableError {
  constructor(msg) {
    super(msg || 'Invalid URL')
    this.invalidUrl = true
  }
}

exports.InvalidArchiveKeyError = class InvalidArchiveKeyError extends ExtendableError {
  constructor(msg) {
    super(msg || 'Invalid archive key')
    this.invalidArchiveKey = true
  }
}

exports.InvalidDomainName = class InvalidDomainName extends ExtendableError {
  constructor(msg) {
    super(msg || 'Invalid domain name')
    this.invalidDomainName = true
  }
}

exports.ProtectedFileNotWritableError = class ProtectedFileNotWritableError extends ExtendableError {
  constructor(msg) {
    super(msg || 'Protected file is not wrtable')
    this.protectedFileNotWritable = true
  }
}

exports.ModalActiveError = class ModalActiveError extends ExtendableError {
  constructor(msg) {
    super(msg || 'Modal already active')
    this.modalActive = true
  }
}

},{}],19:[function(require,module,exports){
var Stream = require("stream")
var writeMethods = ["write", "end", "destroy"]
var readMethods = ["resume", "pause"]
var readEvents = ["data", "close"]
var slice = Array.prototype.slice

module.exports = duplex

function forEach (arr, fn) {
    if (arr.forEach) {
        return arr.forEach(fn)
    }

    for (var i = 0; i < arr.length; i++) {
        fn(arr[i], i)
    }
}

function duplex(writer, reader) {
    var stream = new Stream()
    var ended = false

    forEach(writeMethods, proxyWriter)

    forEach(readMethods, proxyReader)

    forEach(readEvents, proxyStream)

    reader.on("end", handleEnd)

    writer.on("drain", function() {
      stream.emit("drain")
    })

    writer.on("error", reemit)
    reader.on("error", reemit)

    stream.writable = writer.writable
    stream.readable = reader.readable

    return stream

    function proxyWriter(methodName) {
        stream[methodName] = method

        function method() {
            return writer[methodName].apply(writer, arguments)
        }
    }

    function proxyReader(methodName) {
        stream[methodName] = method

        function method() {
            stream.emit(methodName)
            var func = reader[methodName]
            if (func) {
                return func.apply(reader, arguments)
            }
            reader.emit(methodName)
        }
    }

    function proxyStream(methodName) {
        reader.on(methodName, reemit)

        function reemit() {
            var args = slice.call(arguments)
            args.unshift(methodName)
            stream.emit.apply(stream, args)
        }
    }

    function handleEnd() {
        if (ended) {
            return
        }
        ended = true
        var args = slice.call(arguments)
        args.unshift("end")
        stream.emit.apply(stream, args)
    }

    function reemit(err) {
        stream.emit("error", err)
    }
}

},{"stream":undefined}],20:[function(require,module,exports){
const isNode = typeof window === 'undefined'
const parse = isNode ? require('url').parse : browserParse

const SCHEME_REGEX = /[a-z]+:\/\//i
//                   1          2      3        4
const VERSION_REGEX = /^(dat:\/\/)?([^/]+)(\+[^/]+)(.*)$/i

module.exports = function parseDatURL (str, parseQS) {
  // prepend the scheme if it's missing
  if (!SCHEME_REGEX.test(str)) {
    str = 'dat://' + str
  }

  var parsed, version = null, match = VERSION_REGEX.exec(str)
  if (match) {
    // run typical parse with version segment removed
    parsed = parse((match[1] || '') + (match[2] || '') + (match[4] || ''), parseQS)
    version = match[3].slice(1)
  } else {
    parsed = parse(str, parseQS)
  }
  if (isNode) parsed.href = str // overwrite href to include actual original
  parsed.version = version // add version segment
  return parsed
}

function browserParse (str) {
  return new URL(str)
}
},{"url":undefined}],21:[function(require,module,exports){
module.exports.exportAPI = require('./lib/export-api')
module.exports.importAPI = require('./lib/import-api')
},{"./lib/export-api":22,"./lib/import-api":23}],22:[function(require,module,exports){
(function (Buffer){
const EventEmitter = require('events')
const { Writable } = require('stream')
const { ipcMain } = require('electron')
const {valueToIPCValue, duplex} = require('./util')

module.exports = function (channelName, manifest, methods, globalPermissionCheck) {
  var api = new EventEmitter()
  var webcontentsStreams = {}

  // wire up handler
  ipcMain.on(channelName, async function (event, methodName, requestId, ...args) {
    // watch for a navigation event
    var hasNavigated = false
    function onDidNavigate () {
      hasNavigated = true
    }
    event.sender.on('did-navigate', onDidNavigate)

    // helper to send
    const send = function (msgName, err, value, keepListeningForDidNavigate=false) {
      if (event.sender.isDestroyed()) return // dont send response if destroyed
      if (!keepListeningForDidNavigate) event.sender.removeListener('did-navigate', onDidNavigate)
      if (hasNavigated) return // dont send response if the page changed
      event.sender.send(channelName, msgName, requestId, err, value)
    }

    // handle special methods
    if (methodName == 'stream-request-write') {
      event.returnValue = true
      return streamRequestWrite(event.sender.id, requestId, args)
    }
    if (methodName == 'stream-request-end') {
      event.returnValue = true
      return streamRequestEnd(event.sender.id, requestId, args)
    }
    if (methodName == 'stream-request-close') {
      event.returnValue = true
      return streamRequestClose(event.sender.id, requestId, args)
    }

    // look up the method called
    var type = manifest[methodName]
    var method = methods[methodName]
    if (!type || !method) {
      api.emit('error', new Error(`Method not found: "${methodName}"`), arguments)
      return
    }

    // global permission check
    if (globalPermissionCheck && !globalPermissionCheck(event, methodName, args)) {
      // repond according to method type
      if (type == 'async' || type == 'promise') {
        send('async-reply', 'Denied')
      } else {
        event.returnValue = { error: 'Denied' }
      }
      return
    }

    // run method by type
    if (type == 'sync') {
      // call sync
      try {
        event.returnValue = { success: valueToIPCValue(method.apply(event, args)) }
      } catch (e) {
        event.returnValue = { error: e.message }
      }
      return
    }
    if (type == 'async') {
      // create a reply cb
      const replyCb = (err, value) => {
        if (err) err = err.message || err
        send('async-reply', err, valueToIPCValue(value))
      }
      args.push(replyCb)

      // call async
      method.apply(event, args)
      return
    }
    if (type == 'promise') {
      // call promise
      let p
      try {
        p = method.apply(event, args)
        if (!p)
          p = Promise.resolve()
      } catch (e) {
        p = Promise.reject(errorObject(e))
      }

      // handle response
      p.then(
        value => send('async-reply', null, valueToIPCValue(value)),
        error => send('async-reply', errorObject(error))
      )
      return
    }

    var streamTypes = {
      readable: createReadableEvents,
      writable: createWritableEvents,
      duplex: createDuplexEvents
    }

    if (streamTypes[type]) {
      return await handleStream(event, method, requestId, args, streamTypes[type], send)
    }

    api.emit('error', new Error(`Invalid method type "${type}" for "${methodName}"`), arguments)
  })

  async function handleStream (event, method, requestId, args, createStreamEvents, send) {
    // call duplex
    let stream
    try {
      stream = method.apply(event, args)
      if (!stream) {
        event.returnValue = { success: false }
        return
      }
    } catch (e) {
      event.returnValue = { error: e.message }
      return
    }

    // handle promises
    if (stream && stream.then) {
      event.returnValue = { success: true }
      try {
        stream = await stream // wait for it
      } catch (e) {
        send('stream-error', '' + e)
        return
      }
    }

    trackWebcontentsStreams(event.sender, requestId, stream)
    var events = createStreamEvents(event, stream, requestId, send)
    hookUpEventsAndUnregister(stream, events)

    // done
    event.returnValue = { success: true }
    return
  }

  function hookUpEventsAndUnregister(stream, events) {
    Object.keys(events).forEach(key => stream.on(key, events[key]))
    stream.unregisterEvents = () => {
      Object.keys(events).forEach(key => stream.removeListener(key, events[key]))
    }
  }

  function createReadableEvents (event, stream, requestId, send) {
    return {
      data: chunk => send('stream-data', valueToIPCValue(chunk), undefined, true),
      readable: () => send('stream-readable', undefined, undefined, true),
      close: () => send('stream-close'),
      error: err => {
        stream.unregisterEvents()
        send('stream-error', (err) ? err.message : '')
      },
      end: () => {
        stream.unregisterEvents() // TODO does calling this in 'end' mean that 'close' will never be sent?
        send('stream-end')
        webcontentsStreams[event.sender.id][requestId] = null
      }
    }
  }

  function createWritableEvents (event, stream, requestId, send) {
    return {
      drain: () => send('stream-drain', undefined, undefined, true),
      close: () => send('stream-close'),
      error: err => {
        stream.unregisterEvents()
        send('stream-error', (err) ? err.message : '')
      },
      finish: () => {
        stream.unregisterEvents()
        send('stream-finish')
        webcontentsStreams[event.sender.id][requestId] = null
      }
    }
  }

  function createDuplexEvents (event, stream, requestId, send) {
    return Object.assign(
      createWritableEvents(event, stream, requestId, send),
      createReadableEvents(event, stream, requestId, send))
  }

  // special methods
  function trackWebcontentsStreams (webcontents, requestId, stream) {
    // track vs. sender's lifecycle
    if (!webcontentsStreams[webcontents.id]) {
      webcontentsStreams[webcontents.id] = {}
      // listen for webcontent close event
      webcontents.once('did-navigate', closeAllWebcontentsStreams(webcontents.id))
      webcontents.once('destroyed', closeAllWebcontentsStreams(webcontents.id))
    }
    webcontentsStreams[webcontents.id][requestId] = stream
  }

  function streamRequestWrite (webcontentsId, requestId, args) {
    var stream = webcontentsStreams[webcontentsId][requestId]

    if (stream && typeof stream.write == 'function') {
      // massage data
      if (stream._writableState && !stream._writableState.objectMode && !Buffer.isBuffer(args[0]))
        args[0] = ''+args[0]

      // write
      stream.write(...args)
    }
  }
  function streamRequestEnd (webcontentsId, requestId, args) {
    var stream = webcontentsStreams[webcontentsId][requestId]
    if (stream && typeof stream.end == 'function')
      stream.end(...args)
  }
  function streamRequestClose (webcontentsId, requestId, args) {
    var stream = webcontentsStreams[webcontentsId][requestId]
    if (!stream)
      return
    // try .close
    if (typeof stream.close == 'function')
      stream.close(...args)
    // hmm, try .destroy
    else if (typeof stream.destroy == 'function')
      stream.destroy(...args)
    // oye, last shot: end()
    else if (typeof stream.end == 'function')
      stream.end(...args)
  }

  // helpers
  function closeAllWebcontentsStreams (webcontentsId) {
    return e => {
      if (!webcontentsStreams[webcontentsId])
        return

      // close all of the open streams
      for (var requestId in webcontentsStreams[webcontentsId]) {
        if (webcontentsStreams[webcontentsId][requestId]) {
          webcontentsStreams[webcontentsId][requestId].unregisterEvents()
          streamRequestClose(webcontentsId, requestId, [])
        }
      }

      // stop tracking
      delete webcontentsStreams[webcontentsId]
    }
  }

  return api
}

function errorObject (err) {
  if (err.name || err.message) {
    return { name: err.name, message: err.message }
  }
  return err.toString()
}

}).call(this,{"isBuffer":require("../../../../node_modules/is-buffer/index.js")})
},{"../../../../node_modules/is-buffer/index.js":25,"./util":24,"electron":undefined,"events":undefined,"stream":undefined}],23:[function(require,module,exports){
const EventEmitter = require('events')
const { Readable, Writable } = require('stream')
const { ipcRenderer } = require('electron')
const {valueToIPCValue, IPCValueToValue, fixErrorStack, duplex} = require('./util')

module.exports = function (channelName, manifest, opts) {
  var api = new EventEmitter()
  var asyncCbs = [] // active asyncs' cbs, waiting for a response
  var asyncCbTimeouts = {} // timers for async call timeouts
  var streams = [] // active streams
  var streamErrorStacks = {}
  opts = opts || {}
  if (typeof opts.timeout == 'undefined')
    opts.timeout = 30e3

  // api method generators
  var createAPIMethod = {
    sync: methodName => {
      return (...args) => {
        args = args.map(valueToIPCValue)

        // send message
        var { success, error } = ipcRenderer.sendSync(channelName, methodName, 0, ...args)

        // handle response
        if (success)
          return IPCValueToValue(success)
        if (error)
          throw createError(error)
      }
    },
    async: methodName => {
      return (...args) => {
        args = args.map(valueToIPCValue)

        // track the cb
        var errorStack = (new Error()).stack
        var requestId = asyncCbs.length
        var cb = (typeof args[args.length - 1] == 'function') ? args.pop() : (()=>{})
        asyncCbs.push((err, value) => {
          if (err) cb(fixErrorStack(err, errorStack))
          else cb(undefined, value)
        })
        if (opts.timeout)
          asyncCbTimeouts[requestId] = setTimeout(onTimeout, opts.timeout, requestId)

        // send message
        ipcRenderer.send(channelName, methodName, requestId, ...args)
      }
    },
    promise: methodName => {
      return (...args) => {
        args = args.map(valueToIPCValue)

        // track the promise
        var errorStack = (new Error()).stack
        var requestId = asyncCbs.length
        var p = new Promise((resolve, reject) => {
          asyncCbs.push((err, value) => {
            if (err) reject(fixErrorStack(err, errorStack))
            else     resolve(value)
          })
        })
        if (opts.timeout)
          asyncCbTimeouts[requestId] = setTimeout(onTimeout, opts.timeout, requestId)

        // send message
        ipcRenderer.send(channelName, methodName, requestId, ...args)

        return p
      }
    },
    readable: handleStream(createReadable),
    writable: handleStream(createWritable),
    duplex: handleStream(createDuplex)
  }

  function createReadable (requestId) {
    // hook up the readable
    let r = new Readable({
      objectMode: true,
      read() {}
    })
    r.close = (...args) => ipcRenderer.sendSync(channelName, 'stream-request-close', requestId, ...args)
    return r
  }

  function createWritable (requestId) {
    let w = new Writable({
      objectMode: true,
      write (chunk, enc, next) {
        ipcRenderer.sendSync(channelName, 'stream-request-write', requestId, chunk, enc)
        next()
      }
    })
    w.end   = (...args) => ipcRenderer.sendSync(channelName, 'stream-request-end', requestId, ...args)
    w.close = (...args) => ipcRenderer.sendSync(channelName, 'stream-request-close', requestId, ...args)
    return w
  }

  function createDuplex (requestId) {
    // hook up the readable
    let r = new Readable({
      objectMode: true,
      read() {}
    })
    let w = new Writable({
      objectMode: true,
      write (chunk, enc, next) {
        ipcRenderer.sendSync(channelName, 'stream-request-write', requestId, chunk, enc)
        next()
      }
    })

    var stream = duplex(w, r)
    stream.end   = (...args) => ipcRenderer.sendSync(channelName, 'stream-request-end', requestId, ...args)
    stream.close = (...args) => ipcRenderer.sendSync(channelName, 'stream-request-close', requestId, ...args)
    return stream
  }

  function handleStream (createStream) {
    return methodName => {
      return (...args) => {
        args = args.map(valueToIPCValue)

        // send message
        var requestId = streams.length
        var { success, error } = ipcRenderer.sendSync(channelName, methodName, requestId, ...args)

        // handle response
        if (success) {
          let stream = createStream(requestId)
          streams.push(stream)
          streamErrorStacks[streams.length - 1] = (new Error()).stack
          return stream
        }
        if (error) {
          error = createError(error)
          error = fixErrorStack(error, error.stack, 3)
          throw error
        }
      }
    }
  }

  // create api
  for (let name in manifest) {
    let type = manifest[name]
    api[name] = createAPIMethod[type](name)
  }

  // wire up the message-handler
  ipcRenderer.on(channelName, function onIPCMessage (event, msgType, requestId, ...args) {
    // handle async replies
    if (msgType == 'async-reply')
      return onCbReply(requestId, args.map(IPCValueToValue))

    // handle stream messages
    if (msgType.startsWith('stream-')) {
      var stream = streams[requestId]
      if (!stream)
        return api.emit('error', new Error('Stream message came from main process for a nonexistant stream'), arguments)

      // Event: 'data'
      if (msgType == 'stream-data')
        return stream.push(IPCValueToValue(args[0]))

      // Event: 'readable'
      if (msgType == 'stream-readable')
        return stream.emit('readable')

      // Event: 'drain'
      if (msgType == 'stream-drain')
        return stream.emit('drain')

      // Event: 'close'
      if (msgType == 'stream-close')
        return stream.emit('close')

      // Event: 'end' or 'error'
      if (['stream-error', 'stream-end', 'stream-finish'].includes(msgType)) {
        // emit
        if (msgType == 'stream-error')
          stream.emit('error', fixErrorStack(createError(args[0]), streamErrorStacks[requestId]))
        if (msgType == 'stream-end')
          stream.emit('end')
        if (msgType == 'stream-finish')
          stream.emit('finish')

        // stop tracking the stream
        streams[requestId] = null
        streamErrorStacks[requestId] = null
        for (let eventName of stream.eventNames())
          stream.removeAllListeners(eventName)

        return
      }
    }

    // TODO: writable

    api.emit('error', new Error('Unknown message type'), arguments)
  })

  function onCbReply (requestId, args) {
    // find the cb
    var cb = asyncCbs[requestId]
    if (!cb) {
      return // caused by a timeout, or sent right before a page navigation, ignore
    }

    // stop tracking the cb
    asyncCbs[requestId] = null
    if (asyncCbTimeouts[requestId])
      clearTimeout(asyncCbTimeouts[requestId])

    // turn the error into an Error object
    if (args[0]) {
      args[0] = createError(args[0])
    }

    // call and done
    cb(...args)
    return
  }

  function onTimeout (requestId) {
    onCbReply(requestId, ['Timed out'])
  }

  function createError (error) {
    if (opts.errors) {
      var name = error.name || error
      if (typeof name === 'string' && name in opts.errors) {
        var ErrCons = opts.errors[name]
        return new ErrCons(error.message || error)
      }
    }
    return new Error(error.message || error)
  }

  return api
}

},{"./util":24,"electron":undefined,"events":undefined,"stream":undefined}],24:[function(require,module,exports){
(function (Buffer){
const duplexer = require('duplexer')

module.exports.valueToIPCValue = function (v) {
  if (v && (ArrayBuffer.isView(v) || v instanceof ArrayBuffer)) {
    return Buffer.from(v)
  }
  return v
}

module.exports.IPCValueToValue = function (v) {
  if (v && v instanceof Uint8Array && v.buffer) {
    return v.buffer
  }
  return v
}

exports.fixErrorStack = function (err, errorStack, numToDrop=2) {
  if (err) {
    err.stack = takeFirstLines(err.stack, 1) + '\n' + dropFirstLines(errorStack, numToDrop)
    return err
  }
}

function takeFirstLines (str, n) {
  return str.split('\n').slice(0, n).join('\n')
}

function dropFirstLines (str, n) {
  return str.split('\n').slice(n).join('\n')
}

// patch duplex methods in
module.exports.duplex = function (w, r) {
  var stream = duplexer(w, r)
  stream.push = function (chunk, encoding) {
    return r.push(chunk, encoding)
  }

  w.on("finish", function() {
    stream.emit("finish")
  })

  w.destroy = w.destroy || (() => {})
  stream._writableState = w._writableState
  return stream
}

}).call(this,require("buffer").Buffer)
},{"buffer":undefined,"duplexer":19}],25:[function(require,module,exports){
/*!
 * Determine if an object is a Buffer
 *
 * @author   Feross Aboukhadijeh <https://feross.org>
 * @license  MIT
 */

// The _isBuffer check is for Safari 5-7 support, because it's missing
// Object.prototype.constructor. Remove this eventually
module.exports = function (obj) {
  return obj != null && (isBuffer(obj) || isSlowBuffer(obj) || !!obj._isBuffer)
}

function isBuffer (obj) {
  return !!obj.constructor && typeof obj.constructor.isBuffer === 'function' && obj.constructor.isBuffer(obj)
}

// For Node v0.10 support. Remove this eventually.
function isSlowBuffer (obj) {
  return typeof obj.readFloatLE === 'function' && typeof obj.slice === 'function' && isBuffer(obj.slice(0, 0))
}

},{}]},{},[1]);
