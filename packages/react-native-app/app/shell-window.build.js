(function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
'use strict';

function _interopDefault (ex) { return (ex && (typeof ex === 'object') && 'default' in ex) ? ex['default'] : ex; }

var rpcAPI = require('pauls-electron-rpc');
var electron = require('electron');
var yo = require('yo-yo');
var yo__default = yo['default'];
var debounce = _interopDefault(require('lodash.debounce'));
var EventEmitter = require('events');
var EventEmitter__default = _interopDefault(EventEmitter);
var path = _interopDefault(require('path'));
var fs = _interopDefault(require('fs'));
var throttle = _interopDefault(require('lodash.throttle'));
var parseDatURL = _interopDefault(require('parse-dat-url'));
var errorPage = _interopDefault(require('@beaker/core/lib/error-page'));
var prettyHash = _interopDefault(require('pretty-hash'));
var os = _interopDefault(require('os'));
var moment = _interopDefault(require('moment'));
var bytes = _interopDefault(require('bytes'));
var _get = _interopDefault(require('lodash.get'));
var paulsWordBoundary = require('pauls-word-boundary');

/* globals beaker */

class UpdatesNavbarBtn {
  constructor () {
    this.isUpdateAvailable = false;
    this.isDropdownOpen = false;

    var browserEvents = beaker.browser.createEventsStream();
    browserEvents.addEventListener('updater-state-changed', this.onUpdaterStateChange.bind(this));
  }

  render () {
    // render nothing if no update is availabe
    if (!this.isUpdateAvailable) { return yo`<div class="toolbar-updates"></div>` }

    // render the dropdown if open
    var dropdownEl = '';
    if (this.isDropdownOpen) {
      dropdownEl = yo`
        <div class="toolbar-dropdown toolbar-updates-dropdown">
          <div class="toolbar-updates-dropdown-inner dropdown-items">
            A new version of Beaker is ready to install.
            <a href="#" onclick=${this.onClickRestart.bind(this)}>Restart now.</a>
          </div>
        </div>`;
    }

    // render btn
    return yo`<div class="toolbar-updates">
      <button class="toolbar-btn toolbar-updates-btn ${this.isDropdownOpen ? 'pressed' : ''}" onclick=${e => this.onClickUpdates(e)} title="Update available">
        <span class="icon icon-up-circled"></span>
      </button>
      ${dropdownEl}
    </div>`
  }

  updateActives () {
    Array.from(document.querySelectorAll('.toolbar-updates')).forEach(el => yo.update(el, this.render()));
  }

  onClickUpdates (e) {
    this.isDropdownOpen = !this.isDropdownOpen;
    this.updateActives();
  }

  onUpdaterStateChange (e) {
    this.isUpdateAvailable = (e && e.state === 'downloaded');
    this.updateActives();
  }

  onClickRestart (e) {
    e.preventDefault();
    beaker.browser.restartBrowser();
  }
}

/* globals Event */



function findParent (node, test) {
  if (typeof test === 'string') {
    // classname default
    var cls = test;
    test = el => el.classList && el.classList.contains(cls);
  }

  while (node) {
    if (test(node)) {
      return node
    }
    node = node.parentNode;
  }
}

function writeToClipboard (str) {
  var textarea = yo`<textarea>${str}</textarea>`;
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  document.body.removeChild(textarea);
}

/* globals beaker DatArchive */

// there can be many drop menu btns rendered at once, but they are all showing the same information
// the BrowserMenuNavbarBtn manages all instances, and you should only create one

class BrowserMenuNavbarBtn {
  constructor () {
    const isDarwin = os.platform() === 'darwin';
    const cmdOrCtrlChar = isDarwin ? '⌘' : '^';
    this.accelerators = {
      newWindow: cmdOrCtrlChar + 'N',
      newTab: cmdOrCtrlChar + 'T',
      findInPage: cmdOrCtrlChar + 'F',
      history: cmdOrCtrlChar + (isDarwin ? 'Y' : 'H'),
      openFile: cmdOrCtrlChar + 'O'
    };

    this.submenu;
    this.downloads = [];
    this.sumProgress = null; // null means no active downloads
    this.isDropdownOpen = false;
    this.shouldPersistDownloadsIndicator = false;

    // fetch current downloads
    beaker.downloads.getDownloads().then(ds => {
      this.downloads = ds;
      this.updateActives();
    });

    beaker.browser.getInfo().then(info => {
      this.browserInfo = info;
      this.updateActives();
    });

    // wire up events
    var dlEvents = beaker.downloads.createEventsStream();
    dlEvents.addEventListener('new-download', this.onNewDownload.bind(this));
    dlEvents.addEventListener('sum-progress', this.onSumProgress.bind(this));
    dlEvents.addEventListener('updated', this.onUpdate.bind(this));
    dlEvents.addEventListener('done', this.onDone.bind(this));
    window.addEventListener('mousedown', this.onClickAnywhere.bind(this), true);
  }

  render () {
    // show active, then inactive, with a limit of 5 items
    var progressingDownloads = this.downloads.filter(d => d.state == 'progressing').reverse();

    // render the progress bar if downloading anything
    var progressEl = '';
    if (progressingDownloads.length > 0 && this.sumProgress && this.sumProgress.receivedBytes <= this.sumProgress.totalBytes) {
      progressEl = yo`<progress value=${this.sumProgress.receivedBytes} max=${this.sumProgress.totalBytes}></progress>`;
    }

    // auto-updater
    var autoUpdaterEl = '';
    if (this.browserInfo && this.browserInfo.updater.isBrowserUpdatesSupported && this.browserInfo.updater.state === 'downloaded') {
      autoUpdaterEl = yo`
        <div class="section auto-updater">
          <div class="menu-item auto-updater" onclick=${e => this.onClickRestart()}>
            <i class="fa fa-arrow-circle-up"></i>
            <span class="label">Restart to update Beaker</span>
          </div>
        </div>
      `;
    }

    // render the dropdown if open
    var dropdownEl = '';
    if (this.isDropdownOpen && this.submenu === 'create-new') {
      dropdownEl = yo`
        <div class="toolbar-dropdown dropdown toolbar-dropdown-menu-dropdown">
          <div class="dropdown-items submenu with-triangle">
            <div class="header">
              <button class="btn transparent" onclick=${e => this.onShowSubmenu('')} title="Go back">
                <i class="fa fa-angle-left"></i>
              </button>
              <h2>Create New</h2>
            </div>

            <div class="section">
              <div class="menu-item" onclick=${e => this.onCreateSite(e)}>
                <i class="fa fa-clone"></i>
                <span class="label">Empty project</span>
              </div>

              <div class="menu-item" onclick=${e => this.onCreateSite(e, 'website')}>
                <i class="fa fa-sitemap"></i>
                <span class="label">Website</span>
              </div>

              <div class="menu-item" onclick=${e => this.onCreateSiteFromFolder(e)}>
                <i class="fa fa-folder-o"></i>
                <span class="label">From folder</span>
              </div>
            </div>
          </div>
        </div>`;

    } else if (this.isDropdownOpen) {
      dropdownEl = yo`
        <div class="toolbar-dropdown dropdown toolbar-dropdown-menu-dropdown">
          <div class="dropdown-items with-triangle">
            ${autoUpdaterEl}

            <div class="section">
              <div class="menu-item" onclick=${e => this.onOpenNewWindow()}>
                <i class="fa fa-window-maximize"></i>
                <span class="label">New Window</span>
                <span class="shortcut">${this.accelerators.newWindow}</span>
              </div>

              <div class="menu-item" onclick=${e => this.onOpenNewTab()}>

                <i class="fa fa-file-o"></i>
                <span class="label">New Tab</span>
                <span class="shortcut">${this.accelerators.newTab}</span>
              </div>
            </div>

            <div class="section">
              <div class="menu-item" onclick=${e => this.onFindInPage(e)}>
                <i class="fa fa-search"></i>
                <span class="label">Find in Page</span>
                <span class="shortcut">${this.accelerators.findInPage}</span>
              </div>
            </div>

            <div class="section">
              <div class="menu-item" onclick=${e => this.onOpenPage(e, 'beaker://library')}>
                <i class="fa fa-book"></i>
                <span class="label">Library</span>
              </div>

              <div class="menu-item" onclick=${e => this.onOpenPage(e, 'beaker://bookmarks')}>
                <i class="fa fa-star-o"></i>
                <span class="label">Bookmarks</span>
              </div>

              <div class="menu-item" onclick=${e => this.onOpenPage(e, 'beaker://history')}>
                <i class="fa fa-history"></i>
                <span class="label">History</span>
                <span class="shortcut">${this.accelerators.history}</span>
              </div>

              <div class="menu-item downloads" style=${progressEl ? 'height: 41px' : ''} onclick=${e => this.onClickDownloads(e)}>
                <i class="fa fa-download"></i>
                <span class="label">Downloads</span>
                ${this.shouldPersistDownloadsIndicator ? yo`<i class="fa fa-circle"></i>` : ''}
                ${progressEl}
              </div>
            </div>

            <div class="section">
              <div class="menu-item" onclick=${e => this.onShowSubmenu('create-new')}>
                <i class="fa fa-plus-square-o"></i>
                <span class="label">Create New</span>
                <i class="more fa fa-angle-right"></i>
              </div>

              <div class="menu-item" onclick=${e => this.onShareFiles(e)}>
                <i class="fa fa-upload"></i>
                <span class="label">Share Files</span>
              </div>
            </div>

            <div class="section">
              <div class="menu-item" onclick=${e => this.onOpenPage(e, 'beaker://settings')}>
                <i class="fa fa-gear"></i>
                <span class="label">Settings</span>
              </div>
            </div>

            <div class="section">
              <div class="menu-item" onclick=${e => this.onOpenFile()}>
                <i></i>
                <span class="label">Open File...</span>
                <span class="shortcut">${this.accelerators.openFile}</span>
              </div>
            </div>

            <div class="section">
              <div class="menu-item" onclick=${e => this.onOpenPage(e, 'dat://beakerbrowser.com/docs/')}>
                <i class="fa fa-question-circle-o"></i>
                <span class="label">Help</span>
              </div>

              <div class="menu-item" onclick=${e => this.onOpenPage(e, 'https://github.com/beakerbrowser/beaker/issues/new?labels=0.8-beta-feedback&template=ISSUE_TEMPLATE_0.8_BETA.md')}>
                <i class="fa fa-flag-o"></i>
                <span class="label">Report an Issue</span>
              </div>

              <div class="menu-item" onclick=${e => this.onOpenPage(e, 'https://opencollective.com/beaker')}>
                <i class="fa fa-heart-o"></i>
                <span class="label">Support Beaker</span>
              </div>
            </div>
          </div>
        </div>`;
    }

    // render btn
    return yo`
      <div class="toolbar-dropdown-menu browser-dropdown-menu">
        <button class="toolbar-btn toolbar-dropdown-menu-btn ${this.isDropdownOpen ? 'pressed' : ''}" onclick=${e => this.onClickBtn(e)} title="Menu">
          <span class="fa fa-bars"></span>
        </button>
        ${dropdownEl}
      </div>`
  }

  updateActives () {
    Array.from(document.querySelectorAll('.browser-dropdown-menu')).forEach(el => yo.update(el, this.render()));
  }

  doAnimation () {
    Array.from(document.querySelectorAll('.browser-dropdown-menu .toolbar-btn')).forEach(el =>
      el.animate([
        {transform: 'scale(1.0)', color: 'inherit'},
        {transform: 'scale(1.5)', color: '#06c'},
        {transform: 'scale(1.0)', color: 'inherit'}
      ], { duration: 300 })
    );
  }

  onShowSubmenu(submenu) {
    this.submenu = submenu;
    this.updateActives();
  }

  onOpenNewWindow () {
    electron.ipcRenderer.send('new-window');
  }

  onOpenNewTab () {
    setActive(create$$1('beaker://start'));
  }

  async onOpenFile () {
    var files = await beaker.browser.showOpenDialog({
       title: 'Open file...',
       properties: ['openFile', 'createDirectory']
    });
    if (files && files[0]) {
      setActive(create$$1('file://' + files[0]));
    }
  }

  onClickBtn (e) {
    this.isDropdownOpen = !this.isDropdownOpen;
    this.submenu = '';
    this.updateActives();
  }

  onClickAnywhere (e) {
    var parent = findParent(e.target, 'browser-dropdown-menu');
    if (parent) return // abort - this was a click on us!
    if (this.isDropdownOpen) {
      this.isDropdownOpen = false;
      this.submenu = '';
      this.updateActives();
    }
  }

  onClickDownloads (e) {
    this.shouldPersistDownloadsIndicator = false;
    this.onOpenPage(e, 'beaker://downloads');
  }

  onNewDownload () {
    this.doAnimation();

    // open the dropdown
    this.isDropdownOpen = true;
    this.updateActives();
  }

  onSumProgress (sumProgress) {
    this.sumProgress = sumProgress;
    this.updateActives();
  }

  onUpdate (download) {
    // patch data each time we get an update
    var target = this.downloads.find(d => d.id == download.id);
    if (target) {
      // patch item
      for (var k in download) { target[k] = download[k]; }
    } else { this.downloads.push(download); }
    this.updateActives();
  }

  onDone (download) {
    this.shouldPersistDownloadsIndicator = true;
    this.doAnimation();
    this.onUpdate(download);
  }

  onFindInPage (e) {
    e.preventDefault();
    e.stopPropagation();

    // close dropdown
    this.isDropdownOpen = false;

    showInpageFind(getActive());
  }

  onClearDownloads (e) {
    e.preventDefault();
    e.stopPropagation();
    this.downloads = [];
    this.updateActives();
  }

  async onCreateSite (e, template) {
    // close dropdown
    this.isDropdownOpen = false;
    this.submenu = '';
    this.updateActives();

    // create a new archive
    const archive = await DatArchive.create({template, prompt: false});
    setActive(create$$1('beaker://library/' + archive.url + '#setup'));
  }

  async onCreateSiteFromFolder (e) {
    // close dropdown
    this.isDropdownOpen = false;
    this.submenu = '';
    this.updateActives();

    // ask user for folder
    const folder = await beaker.browser.showOpenDialog({
      title: 'Select folder',
      buttonLabel: 'Use folder',
      properties: ['openDirectory']
    });
    if (!folder || !folder.length) return

    // create a new archive
    const archive = await DatArchive.create({prompt: false});
    await beaker.archives.setLocalSyncPath(archive.url, folder[0], {syncFolderToArchive: true});
    setActive(create$$1('beaker://library/' + archive.url + '#setup'));
  }

  async onShareFiles (e) {
    // close dropdown
    this.isDropdownOpen = false;
    this.updateActives();

    // ask user for files
    const browserInfo = await beaker.browser.getInfo();
    const filesOnly = browserInfo.platform === 'linux';
    const files = await beaker.browser.showOpenDialog({
      title: 'Select files to share',
      buttonLabel: 'Share files',
      properties: ['openFile', filesOnly ? false : 'openDirectory', 'multiSelections'].filter(Boolean)
    });
    if (!files || !files.length) return

    // create the dat and import the files
    const archive = await DatArchive.create({
      title: `Shared files (${moment().format("M/DD/YYYY h:mm:ssa")})`,
      description: `Files shared with Beaker`,
      prompt: false
    });
    await Promise.all(files.map(src => DatArchive.importFromFilesystem({src, dst: archive.url, inplaceImport: false})));

    // open the new archive in the library
    setActive(create$$1('beaker://library/' + archive.url.slice('dat://'.length) + '#setup'));
  }

  onOpenPage (e, url) {
    setActive(create$$1(url));
    this.isDropdownOpen = false;
    this.updateActives();
  }

  onClickRestart () {
    beaker.browser.restartBrowser();
  }
}

/* globals window */

const URL$1 = typeof window === 'undefined' ? require('url').URL : window.URL;

function getPermId (permissionToken) {
  return permissionToken.split(':')[0]
}

function getPermParam (permissionToken) {
  return permissionToken.split(':').slice(1).join(':')
}

function ucfirst (str) {
  return str.charAt(0).toUpperCase() + str.slice(1)
}

function pluralize (num, base, suffix = 's') {
  if (num === 1) { return base }
  return base + suffix
}

function shorten (str, n = 6) {
  if (str.length > (n + 3)) {
    return str.slice(0, n) + '...'
  }
  return str
}

function shortenHash (str, n = 6) {
  if (str.startsWith('dat://')) {
    return 'dat://' + shortenHash(str.slice('dat://'.length).replace(/\/$/, '')) + '/'
  }
  if (str.length > (n + 5)) {
    return str.slice(0, n) + '..' + str.slice(-2)
  }
  return str
}

// constants
// =

// how much time to wait between throttle emits
const EMIT_CHANGED_WAIT = 30;

class ArchiveProgressMonitor extends EventEmitter.EventEmitter {
  constructor (archive) {
    super();
    this.archive = archive;
    this.downloaded = 0;
    this.blocks = 0;
    this.onDownload = this.onDownload.bind(this);

    // create a throttled 'change' emiter
    this.emitChanged = throttle(() => this.emit('changed'), EMIT_CHANGED_WAIT);
  }

  async fetchAllStats () {
    // list all files
    var entries = await this.archive.readdir('/', {recursive: true, stat: true});

    // count blocks
    this.downloaded = 0;
    this.blocks = 0;
    entries.forEach(entry => {
      this.downloaded += entry.stat.downloaded;
      this.blocks += entry.stat.blocks;
    });
  }

  startListening () {
    // start watching network activity
    this.archive.addEventListener('download', this.onDownload);
    this.interval = setInterval(() => this.fetchAllStats(), 10e3); // refetch stats every 10s
    return this.fetchAllStats()
  }

  stopListening () {
    clearInterval(this.interval);
    this.archive.removeEventListener('download', this.onDownload);
  }

  get current () {
    return Math.min(Math.round(this.downloaded / this.blocks * 100), 100)
  }

  get isComplete () {
    return this.downloaded >= this.blocks
  }

  onDownload (e) {
    // we dont need perfect precision --
    // rather than check if the block is one of ours, assume it is
    // we'll refetch the full stats every 10s to correct inaccuracies
    // (and we shouldnt be downloading historic data anyway)
    this.downloaded++;

    // is this a block in one of our files?
    // for (var k in this.allfiles) {
    //   let file = this.allfiles[k]
    //   let block = e.block - file.content.blockOffset
    //   if (block >= 0 && block < file.blocks) {
    //     file.downloaded++
    //     this.downloaded++
    //   }
    // }
    this.emitChanged();
  }
}

// from https://www.smashingmagazine.com/2015/07/designing-simple-pie-charts-with-css/
// thanks Lea Verou!

function progressPie (p, {color1, color2, size} = {}) {
  // default params
  color1 = color1 || '#655';
  color2 = color2 || 'yellowgreen';
  size = size || '15px';

  // create pie svg
  var NS = 'http://www.w3.org/2000/svg';
  var svg = document.createElementNS(NS, 'svg');
  var circle = document.createElementNS(NS, 'circle');
  var title = document.createElementNS(NS, 'title');
  circle.setAttribute('r', 16);
  circle.setAttribute('cx', 16);
  circle.setAttribute('cy', 16);
  circle.setAttribute('stroke-dasharray', p + ' 100');
  circle.style.fill = color1;
  circle.style.stroke = color2;
  circle.style.strokeWidth = 32;
  svg.setAttribute('viewBox', '0 0 32 32');
  svg.style.width = size;
  svg.style.height = size;
  svg.style.background = color1;
  svg.style.transform = 'rotate(-90deg)';
  svg.style.borderRadius = '50%';
  title.textContent = p + '%';
  svg.appendChild(title);
  svg.appendChild(circle);
  return svg
}

/* globals beaker DatArchive */

const NOT = 0;
const ONEDAY = 1;
const ONEWEEK = 2;
const ONEMONTH = 3;
const FOREVER = 4;
const TIMELENS = [
  () => yo`<span>While visiting</span>`,
  () => yo`<span>1 day</span>`,
  () => yo`<span>1 week</span>`,
  () => yo`<span>1 month</span>`,
  () => yo`<span>Forever</span>`
];

class DatsiteMenuNavbarBtn {
  constructor () {
    this.isDropdownOpen = false;
    this.sliderState = undefined;
    this.progressMonitor = null;
    window.addEventListener('mousedown', this.onClickAnywhere.bind(this), true);
  }

  render () {
    const page = getActive();
    const isViewingDat = page && !!page.getViewedDatOrigin();
    if (!isViewingDat || !page.siteInfo) {
      return ''
    }

    var dropdownEl = '';
    if (this.isDropdownOpen) {
      dropdownEl = this.renderRehostDropdown(page);
    }

    // render btn
    return yo`
      <div class="rehost-navbar-menu">
        <button class="nav-peers-btn" onclick=${e => this.onClickDropdownBtn(e)}>
          <i class="fa fa-share-alt"></i>
          ${page.siteInfo.peers || 0}
        </button>
        ${dropdownEl}
      </div>
    `
  }

  renderRehostDropdown (page) {
    // calculate the current state
    const isSaved = page.siteInfo.userSettings.isSaved;
    const expiresAt = page.siteInfo.userSettings.expiresAt;
    const now = Date.now();
    const timeRemaining = (isSaved && expiresAt && expiresAt > now) ? moment.duration(expiresAt - now) : null;
    var currentSetting;
    if (!isSaved) currentSetting = NOT;
    else if (!expiresAt) currentSetting = FOREVER;
    else if (timeRemaining.asMonths() > 0.5) currentSetting = ONEMONTH;
    else if (timeRemaining.asWeeks() > 0.5) currentSetting = ONEWEEK;
    else currentSetting = ONEDAY;

    // configure rendering params
    const sliderState = typeof this.sliderState === 'undefined'
      ? currentSetting
      : this.sliderState;
    const statusClass =
      (sliderState == NOT ?
        'red' :
        (sliderState == FOREVER ?
          'green' :
          'yellow'));
    const statusLabel = timeRemaining && typeof this.sliderState === 'undefined'
      ? yo`<span>Seeding (${timeRemaining.humanize()} remaining)</span>`
      : TIMELENS[sliderState]();
    const size = (page && page.siteInfo && page.siteInfo.size) ? bytes(page.siteInfo.size, 'mb') : '';

    // render the dropdown if open
    return yo`
      <div class="dropdown datsite-menu-dropdown rehost-menu-dropdown">
        <div class="dropdown-items datsite-menu-dropdown-items rehost-menu-dropdown-items with-triangle">
          <div class="header">
            <div class="header-info">
              <img class="favicon" src="beaker-favicon: ${page.getURL()}"/>
              <h1 class="page-title">
                ${page.siteInfo.title && page.siteInfo.title.length
                  ? page.siteInfo.title
                  : yo`<em>Untitled</em>`
                }
              </h1>
            </div>

            <div class="peer-count">
              ${page.siteInfo.peers || '0'} ${pluralize(page.siteInfo.peers, 'peer')} seeding these files
            </div>
          </div>

          ${!page.siteInfo.isOwner ? yo`
            <div class="rehosting-controls">
              <div>
                <label for="rehost-period">Seed these files</label>
                <input
                  name="rehost-period"
                  type="range"
                  min="0"
                  max="4"
                  step="1"
                  list="steplist"
                  value=${sliderState}
                  onchange=${e => this.onChangeTimelen(e)}
                  oninput=${e => this.onChangeTimelen(e)} />
                <datalist id="steplist">
                    <option>0</option>
                    <option>1</option>
                    <option>2</option>
                    <option>3</option>
                    <option>4</option>
                </datalist>
              </div>

              <div class="labels">
                <div class="policy">
                  <i class=${'fa fa-circle ' + statusClass}></i>
                  ${statusLabel}
                </div>
                <div class="size">
                  ${size}
                  ${this.progressMonitor.current < 100
                    ? progressPie(this.progressMonitor.current, {size: '10px', color1: '#ccc', color2: '#3579ff'})
                    : ''}
                </div>
              </div>
            </div>
          </div>` : ''}

          <div class="network-url">
            <a onclick=${e => this.onOpenPage('beaker://settings#dat-network-activity')}>
              <i class="fa fa-gear"></i>
              Manage all network activity
            </a>
          </div>
        </div>
      `
  }

  updateActives () {
    Array.from(document.querySelectorAll('.rehost-navbar-menu')).forEach(el => {
      var newEl = this.render();
      if (newEl) yo.update(el, newEl);
    });
  }

  close () {
    if (this.isDropdownOpen) {
      this.isDropdownOpen = false;
      this.progressMonitor.stopListening();
      this.progressMonitor = null;
      this.updateActives();
    }
  }

  onClickAnywhere (e) {
    var parent = findParent(e.target, 'rehost-navbar-menu');
    if (parent) return // abort - this was a click on us!
    this.close();
  }

  async onClickDropdownBtn () {
    // toggle the dropdown
    if (this.isDropdownOpen) {
      this.close();
    } else {
      // create progress monitor
      const page = getActive();
      if (!page || !page.siteInfo) {
        return
      }
      this.progressMonitor = new ArchiveProgressMonitor(new DatArchive(page.siteInfo.key));
      this.progressMonitor.on('changed', this.updateActives.bind(this));

      // render dropdown
      this.sliderState = undefined;
      this.isDropdownOpen = true;
      this.updateActives();

      // load progress and render again
      await this.progressMonitor.startListening();
      this.updateActives();
    }
  }

  async onChangeTimelen (e) {
    const page = getActive();
    if (!page || !page.siteInfo) {
      return
    }

    // update the archive settings
    this.sliderState = e.target.value;
    const isSaved = this.sliderState == NOT ? false : true;
    var expiresAt = 0;
    if (this.sliderState == ONEDAY) expiresAt = +(moment().add(1, 'day'));
    if (this.sliderState == ONEWEEK) expiresAt = +(moment().add(1, 'week'));
    if (this.sliderState == ONEMONTH) expiresAt = +(moment().add(1, 'month'));
    if (isSaved) await beaker.archives.add(page.siteInfo.key, {expiresAt});
    else await beaker.archives.remove(page.siteInfo.key);
    page.siteInfo = await (new DatArchive(page.siteInfo.key)).getInfo();

    this.updateActives();
  }

  onOpenPage (href) {
    this.isDropdownOpen = false;
    setActive(create$$1(href));
  }
}

function render$1 (message) {
  return yo__default`<div class="toast">${message}</div>`
}

function create$1 (message, howLong=2500) {
  // remove any existing toast
  Array.from(document.querySelectorAll('#toasts .toast'), el => {
    el.parentNode.removeChild(el);
  });  

  // render toast
  document.getElementById('toasts').appendChild(render$1(message));
  setTimeout(destroy, howLong);
}

function destroy () {
  try {
    var toast = document.querySelector('#toasts .toast');

    // fadeout before removing element
    toast.classList.add('invisible');
    setTimeout(() => document.getElementById('toasts').removeChild(toast), 500);
  } catch (e) {
    // ignore
  }
}

/* globals beaker DatArchive */

class SyncfolderMenuNavbarBtn {
  constructor () {
    this.isDropdownOpen = false;
    window.addEventListener('mousedown', this.onClickAnywhere.bind(this), true);
  }

  render () {
    const page = getActive();
    const isViewingDat = page && !!page.getIntendedURL().startsWith('dat:');
    var localSyncPath = _get(page, 'siteInfo.userSettings.localSyncPath');
    if (!isViewingDat || !localSyncPath) {
      return ''
    }

    var dropdownEl = '';
    if (this.isDropdownOpen) {
      dropdownEl = this.renderDropdown(page);
    }

    // truncate long sync paths
    if (localSyncPath.length > 40) {
      localSyncPath = localSyncPath.slice(0, 17) + '...' + localSyncPath.slice(-20);
    }

    // render btn
    return yo`
      <div class="toolbar-dropdown-menu syncfolder-dropdown-menu">
        <button class="btn nofocus ${this.isDropdownOpen ? 'pressed' : ''}" onclick=${e => this.onClickBtn(e)} title="Menu">
          <span>
            ${localSyncPath}
          </span>

          <span class="fa fa-caret-down"></span>
        </button>
        ${dropdownEl}
      </div>
    `
  }

  renderDropdown (page) {
    // render the dropdown
    return yo`
      <div class="toolbar-dropdown dropdown toolbar-dropdown-menu-dropdown">
        <div class="dropdown-items compact with-triangle">
          <div class="dropdown-item" onclick=${() => this.onClickOpenFolder()}>
            <i class="fa fa-folder-open-o"></i>
            Open folder
          </div>
          <div class="dropdown-item" onclick=${() => this.onClickCopyPath()}>
            <i class="fa fa-clipboard"></i>
            Copy path
          </div>
          <hr />
          <div class="dropdown-item" onclick=${() => this.onClickConfigure()}>
            <i class="fa fa-wrench"></i>
            Configure
          </div>
        </div>
      </div>`
  }

  updateActives () {
    Array.from(document.querySelectorAll('.syncfolder-dropdown-menu')).forEach(el => {
      var newEl = this.render();
      if (newEl) yo.update(el, newEl);
    });
  }

  onClickBtn (e) {
    this.isDropdownOpen = !this.isDropdownOpen;
    this.updateActives();
  }

  close () {
    if (this.isDropdownOpen) {
      this.isDropdownOpen = false;
      this.updateActives();
    }
  }

  onClickAnywhere (e) {
    var parent = findParent(e.target, 'syncfolder-dropdown-menu');
    if (parent) return // abort - this was a click on us!
    this.close();
  }

  onClickOpenFolder () {
    this.close();
    const page = getActive();
    const localSyncPath = _get(page, 'siteInfo.userSettings.localSyncPath');
    if (!localSyncPath) return
    beaker.browser.openFolder(localSyncPath);
  }

  onClickCopyPath () {
    this.close();
    const page = getActive();
    const localSyncPath = _get(page, 'siteInfo.userSettings.localSyncPath');
    if (!localSyncPath) return
    writeToClipboard(localSyncPath);
    create$1('Copied to clipboard', 1e3);
  }

  onClickConfigure () {
    this.close();
    const page = getActive();
    if (!page || !page.getViewedDatOrigin()) return
    setActive(create$$1(`beaker://library/dat://${page.siteInfo.key}#settings`));
  }
}

/* globals beaker DatArchive */

class DonateMenuNavbarBtn {
  constructor () {
    this.isDropdownOpen = false;
    window.addEventListener('mousedown', this.onClickAnywhere.bind(this), true);
  }

  render () {
    const page = getActive();
    if (!page.siteInfo || !page.siteInfo.links.payment) {
      return ''
    }

    var dropdownEl = '';
    if (this.isDropdownOpen) {
      dropdownEl = this.renderDropdown(page);
    }

    // render btn
    return yo`
      <div class="donate-navbar-menu">
        <button class="nav-donate-btn" title="Donate to this site" onclick=${e => this.onClickBtn(e)}>
          <i class="fa fa-heart-o"></i>
        </button>
        ${dropdownEl}
      </div>
    `
  }

  renderDropdown (page) {
    var paymentUrl = page.siteInfo.links.payment[0].href;

    // resolve any relative links
    if (paymentUrl.indexOf('://') === -1) {
      paymentUrl = `${page.siteInfo.url}${paymentUrl.startsWith('/') ? '' : '/'}${paymentUrl}`;
    }

    // render the dropdown if open
    return yo`
      <div class="dropdown datsite-menu-dropdown donate-menu-dropdown">
        <div class="dropdown-items datsite-menu-dropdown-items donate-menu-dropdown-items with-triangle">
          <div class="header">
            <div class="header-info">
              <span class="fa fa-heart-o"></span>
              <h1>
                Contribute to
                ${page.siteInfo.title && page.siteInfo.title.length
                  ? page.siteInfo.title
                  : 'this site'
                }
              </h1>
            </div>
          </div>
          <div class="body">
            <div>
              Visit their donation page to show your appreciation!
            </div>
            <div>
              <a href="#" class="link" onclick=${e => this.onOpenPage(paymentUrl)}>${paymentUrl}</a>
            </div>
          </div>
        </div>
      `
  }

  updateActives () {
    Array.from(document.querySelectorAll('.donate-navbar-menu')).forEach(el => {
      var newEl = this.render();
      if (newEl) yo.update(el, newEl);
    });
  }

  onClickBtn (e) {
    this.isDropdownOpen = !this.isDropdownOpen;
    this.updateActives();
  }

  close () {
    if (this.isDropdownOpen) {
      this.isDropdownOpen = false;
      this.updateActives();
    }
  }

  onClickAnywhere (e) {
    var parent = findParent(e.target, 'donate-navbar-menu');
    if (parent) return // abort - this was a click on us!
    this.close();
  }

  onOpenPage (href) {
    this.isDropdownOpen = false;
    setActive(create$$1(href));
  }
}

/* globals beaker */

class BookmarkMenuNavbarBtn {
  constructor () {
    this.justCreatedBookmark = false; // did we create the bookmark on open?
    this.values = {
      title: '',
      notes: '',
      tags: '',
      private: false,
      pinned: false,
      seeding: true,
      saved: true
    };
    this.isDropdownOpen = false;
    this.allTags = null;
    this.tagsAutocompleteResults = null;
    this.tagsAutocompleteIdx = 0;
    window.addEventListener('mousedown', this.onClickAnywhere.bind(this), true);
  }

  render () {
    var page = getActive();
    const url = page ? page.getIntendedURL() : '';

    // render the dropdown if open
    var dropdownEl = '';
    if (this.isDropdownOpen) {
      dropdownEl = yo`
        <div class="dropdown bookmark-menu-dropdown">
          <div class="dropdown-items bookmark-menu-dropdown-items with-triangle">
            <div class="header">
              <i class="fa fa-star"></i>
              Edit this bookmark
            </div>

            <form onsubmit=${e => this.onSaveBookmark(e)}>
              <div class="input-group">
                <label for="title">Title:</label>
                <input class="bookmark-title" type="text" name="title" value=${this.values.title} onkeyup=${e => this.onChangeTitle(e)}/>
              </div>

              <div class="input-group tags">
                <label>Tags:</label>
                <input type="text" placeholder="Separate with spaces" name="tags" onfocus=${e => this.moveCursorToEnd(e)} value=${this.values.tags} onkeydown=${e => this.onPreventTab(e)} onkeyup=${e => this.onChangeTags(e)} onblur=${() => { this.tagsAutocompleteResults=null; }}/>
                ${this.tagsAutocompleteResults ? yo`
                  <div class="autocomplete-results">
                    ${this.tagsAutocompleteResults.map((t, i) => yo`<div onclick=${e => this.onClickAutocompleteTag(e)} class="result ${i === this.tagsAutocompleteIdx ? 'selected' : ''}">${t}`)}
                  </div>
                ` : ''}
              </div>

              ${''/*TODO(profiles) disabled -prf
              <div class="input-group privacy">
                <label>Privacy:</label>

                <div class="privacy-wrapper">
                  <input onclick=${e => this.onChangeVisibility(e, 'private')} type="radio" id="privacy-private" name="privacy" value="private" checked=${this.values.private}/>
                  <label class="btn" for="privacy-private">
                    <i class="fa fa-lock"></i>
                    Private
                  </label>

                  <input onclick=${e => this.onChangeVisibility(e, 'public')} type="radio" id="privacy-public" name="privacy" value="public" checked=${!this.values.private}/>
                  <label class="btn" for="privacy-public">
                    <i class="fa fa-globe"></i>
                    Public
                  </label>
                </div>
              </div>*/}

              <div>
                <h3>Other options</h3>

                <label class="toggle">
                  <input onchange=${(e) => this.onChangePinned(e)} checked=${this.values.pinned || false} type="checkbox" name="pinned" value="pinned">
                  <div class="switch"></div>
                  <span class="text">Pin to start page</span>
                </label>

                ${url.startsWith('dat://') && page.siteInfo && !page.siteInfo.isOwner
                  ? yo`
                    <label class="toggle">
                      <input onchange=${(e) => this.onChangeSeeding(e)} checked=${this.values.seeding || false} type="checkbox" name="seeding" value="seeding">
                      <div class="switch"></div>
                      <span class="text">Help seed these files</span>
                    </label>`
                  : ''
                }
              </div>

              <div class="buttons">
                <button type="button" class="btn remove" onclick=${e => this.onClickRemoveBookmark(e)}>
                  Remove bookmark
                </button>

                <button class="btn primary" type="submit" disabled=${!this.doesNeedSave}>
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      `;
    }

    // bookmark toggle state
    var bookmarkBtnClass = 'nav-bookmark-btn' + ((page && !!page.bookmark) ? ' active' : '');

    // render btn
    return yo`<div class="bookmark-navbar-menu">
      <button class="star ${bookmarkBtnClass}" title="Bookmark this page" onclick=${e => this.onClickBookmark(e)}>
        <span class="star ${page && page.bookmark ? 'fa fa-star' : 'fa fa-star-o'}"></span>
      </button>
      ${dropdownEl}
    </div>`
  }

  updateActives () {
    Array.from(document.querySelectorAll('.bookmark-navbar-menu')).forEach(el => yo.update(el, this.render()));
  }

  get doesNeedSave () {
    const page = getActive();
    if (!page || !page.bookmark) {
      return false
    }
    const b = page.bookmark;
    return (
      this.justCreatedBookmark ||
      b.title !== this.values.title ||
      tagsToString(b.tags) !== this.values.tags ||
      b.notes !== this.values.notes ||
      b.private !== this.values.private ||
      b.pinned !== this.values.pinned ||
      b.saved !== this.values.seeding ||
      b.seeding !== this.values.saved
    )
  }

  close () {
    this.tagsAutocompleteResults = null;
    this.tagsQuery = null;
    this.tagsAutocompleteIdx = 0;
    if (this.isDropdownOpen) {
      this.isDropdownOpen = false;
    }
    this.updateActives();
  }

  onClickAnywhere (e) {
    var parent = findParent(e.target, 'bookmark-navbar-menu');
    if (parent) return // abort - this was a click on us!
    this.close();
  }

  moveCursorToEnd (e) {
    e.target.selectionStart = e.target.selectionEnd = e.target.value.length;
  }

  async onClickBookmark () {
    // toggle the dropdown bookmark editor
    this.isDropdownOpen = !this.isDropdownOpen;

    if (this.isDropdownOpen) {
      var page = getActive();

      if (!page.bookmark) {
        // set the bookmark privately
        await beaker.bookmarks.bookmarkPrivate(page.getIntendedURL(), {title: page.title || '', pinned: false});
        page.bookmark = await beaker.bookmarks.getBookmark(page.getIntendedURL());
        this.justCreatedBookmark = true;
        update$1();
      } else {
        this.justCreatedBookmark = false;
      }

      // set form values
      this.values.private = page.bookmark.private;
      this.values.title = page.bookmark.title;
      this.values.tags = tagsToString(page.bookmark.tags);
      this.values.notes = page.bookmark.notes;
      this.values.pinned = page.bookmark.pinned;
      this.values.saved = page.siteInfo && page.siteInfo.userSettings && page.siteInfo.userSettings.isSaved;
      this.values.seeding = this.values.saved && page.siteInfo && page.siteInfo.userSettings && page.siteInfo.userSettings.networked;
    }

    this.updateActives();

    // select the title input
    document.querySelectorAll('.bookmark-title').forEach(el => {
      el.focus();
      el.select();
    });
  }

  async onSaveBookmark (e) {
    e.preventDefault();
    var page = getActive();
    if (!page.bookmark) {
      return this.close() // bookmark mustve gotten deleted by another tab
    }

    // update bookmark
    var b = page.bookmark;
    b.title = this.values.title;
    b.tags = this.values.tags.split(' ').filter(Boolean);
    b.notes = this.values.notes;

    // delete old bookmark if privacy changed
    if (this.values.private && !b.private) {
      await beaker.bookmarks.unbookmarkPublic(b.href);
    } else if (!this.values.private && b.private) {
      await beaker.bookmarks.unbookmarkPrivate(b.href);
    }

    // create new bookmark
    if (this.values.private) {
      await beaker.bookmarks.bookmarkPrivate(b.href, b);
    } else {
      await beaker.bookmarks.bookmarkPublic(b.href, b);
    }

    // set the pinned status of the bookmark
    await beaker.bookmarks.setBookmarkPinned(b.href, this.values.pinned);

    // TODO
    // set seeding/saved value

    page.bookmark = await beaker.bookmarks.getBookmark(b.href);
    update$1();
    this.close();
  }

  async onClickRemoveBookmark (e) {
    var page = getActive();
    var b = page.bookmark;
    if (!b) return
    if (b.private) {
      await beaker.bookmarks.unbookmarkPrivate(page.getIntendedURL());
    } else {
      await beaker.bookmarks.unbookmarkPublic(page.getIntendedURL());
    }
    page.bookmark = null;
    update$1();
    this.close();
  }

  onChangeTitle (e) {
    this.values.title = e.target.value;
    this.updateActives();
  }

  async onChangeTags (e) {
    if (this.tagsAutocompleteResults) {
      // scroll up in autocomplete results
      if (e.keyCode === 38 && this.tagsAutocompleteIdx > 0) {
        this.tagsAutocompleteIdx -= 1;
      }
      // scroll down in autocomplete results
      else if (e.keyCode === 40 && this.tagsAutocompleteIdx < this.tagsAutocompleteResults.length - 1) {
        this.tagsAutocompleteIdx += 1;
      }
      // on TAB, add the selected tag autocomplete result
      else if (e.keyCode === 9) {
        e.target.value += this.tagsAutocompleteResults[this.tagsAutocompleteIdx].slice(this.tagsQuery.length) + ' ';
        this.tagsAutocompleteResults = null;
        this.tagsAutocompleteIdx = 0;
      }
    }

    if (e.target.value !== this.values.tags) {
      await this.handleTagAutocompleteResults(e.target.value);
    }
    this.values.tags = e.target.value;
    this.updateActives();
  }

  async handleTagAutocompleteResults (tagStr) {
    // if this.allTags not set, fetch the user's bookmark tags
    if (!this.allTags) {
      this.allTags = await beaker.bookmarks.listBookmarkTags(0);
    }

    // split the e.target.value to get the last "tag entry"
    const tagsArr = tagStr.split(' ');
    this.tagsQuery = tagsArr[tagsArr.length - 1];
    if (this.tagsQuery.length) {
      this.tagsAutocompleteResults = this.allTags.filter(t => t.startsWith(this.tagsQuery));
    } else {
      // reset the autocomplete results
      this.tagsAutocompleteResults = null;
      this.tagsAutocompleteIdx = 0;
    }
  }

  onClickAutocompleteTag (e) {
    this.values.tags += e.target.innerText.slice(this.tagsQuery.length) + ' ';
    this.tagsAutocompleteResults = null;
    this.tagsAutocompleteIdx = 0;
    this.updateActives();
  }

  onPreventTab (e) {
    if (this.tagsAutocompleteResults && e.keyCode === 9) {
      e.preventDefault();
    }
  }

  onChangeNotes (e) {
    this.values.notes = e.target.value;
    this.updateActives();
  }

  onChangePinned (e) {
    this.values.pinned = e.target.checked;
    this.updateActives();
  }

  onChangeSeeding (e) {
    this.values.seeding = e.target.checked;
    this.updateActives();
  }

  onChangeSaved (e) {
    this.values.saved = e.target.checked;
    this.updateActives();
  }

  onChangeVisibility (e, v) {
    e.stopPropagation();
    this.values.private = v === 'private';
    this.isPrivacyDropdownOpen = false;
    this.updateActives();
  }
}

function tagsToString (tags) {
  return (tags || []).join(' ')
}

/* globals beaker DatArchive confirm */

// there can be many drop menu btns rendered at once, but they are all showing the same information
// the PageMenuNavbarBtn manages all instances, and you should only create one

class PageMenuNavbarBtn {
  constructor () {
    this.isDropdownOpen = false;
    this.isOpenwithOpen = false;
    this.openwithMouseLeaveTimer = null;
    window.addEventListener('mousedown', this.onClickAnywhere.bind(this), true);
  }

  render () {
    const page = getActive();
    if (!page || !page.protocolInfo || ['dat:'].includes(page.protocolInfo.scheme) === false) {
      return ''
    }
    const isInstalledApp = page.isInstalledApp();
    const isDat = !!page.getViewedDatOrigin();

    // render the dropdown if open
    var dropdownEl = '';
    if (this.isDropdownOpen) {
      /*var openwithSublist TODO restore if/when needed
      if (this.isOpenwithOpen) {
        openwithSublist = yo`
          <div class="dropdown-items sublist">
            <div class="list">
              <div class="list-item" onclick=${() => this.onClickViewFiles()}>
                Library
              </div>
            </div>
          </div>
        `
      } */
      dropdownEl = yo`
        <div class="toolbar-dropdown dropdown toolbar-dropdown-menu-dropdown">
              ${'' /* TODO restore if/when needed
              <div
                class="list-item"
                onmouseenter=${() => this.onMouseEnterOpenwith()}
                onmouseleave=${() => this.onMouseLeaveOpenwith()}
              >
                <i class="fa fa-share"></i>
                Open with...
                <i class="fa fa-caret-right"></i>
                ${openwithSublist}
              </div>
              <hr /> */}
              ${'' // TODO(apps) restore when we bring back apps -prf
              /*isAppScheme ? yo`<div>
                <div class="list-item" onclick=${() => isDat ? this.onClickInstall() : this.onClickEditSettings()}>
                  <i class="fa fa-wrench"></i>
                  Configure this app
                </div>
                ${isInstalledApp ?
                  yo`
                    <div class="list-item" onclick=${() => this.onClickUninstall()}>
                      <i class="fa fa-trash-o"></i>
                      Uninstall this app
                    </div>
                  `
                  : ''}
              </div>` : ''}
              ${isAppScheme && isDat ? yo`<hr />` : ''*/}

            ${isDat
              ? yo`
                <div class="dropdown-items compact with-triangle">
                  <div class="dropdown-item" onclick=${() => this.onClickViewFiles()}>
                    <i class="fa fa-files-o"></i>
                    View files
                  </div>

                  <div class="dropdown-item" onclick=${() => this.onClickFork()}>
                    <i class="fa fa-clone"></i>
                    Make editable copy
                  </div>

                  <hr />

                  <div class="dropdown-item" onclick=${() => this.onToggleLiveReloading()}>
                    <i class="fa fa-bolt"></i>
                    Toggle live reloading
                  </div>

                  <div class="dropdown-item" onclick=${() => this.onClickNetworkDebugger()}>
                    <i class="fa fa-bug"></i>
                    Network debugger
                  </div>

                  <div class="dropdown-item" onclick=${() => this.onClickDownloadZip()}>
                    <i class="fa fa-file-archive-o"></i>
                    Download as .zip
                  </div>
                </div>`
              : ''
            }

            ${'' // TODO(apps) restore when we bring back apps -prf
            /*isDat && !isInstalledApp ? yo`<div>
              <hr />
              <div class="list-item" onclick=${() => this.onClickInstall()}>
                <i class="fa fa-download"></i>
                Install as an app
              </div>
            </div>` : ''*/}
        </div>`;
    }

    // render btn
    return yo`
      <div class="toolbar-dropdown-menu page-dropdown-menu">
        <button class="toolbar-btn toolbar-dropdown-menu-btn ${this.isDropdownOpen ? 'pressed' : ''}" onclick=${e => this.onClickBtn(e)} title="Menu">
          <span class="fa fa-ellipsis-h"></span>
        </button>
        ${dropdownEl}
      </div>`
  }

  updateActives () {
    Array.from(document.querySelectorAll('.page-dropdown-menu')).forEach(el => {
      var newEl = this.render();
      if (newEl) yo.update(el, newEl);
    });
  }

  close () {
    if (this.isDropdownOpen) {
      this.isDropdownOpen = false;
      this.isOpenwithOpen = false;
      this.updateActives();
    }
  }

  onClickBtn (e) {
    this.isDropdownOpen = !this.isDropdownOpen;
    if (!this.isDropdownOpen) {
      this.isOpenwithOpen = false;
    }
    this.updateActives();
  }

  onClickAnywhere (e) {
    var parent = findParent(e.target, 'page-dropdown-menu');
    if (parent) return // abort - this was a click on us!
    this.close();
  }

  onMouseEnterOpenwith () {
    if (this.openwithMouseLeaveTimer) {
      clearTimeout(this.openwithMouseLeaveTimer);
      this.openwithMouseLeaveTimer = null;
    }
    this.isOpenwithOpen = true;
    this.updateActives();
  }

  onMouseLeaveOpenwith () {
    this.openwithMouseLeaveTimer = setTimeout(() => {
      this.isOpenwithOpen = false;
      this.updateActives();
    }, 300);
  }

  // TODO(apps) restore when we bring back apps -prf
  // async onClickInstall () {
  //   this.close()
  //   const page = pages.getActive()
  //   const datUrl = page && page.getViewedDatOrigin()
  //   if (!datUrl) return
  //   const res = await beaker.apps.runInstaller(0, datUrl)
  //   if (res && res.name) {
  //     page.loadURL(`app://${res.name}`)
  //   }
  // }

  async onClickEditSettings () {
    this.close();
    setActive(create$$1('beaker://settings'));
  }

  // TODO(apps) restore when we bring back apps -prf
  // async onClickUninstall () {
  //   this.close()
  //   const page = pages.getActive()
  //   if (!page || !page.protocolInfo || page.protocolInfo.scheme !== 'app:') {
  //     return
  //   }
  //   if (!confirm('Are you sure you want to uninstall this app?')) {
  //     return
  //   }
  //   const name = page.protocolInfo.hostname
  //   await beaker.apps.unbind(0, name)
  //   const datUrl = page.getViewedDatOrigin()
  //   page.loadURL(datUrl || 'beaker://start/')
  // }

  onClickViewFiles () {
    this.close();
    const page = getActive();
    if (!page || !page.getViewedDatOrigin()) return
    setActive(create$$1(`beaker://library/dat://${page.siteInfo.key}`));
  }

  onClickNetworkDebugger () {
    this.close();
    const page = getActive();
    if (!page || !page.getViewedDatOrigin()) return
    setActive(create$$1(`beaker://swarm-debugger/dat://${page.siteInfo.key}`));
  }

  async onClickFork () {
    this.close();
    const page = getActive();
    const datUrl = page && page.getViewedDatOrigin();
    if (!datUrl) return
    const fork = await DatArchive.fork(datUrl, {prompt: true}).catch(() => {});
    if (fork) {
      page.loadURL(`beaker://library/${fork.url}#setup`);
    }
  }

  async onToggleLiveReloading () {
    this.close();
    const page = getActive();
    page.toggleLiveReloading();
  }

  onClickDownloadZip () {
    this.close();
    const page = getActive();
    const datUrl = page && page.getViewedDatOrigin();
    if (!datUrl) return
    beaker.browser.downloadURL(`${datUrl}?download_as=zip`);
  }
}

/* globals DOMParser */

function render$3 (str) {
  var parser = new DOMParser();
  var doc = parser.parseFromString(str, 'image/svg+xml');
  return doc.children[0]
}

function render$2 () {
  return render$3(`
    <svg class="icon nav-arrow" width="9px" height="16px" viewBox="0 0 9 16" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
      <g stroke="none" stroke-width="1" fill="none" fill-rule="evenodd" stroke-linejoin="round">
        <polyline id="nav-arrow" stroke="#000000" stroke-width="2" transform="translate(4.500000, 8.000000) scale(-1, 1) translate(-4.500000, -8.000000) " points="8 1 1 8 8 15"/>
      </g>
    </svg>
  `)
}

function render$4 () {
  return render$3(`
    <svg class="icon refresh" width="16px" height="15px" viewBox="0 0 16 15" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
      <g stroke="none" stroke-width="1" fill="none" fill-rule="evenodd">
        <g id="refresh" transform="translate(1.000000, 1.000000)">
          <path d="M10.9451459,1.75753722 C9.78269142,0.66752209 8.21929978,0 6.5,0 C2.91014913,0 0,2.91014913 0,6.5 C0,10.0898509 2.91014913,13 6.5,13 C9.00186057,13 11.173586,11.5865234 12.2601674,9.51457898" id="circle" stroke="#000000" stroke-width="2" stroke-linecap="round"/>
          <polygon id="triangle" fill="#000000" points="14.2374369 4.98743687 9.64124279 4.63388348 13.8838835 0.391242789"/>
        </g>
      </g>
    </svg>
  `)
}

function render$5 () {
  return render$3(`
    <svg class="icon close" width="58px" height="58px" viewBox="0 0 58 58" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
      <g stroke="none" stroke-width="1" fill="none" fill-rule="evenodd" stroke-linecap="round">
        <g id="close" transform="translate(4, 5)" stroke="#000000" stroke-width="10">
          <path d="M1.5,0.5 L48.5,47.5"/>
          <path d="M48.5,0 L1,48"/>
        </g>
      </g>
    </svg>`)
}

/* globals URL beaker */

// import {AppsMenuNavbarBtn} from './navbar/apps-menu' TODO(apps) restore when we bring back apps -prf
const KEYCODE_DOWN = 40;
const KEYCODE_UP = 38;
const KEYCODE_ESC = 27;
const KEYCODE_ENTER = 13;
const KEYCODE_N = 78;
const KEYCODE_P = 80;

const isDatHashRegex = /^[a-z0-9]{64}/i;
const isIPAddressRegex = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/;

// globals
// =

var toolbarNavDiv = document.getElementById('toolbar-nav');
var updatesNavbarBtn = null;
var browserMenuNavbarBtn = null;
var bookmarkMenuNavbarBtn = null;
// var appsMenuNavbarBtn = null TODO(apps) restore when we bring back apps -prf
var datsiteMenuNavbarBtn = null;
var syncfolderMenuNavbarBtn = null;
var donateMenuNavbarBtn = null;
var pageMenuNavbarBtn = null;

var isLocationHighlighted = false;

// autocomplete data
var autocompleteCurrentValue = null;
var autocompleteCurrentSelection = 0;
var autocompleteResults = null; // if set to an array, will render dropdown

// exported functions
// =

function setup$3 () {
  // create the button managers
  updatesNavbarBtn = new UpdatesNavbarBtn();
  // appsMenuNavbarBtn = new AppsMenuNavbarBtn() TODO(apps) restore when we bring back apps -prf
  browserMenuNavbarBtn = new BrowserMenuNavbarBtn();
  bookmarkMenuNavbarBtn = new BookmarkMenuNavbarBtn();
  datsiteMenuNavbarBtn = new DatsiteMenuNavbarBtn();
  syncfolderMenuNavbarBtn = new SyncfolderMenuNavbarBtn();
  donateMenuNavbarBtn = new DonateMenuNavbarBtn();
  pageMenuNavbarBtn = new PageMenuNavbarBtn();

  // add some global listeners
  window.addEventListener('keydown', onGlobalKeydown);
}

function createEl (id) {
  // render
  var el = render(id, null);
  toolbarNavDiv.appendChild(el);
  return el
}

function destroyEl (id) {
  var el = document.querySelector(`.toolbar-actions[data-id="${id}"]`);
  if (el) {
    toolbarNavDiv.removeChild(el);
  }
}

function focusLocation (page) {
  var el = page.navbarEl.querySelector('.nav-location-input');
  el.focus();
  el.select();
}

function isLocationFocused (page) {
  // fetch current page, if not given
  page = page || getActive();

  // get element and pull state
  var addrEl = page.navbarEl.querySelector('.nav-location-input');
  return addrEl.matches(':focus')
}

function showInpageFind (page) {
  // show control and highlight text
  page.isInpageFinding = true;
  page.inpageFindInfo = null;
  update$1(page);
  var el = page.navbarEl.querySelector('.nav-find-input');
  el.focus();
  el.select();
}

function findNext(page, forward) {
  onClickFindNext(forward);
}

function hideInpageFind (page) {
  if (page.isInpageFinding) {
    page.stopFindInPageAsync('clearSelection');
    page.isInpageFinding = false;
    page.inpageFindInfo = null;
    update$1(page);
  }
}

function clearAutocomplete () {
  if (autocompleteResults) {
    autocompleteCurrentValue = null;
    autocompleteCurrentSelection = 0;
    autocompleteResults = null;
    update$1();
  }
}

function update$1 (page) {
  // fetch current page, if not given
  page = page || getActive();
  if (!page.webviewEl) return

  // render
  yo.update(page.navbarEl, render(page.id, page));
}

function updateLocation (page) {
  // fetch current page, if not given
  page = page || getActive();

  // update location
  var addrEl = page.navbarEl.querySelector('.nav-location-input');
  var isAddrElFocused = addrEl.matches(':focus');
  if (!isAddrElFocused || !addrEl.value) { // only update if not focused or empty, so we dont mess up what the user is doing
    addrEl.value = page.getIntendedURL();
    if (isAddrElFocused) {
      addrEl.select(); // if was focused, then select what we put in
    }
  }
}

function bookmarkAndOpenMenu () {
  bookmarkMenuNavbarBtn.onClickBookmark();
}

function closeMenus () {
  browserMenuNavbarBtn.isDropdownOpen = false;
  browserMenuNavbarBtn.updateActives();
  // appsMenuNavbarBtn.close() TODO(apps) restore when we bring back apps -prf
  pageMenuNavbarBtn.close();
  bookmarkMenuNavbarBtn.close();
  datsiteMenuNavbarBtn.close();
  syncfolderMenuNavbarBtn.close();
  donateMenuNavbarBtn.close();
}

// internal helpers
// =

function render (id, page) {
  const isLoading = page && page.isLoading();
  const isViewingDat = page && page.getURL().startsWith('dat:');
  const siteHasDatAlternative = page && page.siteHasDatAlternative;
  const gotInsecureResponse = page && page.siteLoadError && page.siteLoadError.isInsecureResponse;
  const siteLoadError = page && page.siteLoadError;
  const isOwner = page && page.siteInfo && page.siteInfo.isOwner;

  // back/forward should be disabled if its not possible go back/forward
  var backDisabled = (page && page.canGoBack()) ? '' : 'disabled';
  var forwardDisabled = (page && page.canGoForward()) ? '' : 'disabled';

  // render reload/cancel btn
  var reloadBtn = (isLoading)
    ? yo`
        <button class="toolbar-btn nav-cancel-btn" onclick=${onClickCancel}>
          ${render$5()}
        </button>`
    : yo`
        <button class="toolbar-btn nav-reload-btn" onclick=${onClickReload} title="Reload this page">
          ${render$4()}
        </button>`;

  // `page` is null on initial render
  // and the toolbar should be hidden on initial render
  // and it should be hidden if the page isnt active
  var toolbarHidden = (!page || !page.isActive) ? ' hidden' : '';

  // preserve the current finder value and focus
  var findEl = page && page.navbarEl.querySelector('.nav-find-input');
  var findValue = findEl ? findEl.value : '';

  // inpage finder ctrl
  var inpageFinder = (page && page.isInpageFinding)
    ? yo`
        <div class="nav-find-wrapper">
          <input
            type="text"
            class="nav-find-input nav-location-input"
            placeholder="Find in page..."
            oninput=${onInputFind}
            onkeydown=${onKeydownFind}
            value=${findValue} />
          ${findValue && page.inpageFindInfo
            ? yo`
              <span class="nav-find-info">
                ${page.inpageFindInfo.activeMatchOrdinal}
                of
                ${page.inpageFindInfo.matches}
              </span>`
            : ''}
          <div class="nav-find-btns">
            <button disabled=${!findValue} class="btn" onclick=${e => onClickFindNext(false)}><i class="fa fa-angle-up"></i></button>
            <button disabled=${!findValue} class="btn last" onclick=${e => onClickFindNext(true)}><i class="fa fa-angle-down"></i></button>
            <button class="close-btn" onclick=${e => hideInpageFind(page)}>${render$5()}</button>
          </div>
        </div>
      `
    : '';

  // zoom btn should only show if zoom is not the default setting
  var zoomBtn = '';
  if (page && page.zoom != 0) {
    // I dont know what that formula is, so I solved this problem like any good programmer would, by stealing the values from chrome
    var zoomPct = ({
      '-0.5': 90,
      '-1': 75,
      '-1.5': 67,
      '-2': 50,
      '-2.5': 33,
      '-3': 25,
      '0': 100,
      '0.5': 110,
      '1': 125,
      '1.5': 150,
      '2': 175,
      '2.5': 200,
      '3': 250,
      '3.5': 300,
      '4': 400,
      '4.5': 500
    })[page.zoom];
    var zoomIcon = zoomPct < 100 ? '-minus' : '-plus';
    zoomBtn = yo`
      <button onclick=${onClickZoom} title="Zoom: ${zoomPct}%" class="zoom">
        <i class=${'fa fa-search' + zoomIcon}></i>
        ${zoomPct}%
      </button>`;
  }

  // live reload btn
  const isLiveReloading = page && page.isLiveReloading();
  const liveReloadBtn = (isLiveReloading)
    ? yo`
      <button
        class="live-reload-btn ${isLiveReloading ? 'active' : ''}"
        title="Toggle live reloading"
        onclick=${() => page.toggleLiveReloading()}>
        <i class="fa fa-bolt"></i>
      </span>`
    : '';

  // donate btn
  const donateBtn = (page && page.siteInfo && page.siteInfo.links.payment)
    ? donateMenuNavbarBtn.render()
    : '';

  // dat buttons
  var datBtns = [];

  if (isViewingDat) {
    // TODO(apps) restore when we bring back apps -prf
    // if (page.siteInfo && page.siteInfo.type.includes('app')) {
    //   if (page.isInstalledApp() === false) {
    //     datBtns.unshift(
    //       yo`<button
    //         class="callout install-callout"
    //         title="Install this application"
    //         onclick=${onClickInstallApp}
    //       >
    //         <span class="fa fa-download"></span> Install Application
    //       </button>`
    //     )
    //   }
    // }
  } else if (siteHasDatAlternative) {
    datBtns.push(
      yo`<button
        class="callout"
        title="Go to Dat Version of this Site"
        onclick=${onClickGotoDatVersion}
      >
        <span class="fa fa-share-alt"></span> P2P version available
      </button>`
    );
  }

  // autocomplete dropdown
  var autocompleteDropdown = '';
  if (autocompleteResults) {
    autocompleteDropdown = yo`
      <div class="autocomplete-dropdown" onclick=${onClickAutocompleteDropdown}>
        ${autocompleteResults.map((r, i) => {
          // content
          var contentColumn;
          if (r.search) { contentColumn = yo`<span class="result-search">${r.search}</span>`; } else {
            contentColumn = yo`<span class="result-url"></span>`;
            if (r.urlDecorated) {
              contentColumn.innerHTML = r.urlDecorated; // use innerHTML so our decoration can show
            } else {
              contentColumn.textContent = r.url;
            }
          }
          var titleColumn = yo`<span class="result-title"></span>`;
          if (r.titleDecorated) {
            titleColumn.innerHTML = r.titleDecorated; // use innerHTML so our decoration can show
          } else {
            titleColumn.textContent = r.title;
          }

          // selection
          var rowCls = 'result';
          if (i == autocompleteCurrentSelection) { rowCls += ' selected'; }

          // result row
          return yo`
            <div class=${rowCls} data-result-index=${i}>
              ${r.bookmarked ? yo`<i class="fa fa-star-o"></i>` : ''}
              ${r.search
                ? yo`<i class="icon icon-search"></i>`
                : yo`<img class="icon" src=${'beaker-favicon:' + r.url}/>`
              }
              ${contentColumn}
              ${titleColumn}
            </div>`
        })}
      </div>
    `;
  }

  // preserve the current address value
  var addrEl = page && page.navbarEl.querySelector('.nav-location-input');
  var addrValue = addrEl ? addrEl.value : '';
  var isAddrElFocused = addrEl && addrEl.matches(':focus');

  // the main URL input
  var locationInput = yo`
    <input
      type="text"
      class="nav-location-input"
      oncontextmenu=${onContextMenu}
      onmousedown=${onMousedownLocation}
      onmouseup=${onMouseupLocation}
      ondblclick=${onDblclickLocation}
      onfocus=${onFocusLocation}
      onblur=${onBlurLocation}
      onkeydown=${onKeydownLocation}
      oninput=${onInputLocation}
      value=${addrValue} />
  `;

  // a prettified rendering of the main URL input
  var locationPrettyView = renderPrettyLocation(addrValue, isAddrElFocused, gotInsecureResponse, siteLoadError);

  // render
  return yo`
    <div data-id=${id} class="toolbar-actions${toolbarHidden}">
      <div class="toolbar-group">
        <button style="transform: scaleX(-1);" class="toolbar-btn nav-back-btn" ${backDisabled} onclick=${onClickBack}>
          ${render$2()}
        </button>

        <button class="toolbar-btn nav-forward-btn" ${forwardDisabled} onclick=${onClickForward}>
          ${render$2()}
        </button>
        ${reloadBtn}
      </div>

      <div class="toolbar-input-group${isLocationHighlighted ? ' input-focused' : ''}${autocompleteResults ? ' autocomplete' : ''}">
        ${page && (!isLocationHighlighted) ? page.siteInfoNavbarBtn.render() : ''}
        <div class="nav-location-container">
          ${locationPrettyView}
          ${locationInput}
        </div>
        ${inpageFinder}
        ${zoomBtn}
        ${!isLocationHighlighted ? [
          syncfolderMenuNavbarBtn.render(),
          liveReloadBtn,
          donateBtn,
          datBtns,
          datsiteMenuNavbarBtn.render(),
          pageMenuNavbarBtn.render(),
          bookmarkMenuNavbarBtn.render()
        ] : ''}
      </div>
      <div class="toolbar-group">
        ${''/*appsMenuNavbarBtn.render() TODO(apps) restore when we bring back apps -prf*/}
        ${browserMenuNavbarBtn.render()}
        ${updatesNavbarBtn.render()}
      </div>
      ${autocompleteDropdown}
    </div>
  </div>`
}

function renderPrettyLocation (value, isHidden, gotInsecureResponse, siteLoadError) {
  var valueRendered = value;
  if (/^(dat|http|https):\/\//.test(value)) {
    try {
      var { protocol, host, pathname, search, hash } = new URL(value);
      var hostVersion;
      if (protocol === 'dat:') {
        let match = /(.*)\+(.*)/.exec(host);
        if (match) {
          host = match[1];
          hostVersion = '+' + match[2];
        }
        if (isDatHashRegex.test(host)) {
          host = prettyHash(host);
        }
      }
      var cls = 'protocol';
      if (['beaker:'].includes(protocol)) cls += ' protocol-secure';
      if (['https:'].includes(protocol) && !siteLoadError && !gotInsecureResponse) cls += ' protocol-secure';
      if (['https:'].includes(protocol) && gotInsecureResponse) cls += ' protocol-insecure';
      if (['dat:'].includes(protocol)) cls += ' protocol-p2p';
      valueRendered = [
        yo`<span class=${cls}>${protocol.slice(0, -1)}</span>`,
        yo`<span class="syntax">://</span>`,
        yo`<span class="host">${host}</span>`,
        hostVersion ? yo`<span class="host-version">${hostVersion}</span>` : false,
        yo`<span class="path">${pathname}${search}${hash}</span>`
      ].filter(Boolean);
    } catch (e) {
      // invalid URL, just use value
    }
  }

  return yo`
    <div class="nav-location-pretty${(isHidden) ? ' hidden' : ''}">
      ${valueRendered}
    </div>`
}

async function handleAutocompleteSearch (results) {
  var v = autocompleteCurrentValue;
  if (!v) return

  // decorate result with bolded regions
  // explicitly replace special characters to match sqlite fts tokenization
  var searchTerms = v.replace(/[:^*-./]/g, ' ').split(' ').filter(Boolean);
  results.forEach(r => decorateResultMatches(searchTerms, r));

  // figure out what we're looking at
  var {vWithProtocol, vSearch, isProbablyUrl, isGuessingTheScheme} = examineLocationInput(v);

  // set the top results accordingly
  var gotoResult = { url: vWithProtocol, title: 'Go to ' + v, isGuessingTheScheme };
  var searchResult = {
    search: v,
    title: 'DuckDuckGo Search',
    url: vSearch
  };
  if (isProbablyUrl) autocompleteResults = [gotoResult, searchResult];
  else autocompleteResults = [searchResult, gotoResult];

  // add search results
  if (results) {
    autocompleteResults = autocompleteResults.concat(results);
  }

  // read bookmark state
  await Promise.all(autocompleteResults.map(async r => {
    let bookmarked = false;
    try {
      bookmarked = await beaker.bookmarks.isBookmarked(r.url);
    } catch (_) {}
    Object.assign(r, {bookmarked});
  }));

  // render
  update$1();
}

function examineLocationInput (v) {
  // does the value look like a url?
  var isProbablyUrl = (!v.includes(' ') && (
    /\.[A-z]/.test(v) ||
    isIPAddressRegex.test(v) ||
    isDatHashRegex.test(v) ||
    v.startsWith('localhost') ||
    v.includes('://') ||
    v.startsWith('beaker:') ||
    v.startsWith('data:')
  ));
  var vWithProtocol = v;
  var isGuessingTheScheme = false;
  if (isProbablyUrl && !v.includes('://') && !(v.startsWith('beaker:') || v.startsWith('data:'))) {
    if (isDatHashRegex.test(v)) {
      vWithProtocol = 'dat://' + v;
    } else if (v.startsWith('localhost') || isIPAddressRegex.test(v)) {
      vWithProtocol = 'http://' + v;
    } else {
      vWithProtocol = 'https://' + v;
      isGuessingTheScheme = true; // note that we're guessing so that, if this fails, we can try http://
    }
  }
  var vSearch = 'https://duckduckgo.com/?q=' + v.split(' ').map(encodeURIComponent).join('+');
  return {vWithProtocol, vSearch, isProbablyUrl, isGuessingTheScheme}
}

function getAutocompleteSelection (i) {
  if (typeof i !== 'number') {
    i = autocompleteCurrentSelection;
  }
  if (autocompleteResults && autocompleteResults[i]) {
    return autocompleteResults[i]
  }

  // fallback to the current value in the navbar
  var addrEl = getActive().navbarEl.querySelector('.nav-location-input');
  var url = addrEl.value;

  // autocorrect urls of known forms
  if (isDatHashRegex.test(url)) {
    url = 'dat://' + url;
  } else {
    if (/:\/\//.test(url) === false) {
      url = 'https://' + url;
    }
  }
  return { url, isGuessingTheScheme: true }
}

function getAutocompleteSelectionUrl (i) {
  return getAutocompleteSelection(i).url
}

// helper for autocomplete
// - takes in the current search (tokenized) and a result object
// - mutates `result` so that matching text is bold
var offsetsRegex = /([\d]+ [\d]+ [\d]+ [\d]+)/g;
function decorateResultMatches (searchTerms, result) {
  // extract offsets
  var tuples = (result.offsets || '').match(offsetsRegex);
  if (!tuples) { return }

  // iterate all match tuples, and break the values into segments
  let lastTuple;
  let segments = { url: [], title: [] };
  let lastOffset = { url: 0, title: 0 };
  for (let tuple of tuples) {
    tuple = tuple.split(' ').map(i => +i); // the map() coerces to the proper type
    let [ columnIndex, termIndex, offset ] = tuple;
    let columnName = ['url', 'title'][columnIndex];

    // sometimes multiple terms can hit at the same point
    // that breaks the algorithm, so skip that condition
    if (lastTuple && lastTuple[0] === columnIndex && lastTuple[2] === offset) continue
    lastTuple = tuple;

    // use the length of the search term
    // (sqlite FTS gives the length of the full matching token, which isnt as helpful)
    let searchTerm = searchTerms[termIndex];
    if (!searchTerm) continue
    let len = searchTerm.length;

    // extract segments
    segments[columnName].push(result[columnName].slice(lastOffset[columnName], offset));
    segments[columnName].push(result[columnName].slice(offset, offset + len));
    lastOffset[columnName] = offset + len;
  }

  // add the remaining text
  segments.url.push(result.url.slice(lastOffset.url));
  segments.title.push(result.title.slice(lastOffset.title));

  // join the segments with <strong> tags
  result.urlDecorated = joinSegments(segments.url);
  result.titleDecorated = joinSegments(segments.title);
}

// helper for decorateResultMatches()
// - takes an array of string segments (extracted from the result columns)
// - outputs a single escaped string with every other element wrapped in <strong>
var ltRegex = /</g;
var gtRegex = />/g;
function joinSegments (segments) {
  var str = '';
  var isBold = false;
  for (var segment of segments) {
    // escape for safety
    segment = segment.replace(ltRegex, '&lt;').replace(gtRegex, '&gt;');

    // decorate with the strong tag
    if (isBold) str += '<strong>' + segment + '</strong>';
    else str += segment;
    isBold = !isBold;
  }
  return str
}

// ui event handlers
// =

function getEventPage (e) {
  for (var i = 0; i < e.path.length; i++) {
    if (e.path[i].dataset && e.path[i].dataset.id) { return getById(e.path[i].dataset.id) }
  }
}

function onClickBack (e) {
  var page = getEventPage(e);
  if (page && page.canGoBack()) {
    page.goBackAsync();
  }
}

function onClickForward (e) {
  var page = getEventPage(e);
  if (page && page.canGoForward()) {
    page.goForwardAsync();
  }
}

function onClickReload (e) {
  var page = getEventPage(e);
  if (page) { page.reload(); }
}

function onClickCancel (e) {
  var page = getEventPage(e);
  if (page) {
    page.stopAsync();
  }
}

function onClickGotoDatVersion (e) {
  const page = getEventPage(e);
  if (!page || !page.protocolInfo) return

  const url = `dat://${page.protocolInfo.hostname}${page.protocolInfo.pathname}`;
  if (e.metaKey || e.ctrlKey) { // popup
    setActive(create$$1(url));
  } else {
    page.loadURL(url); // goto
  }
}

function onClickZoom (e) {
  const { Menu } = electron.remote;
  var menu = Menu.buildFromTemplate([
    { label: 'Reset Zoom', click: () => zoomReset(getActive()) },
    { label: 'Zoom In', click: () => zoomIn(getActive()) },
    { label: 'Zoom Out', click: () => zoomOut(getActive()) }
  ]);
  menu.popup(electron.remote.getCurrentWindow());
}

// code to detect if the user is clicking, doubleclicking, or dragging the location before its focused
// if a click, select all; if a doubleclick, select word under cursor; if a drag, do default behavior
var lastMousedownLocationTs;
var lastMouseupLocationTs;
var mouseupClickIndex;
function onMousedownLocation (e) {
  if (!e.currentTarget.matches(':focus')) {
    lastMousedownLocationTs = Date.now();
  }
}
function onMouseupLocation (e) {
  if (Date.now() - lastMousedownLocationTs <= 300) {
    // was a fast click (probably not a drag) so select all
    let inputEl = e.currentTarget;
    mouseupClickIndex = inputEl.selectionStart;
    inputEl.select();

    // setup double-click override
    lastMousedownLocationTs = 0;
    lastMouseupLocationTs = Date.now();
  }
}
function onDblclickLocation (e) {
  if (Date.now() - lastMouseupLocationTs <= 300) {
    e.preventDefault();

    // select the text under the cursor
    // (we have to do this manually because we previously selected all on mouseup, which f's that default behavior up)
    let inputEl = e.currentTarget;
    let {start, end} = paulsWordBoundary.findWordBoundary(inputEl.value, mouseupClickIndex);
    inputEl.setSelectionRange(start, end);
    lastMouseupLocationTs = 0;
  }
}

function onFocusLocation (e) {
  var page = getEventPage(e);
  if (page) {
    page.navbarEl.querySelector('.nav-location-pretty').classList.add('hidden');
    page.navbarEl.querySelector('.toolbar-input-group').classList.add('input-focused');
  }
}

function onBlurLocation (e) {
  // clear the selection range so that the next focusing doesnt carry it over
  window.getSelection().empty();

  // HACK
  // blur gets called right before the click event for onClickAutocompleteDropdown
  // so, wait a bit before clearing the autocomplete, so the click has a chance to fire
  // -prf
  setTimeout(clearAutocomplete, 150);
  var page = getEventPage(e);
  if (page) {
    try {
      page.navbarEl.querySelector('.nav-location-pretty').classList.remove('hidden');
      page.navbarEl.querySelector('.toolbar-input-group').classList.remove('input-focused');
    } catch (e) {
      // ignore
    }
    isLocationHighlighted = false;
    update$1();
  }
}

function onInputLocation (e) {
  var value = e.target.value;

  // run autocomplete
  // TODO debounce
  var autocompleteValue = value.trim();
  if (autocompleteValue && autocompleteCurrentValue != autocompleteValue) {
    autocompleteCurrentValue = autocompleteValue; // update the current value
    autocompleteCurrentSelection = 0; // reset the selection
    // update the suggestions
    beaker.history.search(value)
      .then(handleAutocompleteSearch);
  } else if (!autocompleteValue) { clearAutocomplete(); } // no value, cancel out

  isLocationHighlighted = true;
}

function onKeydownLocation (e) {
  // on enter
  if (e.keyCode == KEYCODE_ENTER) {
    e.preventDefault();

    let page = getEventPage(e);
    if (page) {
      let selection = getAutocompleteSelection();
      page.loadURL(selection.url, { isGuessingTheScheme: selection.isGuessingTheScheme });
      e.target.blur();
    }
    return
  }

  // on escape
  if (e.keyCode == KEYCODE_ESC) {
    let page = getEventPage(e);
    page.navbarEl.querySelector('.nav-location-input').value = page.getIntendedURL();
    e.target.blur();
    return
  }

  // on keycode navigations
  var up = (e.keyCode == KEYCODE_UP || (e.ctrlKey && e.keyCode == KEYCODE_P));
  var down = (e.keyCode == KEYCODE_DOWN || (e.ctrlKey && e.keyCode == KEYCODE_N));
  if (autocompleteResults && (up || down)) {
    e.preventDefault();
    if (up && autocompleteCurrentSelection > 0) { autocompleteCurrentSelection--; }
    if (down && autocompleteCurrentSelection < autocompleteResults.length - 1) { autocompleteCurrentSelection++; }

    // re-render and update the url
    let page = getEventPage(e);
    let newValue = getAutocompleteSelectionUrl(autocompleteCurrentSelection);
    page.navbarEl.querySelector('.nav-location-input').value = newValue;
    update$1(page);
  }
}

function onClickAutocompleteDropdown (e) {
  // get the result index
  for (var i = 0; i < e.path.length; i++) {
    if (e.path[i].dataset && e.path[i].classList.contains('result')) {
      // follow result url
      var resultIndex = +e.path[i].dataset.resultIndex;
      getActive().loadURL(getAutocompleteSelectionUrl(resultIndex));
      return
    }
  }
}

function onInputFind (e) {
  var str = e.target.value;
  var page = getEventPage(e);
  if (page) {
    if (str) page.findInPageAsync(str);
    else page.stopFindInPageAsync('clearSelection');
    update$1();
  }
}

function onClickFindNext (forward) {
  var page = getActive();
  if (page) {
    var inputEl = page.navbarEl.querySelector('.nav-find-input');
    var str = inputEl.value;
    if (str) page.findInPageAsync(str, { findNext: true, forward });
  }
}

function onKeydownFind (e) {
  // on enter
  if (e.keyCode == KEYCODE_ENTER) {
    let str = e.target.value;
    let backwards = e.shiftKey; // search backwords on shift+enter
    let page = getEventPage(e);
    if (page) {
      if (str) page.findInPageAsync(str, { findNext: true, forward: !backwards });
      else page.stopFindInPageAsync('clearSelection');
    }
  }
}

function onGlobalKeydown (e) {
  // on escape, hide the in page finder
  if (e.keyCode == KEYCODE_ESC) {
    let page = getActive();
    if (page) { hideInpageFind(page); }
  }
}

function onContextMenu (e) {
  const { Menu, clipboard } = electron.remote;
  var clipboardContent = clipboard.readText();
  var clipInfo = examineLocationInput(clipboardContent);
  var menu = Menu.buildFromTemplate([
    { label: 'Cut', role: 'cut' },
    { label: 'Copy', role: 'copy' },
    { label: 'Paste', role: 'paste' },
    { label: `Paste and ${clipInfo.isProbablyUrl ? 'Go' : 'Search'}`, click: onPasteAndGo }
  ]);
  menu.popup(electron.remote.getCurrentWindow());

  function onPasteAndGo () {
    var url = clipInfo.isProbablyUrl ? clipInfo.vWithProtocol : clipInfo.vSearch;
    var page = getActive();
    page.navbarEl.querySelector('.nav-location-input').value = url;
    page.navbarEl.querySelector('.nav-location-input').blur();
    page.loadURL(url);
  }
}

var navbar = Object.freeze({
	setup: setup$3,
	createEl: createEl,
	destroyEl: destroyEl,
	focusLocation: focusLocation,
	isLocationFocused: isLocationFocused,
	showInpageFind: showInpageFind,
	findNext: findNext,
	hideInpageFind: hideInpageFind,
	clearAutocomplete: clearAutocomplete,
	update: update$1,
	updateLocation: updateLocation,
	bookmarkAndOpenMenu: bookmarkAndOpenMenu,
	closeMenus: closeMenus
});

/* globals beaker */

const ZOOM_STEP = 0.5;

function setZoomFromSitedata (page, origin) {
  // load zoom from sitedata
  origin = origin || page.getURLOrigin();
  if (!origin) { return }
  beaker.sitedata.get(origin, 'zoom').then(v => {
    if (typeof v != 'undefined') {
      page.zoom = +v;
      update$1(page);
      page.setZoomLevelAsync(page.zoom);
    }
  });
}

function setZoom (page, z) {
  // clamp
  if (z > 4.5) z = 4.5;
  if (z < -3) z = -3;

  // update
  page.zoom = z;
  page.setZoomLevelAsync(page.zoom);
  update$1(page);

  // persist to sitedata
  var origin = page.getURLOrigin();
  if (!origin) { return }
  beaker.sitedata.set(origin, 'zoom', page.zoom);

  // update all pages at the origin
  getAll().forEach(p => {
    if (p !== page && p.getURLOrigin() === origin) {
      p.zoom = z;
    }
  });
}

function zoomIn (page) {
  setZoom(page, page.zoom + ZOOM_STEP);
}

function zoomOut (page) {
  setZoom(page, page.zoom - ZOOM_STEP);
}

function zoomReset (page) {
  setZoom(page, 0);
}

// globals
// =

var promptsDiv = document.querySelector('#prompts');

// exported functions
// =

function createContainer (id) {
  // render
  var el = render$6(id, null);
  promptsDiv.append(el);
  return el
}

function destroyContainer (id) {
  var el = document.querySelector(`#prompts [data-id="${id}"]`);
  if (el) el.remove();
}

function add (page, { type, render, duration, onForceClose }) {
  // if 'type' is set, only allow one of the type
  if (type) {
    for (var i = 0; i < page.prompts.length; i++) {
      if (page.prompts[i].type == type) { return false }
    }
  }

  // add the prompt
  var prompt = {
    type,
    render,
    onForceClose
  };
  page.prompts.push(prompt);
  update$2(page);

  // start the timeout if there's a duration
  if (duration) {
    setTimeout(() => remove$1(page, prompt), duration);
  }

  return true
}

function remove$1 (page, prompt) {
  if (!page.prompts) { return } // page no longer exists

  // find and remove
  var i = page.prompts.indexOf(prompt);
  if (i !== -1) {
    page.prompts.splice(i, 1);
    update$2(page);
  }
}

function forceRemoveAll (page) {
  if (!page.prompts) { return } // page no longer exists

  // find and remove
  page.prompts.forEach(p => {
    if (typeof p.onForceClose == 'function') { p.onForceClose(); }
  });
  page.prompts = [];
  update$2(page);
}

function update$2 (page) {
  // fetch current page, if not given
  page = page || getActive();
  if (!page.webviewEl) return

  // render
  yo.update(page.promptEl, render$6(page.id, page));
}

// internal methods
// =

function render$6 (id, page) {
  if (!page) { return yo`<div data-id=${id} class="hidden"></div>` }

  return yo`<div data-id=${id} class=${page.isActive ? '' : 'hidden'}>
    ${page.prompts.map(prompt => {
      return yo`<div class="prompt">
        ${prompt.render({
          rerender: () => update$2(page),
          onClose: () => remove$1(page, prompt)
        })}
      </div>`
    })}
  </div>`
}

class BaseModal extends EventEmitter__default {
  render () {
    // override this method
    return 'BaseModal'
  }

  rerender () {
    this.emit('rerender');
  }

  close (err, res) {
    this.emit('close', err, res);
  }
}

// exported api
// =

class ExampleModal extends BaseModal {
  constructor (opts) {
    super(opts);
    this.i = opts.i ? opts.i : 0;
  }

  render () {
    return yo`
      <div style="padding: 10px 20px 6px; width: 500px;">
        <h3>Test Modal</h3>
        <p>
          Hello world! <a class="link" onclick=${() => this.onIncrement()}>Click me (${this.i} clicks)</a>
        </p>
        <p>
          <a class="btn primary" onclick=${() => this.close(null, this.i)}>OK</a>
          <a class="btn" onclick=${() => this.close(new Error('Canceled'))}>Cancel</a>              
        </p>
      </div>`
  }

  onIncrement () {
    this.i++;
    this.rerender();
  }
}

/* globals DatArchive */

// exported api
// =

class CreateArchiveModal extends BaseModal {
  constructor (opts) {
    super(opts);

    this.title = opts.title || '';
    this.description = opts.description || '';
    this.type = opts.type;
    this.links = opts.links;
    this.networked = ('networked' in opts) ? opts.networked : true;
  }

  // rendering
  // =

  render () {
    return yo`
      <div class="create-archive-modal">
        <h1 class="title">New archive</h1>

        <p class="help-text">
          Create a new archive and add it to your Library.
        </p>

        <form onsubmit=${e => this.onSubmit(e)}>
          <label for="title">Title</label>
          <input autofocus name="title" tabindex="2" value=${this.title || ''} placeholder="Title" onchange=${e => this.onChangeTitle(e)} />

          <label for="desc">Description</label>
          <textarea name="desc" tabindex="3" placeholder="Description (optional)" onchange=${e => this.onChangeDescription(e)}>${this.description || ''}></textarea>

          <div class="form-actions">
            <button type="button" onclick=${e => this.onClickCancel(e)} class="btn cancel" tabindex="4">Cancel</button>
            <button type="submit" class="btn success" tabindex="5">Create archive</button>
          </div>
        </form>
      </div>`
  }

  // event handlers
  // =

  onChangeTitle (e) {
    this.title = e.target.value;
  }

  onChangeDescription (e) {
    this.description = e.target.value;
  }

  onClickCancel (e) {
    e.preventDefault();
    this.close(new Error('Canceled'));
  }

  async onSubmit (e) {
    e.preventDefault();
    try {
      var newArchive = await DatArchive.create({
        title: this.title,
        description: this.description,
        type: this.type,
        networked: this.networked,
        links: this.links,
        prompt: false
      });
      this.close(null, {url: newArchive.url});
    } catch (e) {
      this.close(e.message || e.toString());
    }
  }
}

/* globals DatArchive */

// exported api
// =

class ForkArchiveModal extends BaseModal {
  constructor (opts) {
    super(opts);
    this.setup(opts);
  }

  async setup (opts) {
    // fetch archive info
    var archive = this.archive = new DatArchive(opts.url);
    var archiveInfo = this.archiveInfo = await archive.getInfo();

    // setup state
    this.title = opts.title || archiveInfo.title || '';
    this.description = opts.description || archiveInfo.description || '';
    this.type = opts.type;
    this.links = opts.links;
    this.networked = ('networked' in opts) ? opts.networked : true;
    this.isSelfFork = opts.isSelfFork;
    this.isProcessing = false;
    this.isDownloading = false;

    // listen to archive download progress
    this.progress = new ArchiveProgressMonitor(archive);
    this.progress.fetchAllStats().then(() => this.rerender());
    this.progress.on('changed', () => this.rerender());

    // render
    this.rerender();
  }

  // rendering
  // =

  render () {
    if (!this.archive || !this.archiveInfo) {
      return '' // loading
    }

    var archive = this.archive;
    var isComplete = this.archiveInfo.isOwner || this.progress.isComplete;
    var progressEl, downloadBtn;
    if (!isComplete) {
      // status/progress of download
      progressEl = yo`<div class="fork-dat-progress">
        ${this.progress.current > 0
          ? yo`<progress value=${this.progress.current} max="100"></progress>`
          : ''}
        Some files have not been downloaded, and will be missing from your copy.
      </div>`;
      if (!isComplete) {
        downloadBtn = yo`<button type="button" class="btn ${this.isDownloading ? 'disabled' : 'success'}" onclick=${e => this.onClickDownload(e)}>
          ${this.isDownloading ? '' : 'Finish'} Downloading Files
        </button>`;
      }
    } else {
      progressEl = yo`<div class="fork-dat-progress">Ready to copy.</div>`;
    }

    var helpText = '';
    if (this.isSelfFork) {
      helpText = yo`<p class="help-text">This archive wants to create a copy of itself.</p>`;
    }

    return yo`
      <div class="fork-archive-modal">
        <h1 class="title">Make a copy of ${renderArchiveTitle(this.archiveInfo, 'archive')}</h1>
        ${helpText}

        <form onsubmit=${e => this.onSubmit(e)}>
          <label for="title">Title</label>
          <input name="title" tabindex="2" value=${this.title} placeholder="Title" onchange=${e => this.onChangeTitle(e)} />

          <label for="desc">Description</label>
          <textarea name="desc" tabindex="3" placeholder="Description (optional)" onchange=${e => this.onChangeDescription(e)}>${this.description}</textarea>

          ${progressEl}
          <div class="form-actions">
            <button type="button" class="btn cancel" onclick=${e => this.onClickCancel(e)} tabindex="4" disabled=${this.isProcessing}>Cancel</button>
            <button type="submit" class="btn ${isComplete ? 'success' : ''}" tabindex="5" disabled=${this.isProcessing}>
              ${this.isProcessing
                ? yo`<span><span class="spinner"></span> Copying...</span>`
                : `Create copy ${!isComplete ? ' anyway' : ''}`}
            </button>
            ${downloadBtn}
          </div>
        </form>
      </div>`
  }

  // event handlers
  // =

  onChangeTitle (e) {
    this.title = e.target.value;
  }

  onChangeDescription (e) {
    this.description = e.target.value;
  }

  onClickCancel (e) {
    e.preventDefault();
    this.close(new Error('Canceled'));
  }

  onClickDownload (e) {
    e.preventDefault();
    this.archive.download();
    this.isDownloading = true;
    this.rerender();
  }

  async onSubmit (e) {
    e.preventDefault();
    if (this.isProcessing) return
    try {
      this.isProcessing = true;
      this.rerender();
      var newArchive = await DatArchive.fork(this.archiveInfo.key, {
        title: this.title,
        description: this.description,
        type: this.type,
        networked: this.networked,
        links: this.links,
        prompt: false
      });
      this.close(null, {url: newArchive.url});
    } catch (e) {
      this.close(e.message || e.toString());
    }
  }
}

// internal methods
// =

function renderArchiveTitle (archiveInfo, fallback) {
  var t = archiveInfo.title && `"${archiveInfo.title}"`;
  if (!t && fallback) t = fallback;
  if (!t) t = `${archiveInfo.key.slice(0, 8)}...`;
  if (t.length > 100) {
    t = t.slice(0, 96) + '..."';
  }
  return t
}

/* globals beaker DatArchive */

// exported api
// =

class SelectArchiveModal extends BaseModal {
  constructor (opts) {
    super(opts);

    this.currentFilter = '';
    this.selectedArchiveKey = '';
    this.archives = null;
    this.title = '';
    this.description = '';
    this.type = undefined;
    this.buttonLabel = opts.buttonLabel || 'Select';
    this.customTitle = opts.title || '';
    this.currentView = 'archivePicker';
    this.isFormDisabled = true;
    this.archives = [];

    this.setup(opts.filters);
  }

  async setup (filters) {
    // fetch archives
    this.archives = await beaker.archives.list({
      isSaved: true,
      isOwner: (filters && filters.isOwner),
      type: (filters && filters.type)
    });
    this.type = filters && filters.type;
    this.archives.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
    this.rerender();
  }

  // rendering
  // =

  render () {
    return yo`
      <div class="select-archive-modal">
        ${this.renderActiveViewContent()}
      </div>`
  }

  renderActiveViewContent () {
    if (this.currentView === 'archivePicker') return this.renderSelectArchiveForm()
    else if (this.currentView === 'newArchive') return this.renderNewArchiveForm()
  }

  renderNewArchiveForm () {
    return yo`
      <form onsubmit=${e => this.onSubmit(e)}>
        <h1 class="title">${this.customTitle || 'Select an archive'}</h1>
        <div class="view create-archive">
          <label for="title">Title</label>
          <input autofocus name="title" tabindex="2" value=${this.title || ''} placeholder="Title" onchange=${e => this.onChangeTitle(e)} />

          <label for="desc">Description</label>
          <textarea name="desc" tabindex="3" placeholder="Description (optional)" onchange=${e => this.onChangeDescription(e)}>${this.description || ''}</textarea>
        </div>

        <div class="form-actions">
          <div class="left">
            <button type="button" onclick=${e => this.onUpdateActiveView(e)} data-content="archivePicker" class="btn">
              <i class="fa fa-caret-left"></i> Back
            </button>
          </div>
          <div class="right">
            <button type="button" onclick=${e => this.onClickCancel(e)} class="btn cancel" tabindex="4">Cancel</button>
            <button type="submit" class="btn" tabindex="5">
              Create
            </button>
          </div>
        </div>
      </form>`
  }

  renderSelectArchiveForm () {
    return yo`
      <form onsubmit=${e => this.onSubmit(e)}>
        <h1 class="title">${this.customTitle || 'Select an archive'}</h1>

        ${this.renderArchivePicker()}

        <div class="form-actions">
          <div class="left">
            <button type="button" onclick=${e => this.onUpdateActiveView(e)} data-content="newArchive" class="btn">
              Create new archive
            </button>
          </div>
          <div class="right">
            <button type="button" onclick=${e => this.onClickCancel(e)} class="btn cancel" tabindex="4">Cancel</button>
            <button disabled=${this.isFormDisabled ? 'disabled' : 'false'} type="submit" class="btn" tabindex="5">
              ${this.buttonLabel}
            </button>
          </div>
        </div>
      </form>`
  }

  renderArchivePicker () {
    if (!this.archives.length) {
      return 'No archives'
    }

    return yo`
      <div class="view archive-picker">
        <div class="filter-container">
          <i class="fa fa-search"></i>
          <input autofocus onkeyup=${e => this.onChangeFilter(e)} id="filter" class="filter" type="text" placeholder="Search"/>
        </div>
        ${this.renderArchivesList()}
      </div>
    `
  }

  renderArchivesList () {
    var filtered = this.archives;
    if (this.currentFilter) {
      filtered = filtered.filter(a => a.title && a.title.toLowerCase().includes(this.currentFilter));
    }

    return yo`<ul class="archives-list">${filtered.map(a => this.renderArchive(a))}</ul>`
  }

  renderArchive (archive) {
    var isSelected = this.selectedArchiveKey === archive.key;
    return yo`
      <li
        class="archive ${isSelected ? 'selected' : ''}"
        onclick=${e => this.onChangeSelectedArchive(e)}
        ondblclick=${e => this.onDblClickArchive(e)}
        data-key=${archive.key}
      >
        <div class="info">
          <img class="favicon" src="beaker-favicon:${archive.url}" />

          <span class="title" title="${archive.title} ${archive.isOwner ? '' : '(Read-only)'}">
            ${archive.title || 'Untitled'}
          </span>

          ${archive.isOwner ? '' : yo`<span class="readonly">read-only</span>`}

          <span class="hash">${shortenHash(archive.url)}</span>
        </div>
      </li>
    `
  }

  // event handlers
  // =

  onChangeTitle (e) {
    this.selectedArchiveKey = '';
    this.title = e.target.value;
  }

  onChangeDescription (e) {
    this.selectedArchiveKey = '';
    this.description = e.target.value;
  }

  onClickCancel (e) {
    e.preventDefault();
    this.close(new Error('Canceled'));
  }

  onChangeFilter (e) {
    this.currentFilter = e.target.value.toLowerCase();
    this.rerender();
  }

  onChangeSelectedArchive (e) {
    this.isFormDisabled = false;
    this.selectedArchiveKey = e.currentTarget.dataset.key;
    this.rerender();
  }

  onDblClickArchive (e) {
    e.preventDefault();
    this.selectedArchiveKey = e.currentTarget.dataset.key;
    this.onSubmit();
  }

  onUpdateActiveView (e) {
    this.currentView = e.target.dataset.content;
    this.rerender();
  }

  async onSubmit (e) {
    if (e) e.preventDefault();
    if (!this.selectedArchiveKey) {
      try {
        var newArchive = await DatArchive.create({
          title: this.title,
          description: this.description,
          type: this.type,
          prompt: false
        });
        this.close(null, {url: newArchive.url});
      } catch (e) {
        this.close(e.message || e.toString());
      }
    } else {
      this.close(null, {url: `dat://${this.selectedArchiveKey}/`});
    }
  }
}

// must include modals here for them to be callable from the background-process
var ModalClasses = {
  example: ExampleModal,
  'create-archive': CreateArchiveModal,
  'fork-archive': ForkArchiveModal,
  'select-archive': SelectArchiveModal
};

// globals
// =

var modalsDiv = document.querySelector('#modals');

// exported functions
// =

function setup$4 () {
  document.body.addEventListener('keydown', onGlobalKeydown$1);
}

function createContainer$1 (id) {
  // render
  var el = render$7(id, null);
  modalsDiv.append(el);
  return el
}

function destroyContainer$1 (id) {
  var el = document.querySelector(`#modals .modal-container[data-id="${id}"]`);
  if (el) el.remove();
}

async function createFromBackgroundProcess (reqId, webContentsId, modalId, opts) {
  var cb = (err, res) => electron.ipcRenderer.send('modal-response', reqId, err && err.message ? err.message : err, res);

  // look up the page
  var page = getByWebContentsID(webContentsId);
  if (!page) return cb('Page not available')

  // lookup the modal
  var ModalClass = ModalClasses[modalId];
  if (!ModalClass) return cb('Modal not available')

  // run the modal
  var modalInst = new (ModalClass)(opts);
  modalInst.on('close', cb);
  add$1(page, modalInst);
}

function add$1 (page, modalInst) {
  // add the modal
  page.modals.push(modalInst);
  update$3(page);

  // wire up events
  modalInst.on('rerender', () => update$3(page));
  modalInst.on('close', () => remove$2(page, modalInst));

  return true
}

function remove$2 (page, modalInst) {
  if (!page || !page.modals) { return } // page no longer exists

  // find and remove
  var i = page.modals.indexOf(modalInst);
  if (i !== -1) {
    page.modals.splice(i, 1);
    update$3(page);
  }
}

function forceRemoveAll$1 (page) {
  if (!page || !page.modals) { return } // page no longer exists

  // find and remove
  page.modals.forEach(m => {
    m.close(new Error('Closed'));
  });
  page.modals = [];
  update$3(page);
}

function update$3 (page) {
  // fetch current page, if not given
  page = page || getActive();
  if (!page.webviewEl) return

  // render
  yo__default.update(page.modalEl, render$7(page.id, page));
}

// internal methods
// =

function render$7 (id, page) {
  if (!page) { return yo__default`<div data-id=${id} class="modal-container hidden"></div>` }

  return yo__default`<div data-id=${id} class="modal-container ${page.isActive ? '' : 'hidden'}">
    ${page.modals.map(modal => yo__default`<div class="modal">${modal.render()}</div>`)}
  </div>`
}

function onGlobalKeydown$1 (e) {
  if (e.key === 'Escape') {
    // close any active modals
    forceRemoveAll$1(getActive());
  }
}

var statusEl;
var isLoading = false;
var currentStr;
var zoneLimits;
var wasNearOurCorner = false;

function setup$5 () {
  statusEl = document.getElementById('statusbar');
  captureWindowRect();
  window.addEventListener('resize', captureWindowRect);
  document.body.addEventListener('mousemove', onMouseMove);
}

function set (str) {
  currentStr = str;
  render$8();
}

function setIsLoading (b) {
  isLoading = b;
  render$8();
}

function render$8 () {
  var str = currentStr;
  if (!str && isLoading) { str = 'Loading...'; }

  if (str) {
    statusEl.classList.remove('hidden');
    statusEl.textContent = str;
  } else { statusEl.classList.add('hidden'); }
}

function captureWindowRect (e) {
  var windowRect = document.body.getClientRects()[0];
  zoneLimits = {
    x: windowRect.right / 2,
    y: windowRect.bottom - 40
  };
}

function onMouseMove (e) {
  // check if the mouse is near our corner
  var isNearOurCorner = false;
  if (e.clientY >= zoneLimits.y && e.clientX < zoneLimits.x) {
    isNearOurCorner = true;
  }

  if (isNearOurCorner && !wasNearOurCorner) {
    // move to the right
    statusEl.classList.add('right');
  } else if (!isNearOurCorner && wasNearOurCorner) {
    // move back to the left
    statusEl.classList.remove('right');
  }

  wasNearOurCorner = isNearOurCorner;
}

function render$9 () {
  return render$3(`
    <svg class="icon padlock" width="180px" height="221px" viewBox="0 0 180 221" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
      <g stroke="none" stroke-width="1" fill="none" fill-rule="evenodd">
        <g id="padlock" transform="translate(0.000000, 13.000000)">
          <rect id="bottom" fill-fill="#000000" x="0" y="89" width="180" height="119" rx="8"/>
          <path id="top" d="M32.9765625,89.125 C32.9704162,88.7923789 33,55.3340372 33,55 C33,24.6243388 58.5197693,0 90,0 C121.480231,0 147,24.6243388 147,55 C147,55.3340372 146.144818,88.9427695 146.138672,89.2753906" stroke="#000000" stroke-width="25"/>
        </g>
      </g>
    </svg>
  `)
}

/* globals DatArchive */

// front-end only:
var yo$1;
if (typeof document !== 'undefined') {
  yo$1 = require('yo-yo');
}

// HACK
// this is the best way I could figure out for pulling in the dat title, given the current perms flow
// not ideal but it works
// (note the in memory caching)
// -prf
var datTitleMap = {};
function lazyDatTitleElement (archiveKey, title) {
  // if we have the title, render now
  if (title) return title
  if (archiveKey in datTitleMap) return datTitleMap[archiveKey] // pull from cache

  // no title, we need to look it up. render now, then update
  var el = yo$1`<span class="link">${prettyHash(archiveKey)}</span>`;
  el.id = 'lazy-' + archiveKey
  ;(new DatArchive(archiveKey)).getInfo().then(details => {
    datTitleMap[archiveKey] = details.title; // cache
    el.textContent = details.title; // render
  });
  return el
}

var PERMS = {
  js: {
    desc: 'Run Javascript',
    icon: 'code',
    persist: true,
    alwaysDisallow: false,
    requiresRefresh: true,
    experimental: false
  },
  network: {
    desc: param => {
      if (param === '*') return 'Access the network freely'
      return 'contact ' + param
    },
    icon: 'cloud',
    persist: true,
    alwaysDisallow: false,
    requiresRefresh: true,
    experimental: false
  },
  createDat: {
    desc: (param, pages, opts = {}) => {
      if (opts && opts.title) return `Create a new Dat archive, "${opts.title}"`
      return 'Create a new Dat archive'
    },
    icon: 'folder',
    persist: false,
    alwaysDisallow: false,
    requiresRefresh: false,
    experimental: false
  },
  modifyDat: {
    desc: (param, pages, opts = {}) => {
      const firstWord = opts.capitalize ? 'Write' : 'write';
      const title = lazyDatTitleElement(param, opts.title);
      const viewArchive = () => pages.setActive(pages.create('beaker://library/' + param));
      return yo$1`<span>${firstWord} files to <a onclick=${viewArchive}>${title}</a></span>`
    },
    icon: 'folder',
    persist: 'allow', // dont persist 'deny'
    alwaysDisallow: false,
    requiresRefresh: false,
    experimental: false
  },
  deleteDat: {
    desc: (param, pages, opts = {}) => {
      const firstWord = opts.capitalize ? 'Delete' : 'delete';
      const title = lazyDatTitleElement(param, opts.title);
      const viewArchive = () => pages.setActive(pages.create('beaker://library/' + param));
      return yo$1`<span>${firstWord} the archive <a onclick=${viewArchive}>${title}</a></span>`
    },
    icon: 'folder',
    persist: false,
    alwaysDisallow: false,
    requiresRefresh: false,
    experimental: false
  },
  media: {
    desc: 'Use your camera and microphone',
    icon: 'video-camera',
    persist: true,
    alwaysDisallow: false,
    requiresRefresh: false,
    experimental: false
  },
  geolocation: {
    desc: 'Know your location',
    icon: 'map-marker',
    persist: false,
    alwaysDisallow: true, // NOTE geolocation is disabled, right now
    requiresRefresh: false,
    experimental: false
  },
  notifications: {
    desc: 'Create desktop notifications',
    icon: 'bell',
    persist: true,
    alwaysDisallow: false,
    requiresRefresh: false,
    experimental: false
  },
  midiSysex: {
    desc: 'Access your MIDI devices',
    icon: 'headphones',
    persist: false,
    alwaysDisallow: false,
    requiresRefresh: false,
    experimental: false
  },
  pointerLock: {
    desc: 'Lock your cursor',
    icon: 'mouse-pointer',
    persist: false,
    alwaysDisallow: false,
    requiresRefresh: false,
    experimental: false
  },
  fullscreen: {
    desc: 'Go fullscreen',
    icon: 'arrows-alt',
    persist: true,
    alwaysAllow: true,
    requiresRefresh: false,
    experimental: false
  },
  openExternal: {
    desc: 'Open this URL in another program: ',
    icon: 'external-link',
    persist: false,
    alwaysDisallow: false,
    requiresRefresh: false,
    experimental: false
  },
  experimentalLibrary: {
    desc: 'Read and modify your Library',
    icon: 'book',
    persist: true,
    alwaysDisallow: false,
    requiresRefresh: false,
    experimental: true
  },
  experimentalLibraryRequestAdd: {
    desc: (param, pages, opts = {}) => {
      const title = lazyDatTitleElement(param);
      const viewArchive = () => pages.setActive(pages.create('beaker://library/' + param));
      return yo$1`<span>Seed <a onclick=${viewArchive}>${title}</a></span>`
    },
    icon: 'upload',
    persist: false,
    alwaysDisallow: false,
    requiresRefresh: false,
    experimental: true
  },
  experimentalLibraryRequestRemove: {
    desc: (param, pages, opts = {}) => {
      const title = lazyDatTitleElement(param);
      const viewArchive = () => pages.setActive(pages.create('beaker://library/' + param));
      return yo$1`<span>Stop seeding <a onclick=${viewArchive}>${title}</a></span>`
    },
    icon: 'times',
    persist: false,
    alwaysDisallow: false,
    requiresRefresh: false,
    experimental: true
  },
  experimentalGlobalFetch: {
    desc: (param, pages, opts = {}) => {
      const viewPage = () => pages.setActive(pages.create(param));
      return yo$1`<span>Fetch data from <a onclick=${viewPage}>${param}</a></span>`
    },
    icon: 'download',
    persist: true,
    alwaysDisallow: false,
    requiresRefresh: false,
    experimental: true
  }
};

/* globals beaker */

class SiteInfoNavbarBtn {
  constructor (page) {
    this.isDropdownOpen = false;
    this.page = page;
    window.addEventListener('click', e => this.onClickAnywhere(e)); // close dropdown on click outside
    on('set-active', e => this.closeDropdown()); // close dropdown on tab change
  }

  render () {
    // pull details
    var iconEl = '';
    var protocolCls = 'insecure';
    const gotInsecureResponse = this.page.siteLoadError && this.page.siteLoadError.isInsecureResponse;
    const isLoading = this.page.isLoading();

    const scheme = (isLoading) ? (this.page.getIntendedURL().split(':').shift() + ':') : this.page.protocolInfo.scheme;
    if (scheme) {
      const isHttps = scheme === 'https:';
      if (isHttps && !gotInsecureResponse && !this.page.siteLoadError) {
        protocolCls = 'secure';
        iconEl = render$9();
      } else if (scheme === 'http:') {
        iconEl = yo`<i class="fa fa-info-circle"></i>`;
      } else if (isHttps && gotInsecureResponse) {
        iconEl = yo`<i class="fa fa-exclamation-circle"></i>`;
      } else if (scheme === 'dat:') {
        protocolCls = 'p2p';
        iconEl = yo`<i class="fa fa-share-alt"></i>`;
      } else if (scheme === 'beaker:') {
        protocolCls = 'beaker';
        iconEl = '';
      }
    }

    return yo`
      <div class="toolbar-site-info ${protocolCls}" id="${this.elId}">
        <button onclick=${isLoading ? undefined : e => this.toggleDropdown(e)}>${iconEl}</button>
        ${this.renderDropdown()}
      </div>
    `
  }

  renderDropdown () {
    if (!this.isDropdownOpen) {
      return ''
    }

    // pull details
    var protocolDesc = '';
    if (this.page.protocolInfo) {
      if (this.page.protocolInfo.scheme === 'https:') {
        protocolDesc = 'Your connection to this site is secure.';
      } else if (this.page.protocolInfo.scheme === 'http:') {
        protocolDesc = yo`
          <div>
            <p>
              Your connection to this site is not secure.
            </p>
            <small>
              You should not enter any sensitive information on this site (for example, passwords or credit cards), because it could be stolen by attackers.
            </small>
          </div>
        `;
      } else if (this.page.protocolInfo.scheme === 'dat:') {
        protocolDesc = yo`
          <div>
            This site was downloaded from a secure peer-to-peer network.
            <a onclick=${e => this.learnMore()}>Learn More</a>
          </div>`;
      }
    }

    // site permissions
    var permsEls = [];
    if (this.page.sitePerms) {
      for (var k in this.page.sitePerms) {
        permsEls.push(this.renderPerm(k, this.page.sitePerms[k]));
      }
    }
    if (this.page.siteInfo && this.page.siteInfo.requiresRefresh) {
      permsEls.push(
        yo`
          <div class="perm"><a>
            <label class="checked" onclick=${this.onClickRefresh.bind(this)}>
              <i class="fa fa-undo fa-flip-horizontal"></i>
              Refresh to apply changes.
            </label>
          </a></div>
        `
      );
    }

    // dropdown
    return yo`
      <div class="dropdown toolbar-dropdown toolbar-site-info-dropdown">
        <div class="dropdown-items with-triangle left">
          <div class="details">
            <div class="details-title">
              ${this.getTitle() || this.getHostname() || this.getUrl()}
            </div>
            <p class="details-desc">
              ${protocolDesc}
            </p>
          </div>
          ${permsEls.length ? yo`<h2 class="perms-heading">Permissions</h2>` : ''}
          <div class="perms">${permsEls}</div>
        </div>
      </div>`
  }

  getTitle () {
    var title = '';
    if (this.page.siteInfoOverride && this.page.siteInfoOverride.title) {
      title = this.page.siteInfoOverride.title;
    } else if (this.page.siteInfo && this.page.siteInfo.title) {
      title = this.page.siteInfo.title;
    } else if (this.page.protocolInfo && this.page.protocolInfo.scheme === 'dat:') {
      title = 'Untitled';
    }
    return title
  }

  getUrl () {
    return (this.page.protocolInfo) ? this.page.protocolInfo.url : ''
  }

  getHostname () {
    return (this.page.protocolInfo) ? this.page.protocolInfo.hostname : ''
  }

  get elId () {
    return 'toolbar-site-info-' + this.page.id
  }

  updateActives () {
    yo.update(document.getElementById(this.elId), this.render());
  }

  onClickAnywhere (e) {
    if (!this.isDropdownOpen) return
    // close the dropdown if not a click within the dropdown
    if (findParent(e.target, 'toolbar-site-info-dropdown')) return
    this.closeDropdown();
  }

  onClickRefresh () {
    this.page.reload();
    this.closeDropdown();
  }

  closeDropdown () {
    if (this.isDropdownOpen) {
      this.isDropdownOpen = false;
      this.updateActives();
    }
  }

  toggleDropdown (e) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    this.isDropdownOpen = !this.isDropdownOpen;
    this.updateActives();
  }

  renderPerm (perm, value) {
    const permId = getPermId(perm);
    const permParam = getPermParam(perm);
    var icon = PERMS[permId] ? PERMS[permId].icon : '';
    var desc = PERMS[permId] ? PERMS[permId].desc : '';
    if (typeof desc === 'function') desc = desc(permParam, pages$1, { capitalize: true });
    if (typeof desc === 'string') desc = ucfirst(desc);
    if (!desc) return ''
    return yo`
      <div class="perm">
        <label class=${value ? 'checked' : ''} onclick=${e => this.togglePerm(perm)}>
          <i class="fa fa-${icon}"></i>
          ${desc}
          <input type="checkbox" value="${perm}" ${value ? 'checked' : ''} />
        </label>
      </div>`
  }

  togglePerm (perm) {
    // update perm
    var newValue = (this.page.sitePerms[perm] === 1) ? 0 : 1;
    beaker.sitedata.setPermission(this.page.protocolInfo.url, perm, newValue).then(() => {
      this.page.sitePerms[perm] = newValue;

      // requires refresh?
      const permId = getPermId(perm);
      this.page.siteInfo.requiresRefresh = (PERMS[permId] && PERMS[permId].requiresRefresh);

      // rerender
      this.updateActives();
    });
  }

  openLink (e) {
    e.preventDefault();
    setActive(create$$1(e.target.getAttribute('href')));
    this.closeDropdown();
  }

  learnMore () {
    setActive(create$$1('https://github.com/beakerbrowser/beaker/wiki/Is-Dat-%22Secure-P2P%3F%22'));
  }
}

/*!
 * Color Thief v2.0
 * by Lokesh Dhakar - http://www.lokeshdhakar.com
 *
 * Thanks
 * ------
 * Nick Rabinowitz - For creating quantize.js.
 * John Schulz - For clean up and optimization. @JFSIII
 * Nathan Spady - For adding drag and drop support to the demo page.
 *
 * License
 * -------
 * Copyright 2011, 2015 Lokesh Dhakar
 * Released under the MIT license
 * https://raw.githubusercontent.com/lokesh/color-thief/master/LICENSE
 *
 */

/*
  CanvasImage Class
  Class that wraps the html image element and canvas.
  It also simplifies some of the canvas context manipulation
  with a set of helper functions.
*/
var CanvasImage = function (image) {
  this.canvas = document.createElement('canvas');
  this.context = this.canvas.getContext('2d');

  document.body.appendChild(this.canvas);

  this.width = this.canvas.width = image.width;
  this.height = this.canvas.height = image.height;

  this.context.drawImage(image, 0, 0, this.width, this.height);
};

CanvasImage.prototype.clear = function () {
  this.context.clearRect(0, 0, this.width, this.height);
};

CanvasImage.prototype.update = function (imageData) {
  this.context.putImageData(imageData, 0, 0);
};

CanvasImage.prototype.getPixelCount = function () {
  return this.width * this.height
};

CanvasImage.prototype.getImageData = function () {
  return this.context.getImageData(0, 0, this.width, this.height)
};

CanvasImage.prototype.removeCanvas = function () {
  this.canvas.parentNode.removeChild(this.canvas);
};

var ColorThief = function () {};

/*
 * getColor(sourceImage[, quality])
 * returns {r: num, g: num, b: num}
 *
 * Use the median cut algorithm provided by quantize.js to cluster similar
 * colors and return the base color from the largest cluster.
 *
 * Quality is an optional argument. It needs to be an integer. 1 is the highest quality settings.
 * 10 is the default. There is a trade-off between quality and speed. The bigger the number, the
 * faster a color will be returned but the greater the likelihood that it will not be the visually
 * most dominant color.
 *
 * */
ColorThief.prototype.getColor = function (sourceImage, quality) {
  var palette = this.getPalette(sourceImage, 5, quality);
  var dominantColor = palette[0];
  return dominantColor
};

ColorThief.prototype.getPalette = function (sourceImage, quality) {
  return this.getPalette(sourceImage, 5, quality)
};

/*
 * getPalette(sourceImage[, colorCount, quality])
 * returns array[ {r: num, g: num, b: num}, {r: num, g: num, b: num}, ...]
 *
 * Use the median cut algorithm provided by quantize.js to cluster similar colors.
 *
 * colorCount determines the size of the palette; the number of colors returned. If not set, it
 * defaults to 10.
 *
 * BUGGY: Function does not always return the requested amount of colors. It can be +/- 2.
 *
 * quality is an optional argument. It needs to be an integer. 1 is the highest quality settings.
 * 10 is the default. There is a trade-off between quality and speed. The bigger the number, the
 * faster the palette generation but the greater the likelihood that colors will be missed.
 *
 *
 */
ColorThief.prototype.getPalette = function (sourceImage, colorCount, quality) {
  if (typeof colorCount === 'undefined') {
    colorCount = 10;
  }
  if (typeof quality === 'undefined' || quality < 1) {
    quality = 10;
  }

  // Create custom CanvasImage object
  var image = new CanvasImage(sourceImage);
  var imageData = image.getImageData();
  var pixels = imageData.data;
  var pixelCount = image.getPixelCount();

  // Store the RGB values in an array format suitable for quantize function
  var pixelArray = [];
  for (var i = 0, offset, r, g, b, a; i < pixelCount; i = i + quality) {
    offset = i * 4;
    r = pixels[offset + 0];
    g = pixels[offset + 1];
    b = pixels[offset + 2];
    a = pixels[offset + 3];
    // If pixel is mostly opaque and not white
    if (a >= 125) {
      if (!(r > 250 && g > 250 && b > 250)) {
        pixelArray.push([r, g, b]);
      }
    }
  }

  // Send array to quantize function which clusters values
  // using median cut algorithm
  var cmap = MMCQ.quantize(pixelArray, colorCount);
  var palette = cmap ? cmap.palette() : null;

  // Clean up
  image.removeCanvas();

  return palette
};

/*!
 * quantize.js Copyright 2008 Nick Rabinowitz.
 * Licensed under the MIT license: http://www.opensource.org/licenses/mit-license.php
 */

// fill out a couple protovis dependencies
/*!
 * Block below copied from Protovis: http://mbostock.github.com/protovis/
 * Copyright 2010 Stanford Visualization Group
 * Licensed under the BSD License: http://www.opensource.org/licenses/bsd-license.php
 */
if (!pv) {
  var pv = {
    map: function (array, f) {
      var o = {};
      return f ? array.map(function (d, i) { o.index = i; return f.call(o, d) }) : array.slice()
    },
    naturalOrder: function (a, b) {
      return (a < b) ? -1 : ((a > b) ? 1 : 0)
    },
    sum: function (array, f) {
      var o = {};
      return array.reduce(f ? function (p, d, i) { o.index = i; return p + f.call(o, d) } : function (p, d) { return p + d }, 0)
    },
    max: function (array, f) {
      return Math.max.apply(null, f ? pv.map(array, f) : array)
    }
  };
}

/**
 * Basic Javascript port of the MMCQ (modified median cut quantization)
 * algorithm from the Leptonica library (http://www.leptonica.com/).
 * Returns a color map you can use to map original pixels to the reduced
 * palette. Still a work in progress.
 *
 * @author Nick Rabinowitz
 * @example

// array of pixels as [R,G,B] arrays
var myPixels = [[190,197,190], [202,204,200], [207,214,210], [211,214,211], [205,207,207]
                // etc
                ];
var maxColors = 4;

var cmap = MMCQ.quantize(myPixels, maxColors);
var newPalette = cmap.palette();
var newPixels = myPixels.map(function(p) {
    return cmap.map(p);
});

 */
var MMCQ = (function () {
  // private constants
  var sigbits = 5,
    rshift = 8 - sigbits,
    maxIterations = 1000,
    fractByPopulations = 0.75;

    // get reduced-space color index for a pixel
  function getColorIndex (r, g, b) {
    return (r << (2 * sigbits)) + (g << sigbits) + b
  }

  // Simple priority queue
  function PQueue (comparator) {
    var contents = [],
      sorted = false;

    function sort () {
      contents.sort(comparator);
      sorted = true;
    }

    return {
      push: function (o) {
        contents.push(o);
        sorted = false;
      },
      peek: function (index) {
        if (!sorted) sort();
        if (index === undefined) index = contents.length - 1;
        return contents[index]
      },
      pop: function () {
        if (!sorted) sort();
        return contents.pop()
      },
      size: function () {
        return contents.length
      },
      map: function (f) {
        return contents.map(f)
      },
      debug: function () {
        if (!sorted) sort();
        return contents
      }
    }
  }

  // 3d color space box
  function VBox (r1, r2, g1, g2, b1, b2, histo) {
    var vbox = this;
    vbox.r1 = r1;
    vbox.r2 = r2;
    vbox.g1 = g1;
    vbox.g2 = g2;
    vbox.b1 = b1;
    vbox.b2 = b2;
    vbox.histo = histo;
  }
  VBox.prototype = {
    volume: function (force) {
      var vbox = this;
      if (!vbox._volume || force) {
        vbox._volume = ((vbox.r2 - vbox.r1 + 1) * (vbox.g2 - vbox.g1 + 1) * (vbox.b2 - vbox.b1 + 1));
      }
      return vbox._volume
    },
    count: function (force) {
      var vbox = this,
        histo = vbox.histo,
        index = 0;
      if (!vbox._count_set || force) {
        var npix = 0,
          i, j, k;
        for (i = vbox.r1; i <= vbox.r2; i++) {
          for (j = vbox.g1; j <= vbox.g2; j++) {
            for (k = vbox.b1; k <= vbox.b2; k++) {
              index = getColorIndex(i, j, k);
              npix += (histo[index] || 0);
            }
          }
        }
        vbox._count = npix;
        vbox._count_set = true;
      }
      return vbox._count
    },
    copy: function () {
      var vbox = this;
      return new VBox(vbox.r1, vbox.r2, vbox.g1, vbox.g2, vbox.b1, vbox.b2, vbox.histo)
    },
    avg: function (force) {
      var vbox = this,
        histo = vbox.histo;
      if (!vbox._avg || force) {
        var ntot = 0,
          mult = 1 << (8 - sigbits),
          rsum = 0,
          gsum = 0,
          bsum = 0,
          hval,
          i, j, k, histoindex;
        for (i = vbox.r1; i <= vbox.r2; i++) {
          for (j = vbox.g1; j <= vbox.g2; j++) {
            for (k = vbox.b1; k <= vbox.b2; k++) {
              histoindex = getColorIndex(i, j, k);
              hval = histo[histoindex] || 0;
              ntot += hval;
              rsum += (hval * (i + 0.5) * mult);
              gsum += (hval * (j + 0.5) * mult);
              bsum += (hval * (k + 0.5) * mult);
            }
          }
        }
        if (ntot) {
          vbox._avg = [~~(rsum / ntot), ~~(gsum / ntot), ~~(bsum / ntot)];
        } else {
          //                    console.log('empty box');
          vbox._avg = [
            ~~(mult * (vbox.r1 + vbox.r2 + 1) / 2),
            ~~(mult * (vbox.g1 + vbox.g2 + 1) / 2),
            ~~(mult * (vbox.b1 + vbox.b2 + 1) / 2)
          ];
        }
      }
      return vbox._avg
    },
    contains: function (pixel) {
      var vbox = this,
        rval = pixel[0] >> rshift;
      gval = pixel[1] >> rshift;
      bval = pixel[2] >> rshift;
      return (rval >= vbox.r1 && rval <= vbox.r2 &&
                    gval >= vbox.g1 && gval <= vbox.g2 &&
                    bval >= vbox.b1 && bval <= vbox.b2)
    }
  };

  // Color map
  function CMap () {
    this.vboxes = new PQueue(function (a, b) {
      return pv.naturalOrder(
        a.vbox.count() * a.vbox.volume(),
        b.vbox.count() * b.vbox.volume()
      )
    });
  }
  CMap.prototype = {
    push: function (vbox) {
      this.vboxes.push({
        vbox: vbox,
        color: vbox.avg()
      });
    },
    palette: function () {
      return this.vboxes.map(function (vb) { return vb.color })
    },
    size: function () {
      return this.vboxes.size()
    },
    map: function (color) {
      var vboxes = this.vboxes;
      for (var i = 0; i < vboxes.size(); i++) {
        if (vboxes.peek(i).vbox.contains(color)) {
          return vboxes.peek(i).color
        }
      }
      return this.nearest(color)
    },
    nearest: function (color) {
      var vboxes = this.vboxes,
        d1, d2, pColor;
      for (var i = 0; i < vboxes.size(); i++) {
        d2 = Math.sqrt(
          Math.pow(color[0] - vboxes.peek(i).color[0], 2) +
                    Math.pow(color[1] - vboxes.peek(i).color[1], 2) +
                    Math.pow(color[2] - vboxes.peek(i).color[2], 2)
        );
        if (d2 < d1 || d1 === undefined) {
          d1 = d2;
          pColor = vboxes.peek(i).color;
        }
      }
      return pColor
    },
    forcebw: function () {
      // XXX: won't  work yet
      var vboxes = this.vboxes;
      vboxes.sort(function (a, b) { return pv.naturalOrder(pv.sum(a.color), pv.sum(b.color)) });

      // force darkest color to black if everything < 5
      var lowest = vboxes[0].color;
      if (lowest[0] < 5 && lowest[1] < 5 && lowest[2] < 5) { vboxes[0].color = [0, 0, 0]; }

      // force lightest color to white if everything > 251
      var idx = vboxes.length - 1,
        highest = vboxes[idx].color;
      if (highest[0] > 251 && highest[1] > 251 && highest[2] > 251) { vboxes[idx].color = [255, 255, 255]; }
    }
  };

  // histo (1-d array, giving the number of pixels in
  // each quantized region of color space), or null on error
  function getHisto (pixels) {
    var histosize = 1 << (3 * sigbits),
      histo = new Array(histosize),
      index, rval, gval, bval;
    pixels.forEach(function (pixel) {
      rval = pixel[0] >> rshift;
      gval = pixel[1] >> rshift;
      bval = pixel[2] >> rshift;
      index = getColorIndex(rval, gval, bval);
      histo[index] = (histo[index] || 0) + 1;
    });
    return histo
  }

  function vboxFromPixels (pixels, histo) {
    var rmin = 1000000, rmax = 0,
      gmin = 1000000, gmax = 0,
      bmin = 1000000, bmax = 0,
      rval, gval, bval;
    // find min/max
    pixels.forEach(function (pixel) {
      rval = pixel[0] >> rshift;
      gval = pixel[1] >> rshift;
      bval = pixel[2] >> rshift;
      if (rval < rmin) rmin = rval;
      else if (rval > rmax) rmax = rval;
      if (gval < gmin) gmin = gval;
      else if (gval > gmax) gmax = gval;
      if (bval < bmin) bmin = bval;
      else if (bval > bmax) bmax = bval;
    });
    return new VBox(rmin, rmax, gmin, gmax, bmin, bmax, histo)
  }

  function medianCutApply (histo, vbox) {
    if (!vbox.count()) return

    var rw = vbox.r2 - vbox.r1 + 1,
      gw = vbox.g2 - vbox.g1 + 1,
      bw = vbox.b2 - vbox.b1 + 1,
      maxw = pv.max([rw, gw, bw]);
    // only one pixel, no split
    if (vbox.count() == 1) {
      return [vbox.copy()]
    }
    /* Find the partial sum arrays along the selected axis. */
    var total = 0,
      partialsum = [],
      lookaheadsum = [],
      i, j, k, sum, index;
    if (maxw == rw) {
      for (i = vbox.r1; i <= vbox.r2; i++) {
        sum = 0;
        for (j = vbox.g1; j <= vbox.g2; j++) {
          for (k = vbox.b1; k <= vbox.b2; k++) {
            index = getColorIndex(i, j, k);
            sum += (histo[index] || 0);
          }
        }
        total += sum;
        partialsum[i] = total;
      }
    } else if (maxw == gw) {
      for (i = vbox.g1; i <= vbox.g2; i++) {
        sum = 0;
        for (j = vbox.r1; j <= vbox.r2; j++) {
          for (k = vbox.b1; k <= vbox.b2; k++) {
            index = getColorIndex(j, i, k);
            sum += (histo[index] || 0);
          }
        }
        total += sum;
        partialsum[i] = total;
      }
    } else { /* maxw == bw */
      for (i = vbox.b1; i <= vbox.b2; i++) {
        sum = 0;
        for (j = vbox.r1; j <= vbox.r2; j++) {
          for (k = vbox.g1; k <= vbox.g2; k++) {
            index = getColorIndex(j, k, i);
            sum += (histo[index] || 0);
          }
        }
        total += sum;
        partialsum[i] = total;
      }
    }
    partialsum.forEach(function (d, i) {
      lookaheadsum[i] = total - d;
    });
    function doCut (color) {
      var dim1 = color + '1',
        dim2 = color + '2',
        left, right, vbox1, vbox2, d2, count2 = 0;
      for (i = vbox[dim1]; i <= vbox[dim2]; i++) {
        if (partialsum[i] > total / 2) {
          vbox1 = vbox.copy();
          vbox2 = vbox.copy();
          left = i - vbox[dim1];
          right = vbox[dim2] - i;
          if (left <= right) { d2 = Math.min(vbox[dim2] - 1, ~~(i + right / 2)); } else d2 = Math.max(vbox[dim1], ~~(i - 1 - left / 2));
          // avoid 0-count boxes
          while (!partialsum[d2]) d2++;
          count2 = lookaheadsum[d2];
          while (!count2 && partialsum[d2 - 1]) count2 = lookaheadsum[--d2];
          // set dimensions
          vbox1[dim2] = d2;
          vbox2[dim1] = vbox1[dim2] + 1;
          //                    console.log('vbox counts:', vbox.count(), vbox1.count(), vbox2.count());
          return [vbox1, vbox2]
        }
      }
    }
    // determine the cut planes
    return maxw == rw ? doCut('r')
      : maxw == gw ? doCut('g')
        : doCut('b')
  }

  function quantize (pixels, maxcolors) {
    // short-circuit
    if (!pixels.length || maxcolors < 2 || maxcolors > 256) {
      //            console.log('wrong number of maxcolors');
      return false
    }

    // XXX: check color content and convert to grayscale if insufficient

    var histo = getHisto(pixels),
      histosize = 1 << (3 * sigbits);

    // check that we aren't below maxcolors already
    var nColors = 0;
    histo.forEach(function () { nColors++; });
    if (nColors <= maxcolors) {
      // XXX: generate the new colors from the histo and return
    }

    // get the beginning vbox from the colors
    var vbox = vboxFromPixels(pixels, histo),
      pq = new PQueue(function (a, b) { return pv.naturalOrder(a.count(), b.count()) });
    pq.push(vbox);

    // inner function to do the iteration
    function iter (lh, target) {
      var ncolors = 1,
        niters = 0,
        vbox;
      while (niters < maxIterations) {
        vbox = lh.pop();
        if (!vbox.count()) { /* just put it back */
          lh.push(vbox);
          niters++;
          continue
        }
        // do the cut
        var vboxes = medianCutApply(histo, vbox),
          vbox1 = vboxes[0],
          vbox2 = vboxes[1];

        if (!vbox1) {
          //                    console.log("vbox1 not defined; shouldn't happen!");
          return
        }
        lh.push(vbox1);
        if (vbox2) { /* vbox2 can be null */
          lh.push(vbox2);
          ncolors++;
        }
        if (ncolors >= target) return
        if (niters++ > maxIterations) {
          //                    console.log("infinite loop; perhaps too few pixels!");
          return
        }
      }
    }

    // first set of colors, sorted by population
    iter(pq, fractByPopulations * maxcolors);

    // Re-sort by the product of pixel occupancy times the size in color space.
    var pq2 = new PQueue(function (a, b) {
      return pv.naturalOrder(a.count() * a.volume(), b.count() * b.volume())
    });
    while (pq.size()) {
      pq2.push(pq.pop());
    }

    // next set - generate the median cuts using the (npix * vol) sorting.
    iter(pq2, maxcolors - pq2.size());

    // calculate the actual colors
    var cmap = new CMap();
    while (pq2.size()) {
      cmap.push(pq2.pop());
    }

    return cmap
  }

  return {
    quantize: quantize
  }
})();

/* globals Image */

// convert and resize an image url to a data url


// like urlToData, but loads all images and takes the one that fits the target dimensions best
async function urlsToData (urls) {
  // load all images
  var imgs = await Promise.all(urls.map(url => {
    return new Promise(resolve => {
      var img = new Image();
      img.onload = e => resolve(img);
      img.onerror = () => resolve(false);
      img.src = url;
    })
  }));

  // filter out failures and abort if none loaded
  imgs = imgs.filter(Boolean);
  if (!imgs.length) {
    return false
  }

  // choose the image with the closest dimensions to our target
  var bestImg = imgs[0];
  for (var i = 1; i < imgs.length; i++) {
    if (imgs[i].width > bestImg.width && imgs[i].height > bestImg.height) {
      bestImg = imgs[i];
    }
  }
  return {
    url: bestImg.src,
    dataUrl: imgToData(bestImg, bestImg.width, bestImg.height)
  }
}

// convert and resize an <img> to a data url
function imgToData (img, width, height) {
  var ratio = img.width / img.height;
  if (width / height > ratio) { height = width / ratio; } else { width = height * ratio; }

  var canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  var ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, width, height);
  return canvas.toDataURL('image/png')
}

/* globals beaker */

/*
The webview has a set of sync method calls to the main process
which will stall the renderer if called while the main is
handling a workload.

https://github.com/electron/electron/blob/master/lib/renderer/web-view/web-view.js#L319-L371

This adds a set of async alternatives
*/

const methods = [
  'getURL',
  'loadURL',
  'getTitle',
  'isLoading',
  'isLoadingMainFrame',
  'isWaitingForResponse',
  'stop',
  'reload',
  'reloadIgnoringCache',
  'canGoBack',
  'canGoForward',
  'canGoToOffset',
  'clearHistory',
  'goBack',
  'goForward',
  'goToIndex',
  'goToOffset',
  'isCrashed',
  'setUserAgent',
  'getUserAgent',
  'openDevTools',
  'closeDevTools',
  'isDevToolsOpened',
  'isDevToolsFocused',
  'inspectElement',
  'setAudioMuted',
  'isAudioMuted',
  'undo',
  'redo',
  'cut',
  'copy',
  'paste',
  'pasteAndMatchStyle',
  'delete',
  'selectAll',
  'unselect',
  'replace',
  'replaceMisspelling',
  'findInPage',
  'stopFindInPage',
  'getId',
  'downloadURL',
  'inspectServiceWorker',
  'print',
  'printToPDF',
  'showDefinitionForSelection',
  'capturePage',
  'setZoomFactor',
  'setZoomLevel',
  'getZoomLevel',
  'getZoomFactor'
];

function addAsyncAlternatives (page) {
  methods.forEach(method => {
    page[method + 'Async'] = async (...args) => {
      if (!page.isWebviewReady) return false
      return beaker.browser.doWebcontentsCmd(method, page.wcID, ...args)
    };
  });
}

/* globals beaker DatArchive URL */

// constants
// =

const ERR_ABORTED = -3;
const ERR_CONNECTION_REFUSED = -102;
const ERR_INSECURE_RESPONSE = -501;

const TRIGGER_LIVE_RELOAD_DEBOUNCE = 500; // throttle live-reload triggers by this amount

const FIRST_TAB_URL = 'beaker://start';
const DEFAULT_URL = 'beaker://start';

const APP_PATH = electron.remote.app.getAppPath(); // NOTE: this is a sync op

// globals
// =

var pages = [];
var activePage = null;
var events = new EventEmitter__default();
var webviewsDiv = document.getElementById('webviews');
var closedURLs = [];
var cachedMarkdownRendererScript;
var cachedJSONRendererScript;

// exported functions
// =

function on (...args) {
  events.on.apply(events, args);
}

function getAll () {
  return pages
}

function get (index) {
  return pages[index]
}

function getPinned () {
  return pages.filter(p => p.isPinned)
}

function setup$2 () {
  beaker.archives.addEventListener('network-changed', ({details}) => {
    // check if any of the active pages matches this url
    pages.forEach(page => {
      if (page.siteInfo && page.siteInfo.url === details.url) {
        // update info
        page.siteInfo.peers = details.peerCount;
        update$1(page);
      }
      // refresh if this was a 503ed site
      if (page.siteWasADatTimeout && page.url.startsWith(details.url)) {
        page.reload();
      }
    });
  });

  events.on('update', e => {
    electron.ipcRenderer.send('shell-window:pages-updated', takeSnapshot());
  });
}

function initializeFromSnapshot (snapshot) {
  for (let url of snapshot) create$$1(url);
}

function takeSnapshot () {
  return getAll()
    .filter((p) => !p.isPinned)
    .map((p) => p.getIntendedURL())
}

function create$$1 (opts) {
  var url;
  if (opts && typeof opts === 'object') {
    url = opts.url;
  } else if (typeof opts === 'string') {
    url = opts;
    opts = {};
  } else { opts = {}; }

  url = url || DEFAULT_URL;

  // create page object
  var id = (Math.random() * 1000 | 0) + Date.now();
  var page = {
    id: id,
    wcID: null, // the id of the webcontents
    webviewEl: createWebviewEl(id, url),
    navbarEl: createEl(id),
    promptEl: createContainer(id),
    modalEl: createContainer$1(id),
    siteInfoNavbarBtn: null, // set after object is created

    // page state
    _url: url, // what is the actual current URL?
    get url () { return this._url },
    set url (v) {
      this._url = v;
      electron.ipcRenderer.send('shell-window:set-current-location', v); // inform main process
    },
    loadingURL: url, // what URL is being loaded, if any?
    title: '', // what is the current pages title?
    isGuessingTheURLScheme: false, // did beaker guess at the url scheme? if so, a bad load may deserve a second try
    manuallyTrackedIsLoading: true, // used because the webview may never be ready, so webview.isLoading() isnt enough
    isWebviewReady: false, // has the webview loaded its methods?
    isReceivingAssets: false, // has the webview started receiving assets, in the current load-cycle?
    isActive: false, // is the active page?
    isInpageFinding: false, // showing the inpage find ctrl?
    inpageFindInfo: null, // any info available on the inpage find {activeMatchOrdinal, matches}
    liveReloadEvents: false, // live-reload event stream
    zoom: 0, // what's the current zoom level?
    retainedScrollY: 0, // what was the scroll position of the page before navigating away?

    // current page's info
    contentType: null, // what is the content-type of the page?
    favicons: null, // what are the favicons of the page?
    bookmark: null, // this page's bookmark object, if it's bookmarked

    // current site's info
    protocolInfo: null, // info about the current page's delivery protocol
    siteLoadError: null, // info about the current page's last load's error (null if no error)
    siteInfo: null, // metadata about the current page, derived from protocol knowledge
    sitePerms: null, // saved permissions for the current page
    siteInfoOverride: null, // explicit overrides on the siteinfo, used by beaker: pages
    siteHasDatAlternative: false, // is there a dat:// version we can redirect to?
    siteWasADatTimeout: false, // did we timeout trying to find this site on the dat network?

    // history
    lastVisitedAt: 0, // when is last time url updated?
    lastVisitedURL: null, // last URL added into history
    _canGoBack: false, // cached to avoid sync calls to the main process
    _canGoForward: false, // cached to avoid sync calls to the main process

    // UI elements
    prompts: [], // list of active prompts (used with perms)
    modals: [], // list of active modals

    // tab state
    isPinned: opts.isPinned, // is this page pinned?
    isTabDragging: false, // being dragged?
    tabDragOffset: 0, // if being dragged, this is the current offset

    // get the current URL
    getURL () {
      return this.url
    },

    // get the current title
    getTitle () {
      return this.title
    },

    // get the URL of the page we want to load (vs which is currently loaded)
    getIntendedURL () {
      var url = page.loadingURL || page.getURL();
      if (url.startsWith('beaker:') && page.siteInfoOverride && page.siteInfoOverride.url) {
        // override, only if on a builtin beaker site
        url = page.siteInfoOverride.url;
      }
      return url
    },

    // custom isLoading
    isLoading () {
      return page.manuallyTrackedIsLoading
    },

    // cache getters to avoid sync calls to the main process
    canGoBack () { return this._canGoBack },
    canGoForward () { return this._canGoForward },

    // wrap webview loadURL to set the `loadingURL`
    loadURL (url, opts) {
      // reset some state
      page.isReceivingAssets = false;
      page.siteInfoOverride = null;

      // set and go
      page.loadingURL = url;
      page.isGuessingTheURLScheme = opts && opts.isGuessingTheScheme;
      if (!page.isWebviewReady) {
        // just do a sync call, otherwise loadURLAsync will drop it on the floor
        page.webviewEl.loadURL(url); // NOTE sync call
      } else {
        page.loadURLAsync(url);
      }
    },

    async reload () {
      // grab the current scroll-y
      page.retainedScrollY = 0;
      try {
        page.retainedScrollY = await page.webviewEl.getWebContents().executeJavaScript('window.scrollY');
      } catch (e) {
        console.debug('Error while trying to fetch the page scrollY', e);
      }

      // reload the page
      page.reloadAsync();
    },

    getURLOrigin () {
      return parseURL(this.getURL()).origin
    },

    // helper, abstracts over app:// protocol binding
    getViewedDatOrigin () {
      if (this.getIntendedURL().startsWith('dat:')) {
        return parseURL(this.getIntendedURL()).origin
      }
      // TODO app scheme was removed, do we still need this? -prf
      // const pi = this.protocolInfo
      // if (pi && pi.scheme === 'app:' && pi.binding && pi.binding.url.startsWith('dat://')) {
      //   return parseURL(pi.binding.url).origin
      // }
      return false
    },

    isInstalledApp () {
      // TODO(apps) restore when we bring back apps -prf
      // const si = this.siteInfo
      // if (si && si.installedNames && si.installedNames.length > 0) {
      //   return true
      // }
      return false
    },

    isLiveReloading () {
      return !!page.liveReloadEvents
    },

    // start/stop live reloading
    toggleLiveReloading () {
      if (page.liveReloadEvents) {
        page.liveReloadEvents.close();
        page.liveReloadEvents = false;
      } else if (page.protocolInfo && page.protocolInfo.scheme === 'dat:' && page.siteInfo) {
        var archive = new DatArchive(page.siteInfo.key);
        page.liveReloadEvents = archive.watch();
        let event = (page.siteInfo.isOwner) ? 'changed' : 'invalidated';
        page.liveReloadEvents.addEventListener(event, (e) => {
          page.triggerLiveReload();
        });
      }
      create$1(`Live reloading ${(page.liveReloadEvents) ? 'on' : 'off'}`, 1e3);
      update$1(page);
    },

    stopLiveReloading () {
      if (page.liveReloadEvents) {
        page.liveReloadEvents.close();
        page.liveReloadEvents = false;
      }
    },

    // reload the page due to changes in the dat
    triggerLiveReload: throttle(() => {
      page.reload();
    }, TRIGGER_LIVE_RELOAD_DEBOUNCE, {leading: false}),
    // ^ note this is run on the front edge.
    // That means snappier reloads (no delay) but possible double reloads if multiple files change

    // helper to load the perms
    fetchSitePerms () {
      beaker.sitedata.getPermissions(this.getURL()).then(perms => {
        page.sitePerms = perms;
        update$1(page);
      });
    },

    // helper to check if there's a dat version of the site available
    checkForDatAlternative (name) {
      DatArchive.resolveName(name).then(res => {
        this.siteHasDatAlternative = !!res;
        update$1(page);
      }).catch(err => console.log('Name does not have a Dat alternative', name));
    },

    async toggleDevTools (jsConsole) {
      if (await this.isDevToolsOpenedAsync()) {
        await this.closeDevToolsAsync();
      } else {
        await this.openDevToolsAsync();
        if (jsConsole) {
          page.webviewEl.getWebContents().once('devtools-opened', () => {
            const dtwc = page.webviewEl.getWebContents().devToolsWebContents;
            if (dtwc) dtwc.executeJavaScript('DevToolsAPI.showPanel("console")');
          });
        }
      }
    }
  };
  page.siteInfoNavbarBtn = new SiteInfoNavbarBtn(page);

  if (opts.isPinned) {
    pages.splice(indexOfLastPinnedTab(), 0, page);
  } else {
    pages.push(page);
  }

  // add *Async alternatives to all methods, *Sync really should never be used
  addAsyncAlternatives(page);

  // add but leave hidden
  hide(page);
  webviewsDiv.appendChild(page.webviewEl);

  // emit
  events.emit('add', page);

  // register events
  page.webviewEl.addEventListener('dom-ready', onDomReady);
  page.webviewEl.addEventListener('new-window', onNewWindow);
  page.webviewEl.addEventListener('will-navigate', onWillNavigate);
  page.webviewEl.addEventListener('did-navigate', onDidNavigate);
  page.webviewEl.addEventListener('did-navigate-in-page', onDidNavigateInPage);
  page.webviewEl.addEventListener('did-start-loading', onDidStartLoading);
  page.webviewEl.addEventListener('did-stop-loading', onDidStopLoading);
  page.webviewEl.addEventListener('load-commit', onLoadCommit);
  page.webviewEl.addEventListener('did-get-redirect-request', onDidGetRedirectRequest);
  page.webviewEl.addEventListener('did-get-response-details', onDidGetResponseDetails);
  page.webviewEl.addEventListener('did-finish-load', onDidFinishLoad);
  page.webviewEl.addEventListener('did-fail-load', onDidFailLoad);
  page.webviewEl.addEventListener('page-favicon-updated', onPageFaviconUpdated);
  page.webviewEl.addEventListener('page-title-updated', onPageTitleUpdated);
  page.webviewEl.addEventListener('update-target-url', onUpdateTargetUrl);
  page.webviewEl.addEventListener('found-in-page', onFoundInPage);
  page.webviewEl.addEventListener('enter-html-full-screen', onEnterHtmlFullScreen);
  page.webviewEl.addEventListener('leave-html-full-screen', onLeaveHtmlFullScreen);
  page.webviewEl.addEventListener('close', onClose);
  page.webviewEl.addEventListener('crashed', onCrashed);
  page.webviewEl.addEventListener('gpu-crashed', onCrashed);
  page.webviewEl.addEventListener('plugin-crashed', onCrashed);
  page.webviewEl.addEventListener('ipc-message', onIPCMessage);

  // rebroadcasts
  page.webviewEl.addEventListener('did-start-loading', rebroadcastEvent);
  page.webviewEl.addEventListener('did-stop-loading', rebroadcastEvent);
  page.webviewEl.addEventListener('page-title-updated', rebroadcastEvent);
  page.webviewEl.addEventListener('page-favicon-updated', rebroadcastEvent);

  // make active if none others are
  if (!activePage) {
    events.emit('first-page', page);
    setActive(page);
  }

  return page
}

async function remove$$1 (page) {
  // find
  var i = pages.indexOf(page);
  if (i == -1) { return console.warn('pages.remove() called for missing page', page) }

  // save, in case the user wants to restore it
  closedURLs.push(page.getURL());

  // set new active if that was
  if (page.isActive) {
    if (pages.length == 1) { return window.close() }
    setActive(pages[i + 1] || pages[i - 1]);
  }

  // remove
  page.stopLiveReloading();
  pages.splice(i, 1);
  webviewsDiv.removeChild(page.webviewEl);
  destroyEl(page.id);
  destroyContainer(page.id);
  destroyContainer$1(page.id);

  // persist pins w/o this one, if that was
  if (page.isPinned) { savePinnedToDB(); }

  // emit
  events.emit('remove', page);
  events.emit('update');

  // remove all attributes, to clear circular references
  for (var k in page) {
    page[k] = null;
  }
}

function reopenLastRemoved () {
  var url = closedURLs.pop();
  if (url) {
    var page = create$$1(url);
    setActive(page);
    return page
  }
}

function setActive (page) {
  leavePageFullScreen();
  set(false);
  if (activePage) {
    hide(activePage);
    activePage.isActive = false;
  }

  activePage = page;
  show(page);
  page.isActive = 1;
  page.webviewEl.focus();
  setIsLoading(page.isLoading());

  closeMenus();
  update$1();
  update$2();
  update$3();

  events.emit('set-active', page);
  electron.ipcRenderer.send('shell-window:set-current-location', page.getIntendedURL());
}

function togglePinned (page) {
  // move tab in/out of the pinned tabs
  var oldIndex = pages.indexOf(page);
  var newIndex = indexOfLastPinnedTab();
  if (oldIndex < newIndex) newIndex--;
  pages.splice(oldIndex, 1);
  pages.splice(newIndex, 0, page);

  // update page state
  page.isPinned = !page.isPinned;
  events.emit('pin-updated', page);
  events.emit('update', page);

  // persist
  savePinnedToDB();
}

function indexOfLastPinnedTab () {
  var index = 0;
  for (index; index < pages.length; index++) {
    if (!pages[index].isPinned) { break }
  }
  return index
}

function reorderTab (page, offset) {
  // only allow increments of 1
  if (offset > 1 || offset < -1) { return console.warn('reorderTabBy isnt allowed to offset more than -1 or 1; this is a coding error') }

  // first check if reordering can happen
  var srcIndex = pages.indexOf(page);
  var dstIndex = srcIndex + offset;
  var swapPage = pages[dstIndex];
  // is there actually a destination?
  if (!swapPage) { return false }
  // can only swap if both are the same pinned state (pinned/unpinned cant mingle)
  if (page.isPinned != swapPage.isPinned) { return false }

  // ok, do the swap
  pages[srcIndex] = swapPage;
  pages[dstIndex] = page;

  events.emit('update');
  return true
}

function changeActiveBy (offset) {
  if (pages.length > 1) {
    var i = pages.indexOf(activePage);
    if (i === -1) { return console.warn('Active page is not in the pages list! THIS SHOULD NOT HAPPEN!') }

    i += offset;
    if (i < 0) i = pages.length - 1;
    if (i >= pages.length) i = 0;

    setActive(pages[i]);
  }
}

function changeActiveTo (index) {
  if (index >= 0 && index < pages.length) { setActive(pages[index]); }
}

function changeActiveToLast () {
  setActive(pages[pages.length - 1]);
}

function getActive () {
  return activePage
}

function getAdjacentPage (page, offset) {
  if (pages.length > 1) {
    // lookup the index
    var i = pages.indexOf(page);
    if (i === -1) { return null }

    // add offset and return
    return pages[i + offset]
  }
}

function getByWebview (el) {
  return getById(el.dataset.id)
}

function getByWebContentsID (wcID) {
  for (var i = 0; i < pages.length; i++) {
    if (pages[i].wcID === wcID) { return pages[i] }
  }
  return null
}

function getById (id) {
  for (var i = 0; i < pages.length; i++) {
    if (pages[i].id == id) { return pages[i] }
  }
  return null
}

function loadPinnedFromDB () {
  return beaker.browser.getSetting('pinned_tabs').then(json => {
    try { JSON.parse(json).forEach(url => create$$1({ url, isPinned: true })); } catch (e) {}
  })
}

function savePinnedToDB () {
  return beaker.browser.setSetting('pinned_tabs', JSON.stringify(getPinned().map(p => p.getURL())))
}

function leavePageFullScreen () {
  // go through each active page and tell it to leave fullscreen mode (if it's active)
  if (document.body.classList.contains('page-fullscreen')) {
    pages.forEach(p => {
      if (p.isWebviewReady) {
        p.webviewEl.getWebContents().send('exit-full-screen-hackfix');
      }
    });
  }
}

// event handlers
// =

function onDomReady (e) {
  var page = getByWebview(e.target);
  if (page) {
    page.isWebviewReady = true;
    if (!page.wcID) {
      page.wcID = e.target.getWebContents().id; // NOTE: this is a sync op
    }
    if (!isLocationFocused(page) && page.isActive) {
      page.webviewEl.shadowRoot.querySelector('object').focus();
    }
  }
}

function onNewWindow (e) {
  var page = getByWebview(e.target);
  if (page && page.isActive) { // only open if coming from the active tab
    var newPage = create$$1(e.url);
    if (e.disposition === 'foreground-tab' || e.disposition === 'new-window') {
      setActive(newPage);
    }
  }
}

// will-navigate is the first event called when a link is clicked
// we can set the URL now, and update the navbar, to get quick response from the page
// (if entered by the user in the URL bar, this wont emit, but the loadURL() wrapper will set it)
function onWillNavigate (e) {
  var page = getByWebview(e.target);
  if (page) {
    // reset some state
    page.isReceivingAssets = false;
    // update target url
    page.loadingURL = e.url;
    page.siteInfoOverride = null;
    updateLocation(page);
  }
}

function onDidNavigate (e) {
  var page = getByWebview(e.target);
  if (page) {  
    // close any prompts and modals
    forceRemoveAll(page);
    forceRemoveAll$1(page);
  }
}

// did-navigate-in-page is triggered by hash/virtual-url changes
// we need to update the url bar but no load event occurs
function onDidNavigateInPage (e) {
  // ignore if this is a subresource
  if (!e.isMainFrame) {
    return
  }

  var page = getByWebview(e.target);
  if (page) {
    // update ui
    page.url = e.url;
    updateLocation(page);

    // update history
    updateHistory(page);
  }
}

function onLoadCommit (e) {
  // ignore if this is a subresource
  if (!e.isMainFrame) {
    return
  }

  var page = getByWebview(e.target);
  if (page) {
    // clear out the page's error
    page.siteLoadError = null;
    // turn off live reloading if we're leaving the domain
    if (isDifferentDomain(e.url, page.url)) {
      page.stopLiveReloading();
    }
    // check if this page bookmarked
    beaker.bookmarks.getBookmark(e.url).then(bookmark => {
      page.bookmark = bookmark;
      update$1(page);
    });
    setZoomFromSitedata(page, parseURL(page.getIntendedURL()).origin);
    // stop autocompleting
    clearAutocomplete();
    // set title in tabs
    page.title = e.target.getTitle(); // NOTE sync operation
    update$1(page);
  }
}

function onDidStartLoading (e) {
  var page = getByWebview(e.target);
  if (page) {
    // update state
    page.manuallyTrackedIsLoading = true;
    page.siteWasADatTimeout = false;
    update$1(page);
    hideInpageFind(page);
    if (page.isActive) {
      setIsLoading(true);
    }

    // decorate the webview based on whether it's a builtin page
    const url = page.loadingURL || page.url;
    if (url.startsWith('beaker://')) {
      page.webviewEl.classList.add('builtin');
    } else {
      page.webviewEl.classList.remove('builtin');
    }
  }
}

function onDidStopLoading (e) {
  var page = getByWebview(e.target);
  if (page) {
    // update url
    if (page.loadingURL) {
      page.url = page.loadingURL;
    }
    var url = page.url;

    // update history and UI
    updateHistory(page);

    // fetch protocol and page info
    var { protocol, hostname, pathname } = url.startsWith('dat://') ? parseDatURL(url) : parseURL(url);
    page.siteInfo = null;
    page.sitePerms = null;
    page.siteHasDatAlternative = false;
    page.protocolInfo = {url, hostname, pathname, scheme: protocol, label: protocol.slice(0, -1).toUpperCase()};
    if (protocol === 'https:') {
      page.checkForDatAlternative(hostname);
    }
    if (protocol === 'dat:') {
      DatArchive.resolveName(hostname)
        .catch(err => hostname) // try the hostname as-is, might be a hash
        .then(key => (new DatArchive(key)).getInfo())
        .then(info => {
          page.siteInfo = info;
          update$1(page);
          console.log('dat site info', info);

          // fallback the tab title to the site title, if needed
          if (isEqualURL(page.getTitle(), page.getURL()) && info.title) {
            page.title = info.title;
            events.emit('page-title-updated', page);
          }
        });
    }
    if (protocol !== 'beaker:') {
      page.fetchSitePerms();
    }

    // update page
    page.loadingURL = false;
    page.manuallyTrackedIsLoading = false;
    if (page.isActive) {
      updateLocation(page);
      update$1(page);
      setIsLoading(false);
    }

    // fallback content type
    let contentType = page.contentType;
    if (!contentType) {

      if (page.getURL().endsWith('.md')) {
        contentType = 'text/markdown';
      }

      if (page.getURL().endsWith('.json')) {
        contentType = 'application/json';
      }
    }

    // markdown rendering
    // inject the renderer script if the page is markdown
    if (contentType && (contentType.startsWith('text/markdown') || contentType.startsWith('text/x-markdown'))) {
      // hide the unformatted text and provide some basic styles
      page.webviewEl.insertCSS(`
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Ubuntu, Cantarell, "Oxygen Sans", "Helvetica Neue", sans-serif; }
        body > pre { display: none; }
        main { display: flex; }
        nav { max-width: 200px; padding-right: 2em; }
        nav .link { white-space: pre; overflow: hidden; text-overflow: ellipsis; margin: 0.5em 0 }
        main > div { max-width: 800px; }
        hr { border: 0; border-top: 1px solid #ccc; margin: 1em 0; }
        blockquote { margin: 0; padding: 0 1em; border-left: 1em solid #eee; }
        .anchor-link { color: #aaa; margin-left: 5px; text-decoration: none; visibility: hidden; }
        h1:hover .anchor-link, h2:hover .anchor-link, h3:hover .anchor-link, h4:hover .anchor-link, h5:hover .anchor-link { visibility: visible; }
        table { border-collapse: collapse; }
        td, th { padding: 0.5em 1em; }
        tbody tr:nth-child(odd) { background: #fafafa; }
        tbody td { border-top: 1px solid #bbb; }
        .switcher { position: absolute; top: 5px; right: 5px; font-family: Consolas, 'Lucida Console', Monaco, monospace; cursor: pointer; font-size: 13px; background: #fafafa; padding: 2px 5px; }
        main code { font-size: 1.3em; background: #fafafa; }
        main pre { background: #fafafa; padding: 1em }
      `);
      page.webviewEl.insertCSS(`
        .markdown { font-size: 14px; width: 100%; max-width: 750px; line-height: 22.5px; }
        .markdown a { color: #2864dc; text-decoration: none; }
        .markdown a:hover { text-decoration: underline; }
        .markdown a.anchor-link { color: #ddd; }
        .markdown h1, .markdown h2, .markdown  h3 { margin: 15px 0; font-weight: 600; }
        .markdown h1, .markdown h2 { border-bottom: 1px solid #eee; line-height: 45px; }
        .markdown h1 { font-size: 30px; }
        .markdown h2 { font-size: 24px; }
        .markdown h3 { font-size: 20px; }
        .markdown ul, .markdown ol { margin-bottom: 15px; }
        .markdown pre, .markdown code { font-family: Consolas, 'Lucida Console', Monaco, monospace; font-size: 13.5px; background: #f0f0f0; border-radius: 2px; }
        .markdown pre { padding: 15px; border: 0; overflow-x: auto; }
        .markdown code { padding: 3px 5px; }
        .markdown pre > code { display: block; }
      `);
      if (!cachedMarkdownRendererScript) {
        cachedMarkdownRendererScript = fs.readFileSync(path.join(APP_PATH, 'markdown-renderer.build.js'), 'utf8');
      }

      page.webviewEl.executeJavaScript(cachedMarkdownRendererScript);
    }

    // json rendering
    // inject the json render script
    if (contentType && (contentType.startsWith('application/json') || contentType.startsWith('application/javascript'))) {
      
      page.webviewEl.insertCSS(`
        .hidden { display: none !important; }
        .json-formatter-row {
          font-family: Consolas, 'Lucida Console', Monaco, monospace !important;
          line-height: 1.6 !important;
          font-size: 13px;
        }
        .json-formatter-row > a > .json-formatter-preview-text {
          transition: none !important;
        }
        nav { margin-bottom: 5px; user-select: none; }
        nav > span {
          cursor: pointer;
          display: inline-block;
          font-family: Consolas, "Lucida Console", Monaco, monospace;
          cursor: pointer;
          font-size: 13px;
          background: rgb(250, 250, 250);
          padding: 3px 5px;
          margin-right: 5px;
        }
        nav > span.pressed {
          box-shadow: inset 2px 2px 2px rgba(0,0,0,.05);
          background: #ddd;
        }
      `);

      if (!cachedJSONRendererScript) {
        cachedJSONRendererScript = fs.readFileSync(path.join(APP_PATH, 'json-renderer.build.js'), 'utf8');
      }

      page.webviewEl.executeJavaScript(cachedJSONRendererScript);
    }

    // HACK
    // inject some corrections to the user-agent styles
    // real solution is to update electron so we can change the user-agent styles
    // -prf
    page.webviewEl.insertCSS(
      // set the default background to white.
      // on some devices, if no bg is set, the buffer doesnt get cleared
      `html {
        background: rgba(0,0,0,0);
      }` +

      // style file listings
      `pre{font-family: Consolas, 'Lucida Console', Monaco, monospace; font-size: 13px;}` +

      // hide context menu definitions
      `menu[type="context"] { display: none; }` +

      // adjust the positioning of fullpage media players
      `body:-webkit-full-page-media {
        background: #ddd;
      }
      audio:-webkit-full-page-media, video:-webkit-full-page-media {
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
      }`
    );

    // if there is a retained scroll position, move the page
    if (page.retainedScrollY) {
      page.webviewEl.executeJavaScript(`
        window.scroll(0, ${page.retainedScrollY})
      `);
      page.retainedScrollY = 0;
    }
  }
}

function onDidGetRedirectRequest (e) {
  // HACK
  // electron has a problem handling redirects correctly, so we need to handle it for them
  // see https://github.com/electron/electron/issues/3471
  // thanks github.com/sokcuri and github.com/alexstrat for this fix
  // -prf
  if (e.isMainFrame) {
    var page = getByWebview(e.target);
    if (page) {
      e.preventDefault();
      setTimeout(() => {
        console.log('Using redirect workaround for electron #3471; redirecting to', e.newURL);
        e.target.getWebContents().send('redirect-hackfix', e.newURL);
      }, 100);
    }
  }
}

function onDidGetResponseDetails (e) {
  if (e.resourceType != 'mainFrame') {
    return
  }

  var page = getByWebview(e.target);
  if (page) {
    // we're goin
    page.isReceivingAssets = true;
    try {
      page.contentType = e.headers['content-type'][0] || null;
    } catch (e) {
      page.contentType = null;
    }
    // set URL in navbar
    page.loadingURL = e.newURL;
    page.siteInfoOverride = null;
    updateLocation(page);
    // if it's a failed dat discovery...
    if (e.httpResponseCode === 504 && e.newURL.startsWith('dat://')) {
      page.siteWasADatTimeout = true;
    }
  }
}

function onDidFinishLoad (e) {
  var page = getByWebview(e.target);
  if (page) {
    // update page object
    if (page.loadingURL) {
      page.url = page.loadingURL;
    }
    page.loadingURL = false;
    page.isGuessingTheURLScheme = false;
    page.favicons = null;
    update$1(page);
    updateLocation(page);
    events.emit('update');
  }
}

function onDidFailLoad (e) {
  // ignore if this is a subresource
  if (!e.isMainFrame) { return }

  // ignore aborts. why:
  // - sometimes, aborts are caused by redirects. no biggy
  // - if the user cancels, then we dont want to give an error screen
  if (e.errorDescription == 'ERR_ABORTED' || e.errorCode == ERR_ABORTED) { return }

  // also ignore non-errors
  if (e.errorCode == 0) { return }

  var page = getByWebview(e.target);
  if (page) {
    var isInsecureResponse = [ERR_INSECURE_RESPONSE, ERR_CONNECTION_REFUSED].indexOf(e.errorCode) >= 0;
    page.siteLoadError = {isInsecureResponse, errorCode: e.errorCode, errorDescription: e.errorDescription};
    page.title = page.getIntendedURL();
    update$1(page);

    // if https fails for some specific reasons, and beaker *assumed* https, then fallback to http
    if (page.isGuessingTheURLScheme && isInsecureResponse) {
      console.log('Guessed the URL scheme was HTTPS, but got back', e.errorDescription, ' - trying HTTP');
      var url = page.getIntendedURL();
      page.isGuessingTheURLScheme = false; // no longer doing that!
      if (url.startsWith('https')) {
        url = url.replace(/^https/, 'http');
        page.loadURL(url);
        return
      }
    }

    // render failure page
    var errorPageHTML = errorPage(e);
    page.webviewEl.executeJavaScript('document.documentElement.innerHTML = \'' + errorPageHTML + '\'');
  }
}

async function onPageFaviconUpdated (e) {
  if (e.favicons && e.favicons[0]) {
    var page = getByWebview(e.target);
    page.favicons = e.favicons;
    events.emit('page-favicon-updated', getByWebview(e.target));

    // store favicon to db
    var res = await urlsToData(e.favicons);
    if (res) {
      beaker.sitedata.set(page.getURL(), 'favicon', res.dataUrl);
    }
  }
}

function onUpdateTargetUrl ({ url }) {
  set(url);
}

function onFoundInPage (e) {
  var page = getByWebview(e.target);
  page.inpageFindInfo = e.result;
  update$1(page);
}

function onEnterHtmlFullScreen (e) {
  document.body.classList.add('page-fullscreen');
  create$1('Press ESC to exit fullscreen', 10e3); // show for 10 seconds
}

function onLeaveHtmlFullScreen (e) {
  document.body.classList.remove('page-fullscreen');
}

function onClose (e) {
  var page = getByWebview(e.target);
  if (page) {
    remove$$1(page);
  }
}

function onPageTitleUpdated (e) {
  var page = getByWebview(e.target);
  page.title = e.title;

  // if page title changed within 15 seconds, update it again
  if (page.getIntendedURL() === page.lastVisitedURL && Date.now() - page.lastVisitedAt < 15 * 1000) {
    updateHistory(page);
  }
}

function onCrashed (e) {
  console.error('Webview crash', e);
}

function onIPCMessage (e) {
  var page = getByWebview(e.target);
  switch (e.channel) {
    case 'site-info-override:set':
      if (page) {
        page.siteInfoOverride = e.args[0];
        updateLocation(page);
        update$1(page);
      }
      break
    case 'site-info-override:clear':
      if (page) {
        page.siteInfoOverride = null;
        updateLocation(page);
        update$1(page);
      }
      break
    case 'open-url':
      var {url, newTab} = e.args[0];
      if (newTab) {
        create$$1(url);
      } else {
        getActive().loadURL(url);
      }
      closeMenus();
      break
    case 'close-menus':
      closeMenus();
      break
    case 'toggle-live-reloading':
      if (activePage) {
        activePage.toggleLiveReloading();
      }
      break
  }
}

// internal helper functions
// =

function show (page) {
  page.webviewEl.classList.remove('hidden');
  page.navbarEl.classList.remove('hidden');
  page.promptEl.classList.remove('hidden');
  page.modalEl.classList.remove('hidden');
  events.emit('show', page);
}

function hide (page) {
  page.webviewEl.classList.add('hidden');
  page.navbarEl.classList.add('hidden');
  page.promptEl.classList.add('hidden');
  page.modalEl.classList.add('hidden');
  events.emit('hide', page);
}

function createWebviewEl (id, url) {
  var el = document.createElement('webview');
  el.dataset.id = id;
  el.setAttribute('preload', 'file://' + path.join(APP_PATH, 'webview-preload.build.js'));
  el.setAttribute('webpreferences', 'allowDisplayingInsecureContent,contentIsolation,defaultEncoding=utf-8');
  // TODO add scrollBounce^ after https://github.com/electron/electron/issues/9233 is fixed
  // TODO re-enable nativeWindowOpen when https://github.com/electron/electron/issues/9558 lands
  el.setAttribute('src', url || DEFAULT_URL);
  return el
}

function rebroadcastEvent (e) {
  events.emit(e.type, getByWebview(e.target), e);
}

function parseURL (str) {
  try { return new URL(str) } catch (e) { return {} }
}

function isEqualURL (a, b) {
  return parseURL(a).origin === parseURL(b).origin
}

function isDifferentDomain (a, b) {
  return parseURL(a).origin !== parseURL(b).origin
}

async function updateHistory (page) {
  var url = page.getURL();

  if (!url.startsWith('beaker://') || url.match(/beaker:\/\/library\/[0-9,a-f]{64}/g)) {
    beaker.history.addVisit({url: page.getIntendedURL(), title: page.getTitle() || page.getURL()});
    if (page.isPinned) {
      savePinnedToDB();
    }
    page.lastVisitedAt = Date.now();
    page.lastVisitedURL = url;
  }

  // read and cache current nav state
  var [b, f] = await Promise.all([page.canGoBackAsync(), page.canGoForwardAsync()]);
  page._canGoBack = b;
  page._canGoForward = f;
  update$1(page);
}


var pages$1 = Object.freeze({
	FIRST_TAB_URL: FIRST_TAB_URL,
	DEFAULT_URL: DEFAULT_URL,
	APP_PATH: APP_PATH,
	on: on,
	getAll: getAll,
	get: get,
	getPinned: getPinned,
	setup: setup$2,
	initializeFromSnapshot: initializeFromSnapshot,
	create: create$$1,
	remove: remove$$1,
	reopenLastRemoved: reopenLastRemoved,
	setActive: setActive,
	togglePinned: togglePinned,
	reorderTab: reorderTab,
	changeActiveBy: changeActiveBy,
	changeActiveTo: changeActiveTo,
	changeActiveToLast: changeActiveToLast,
	getActive: getActive,
	getAdjacentPage: getAdjacentPage,
	getByWebview: getByWebview,
	getByWebContentsID: getByWebContentsID,
	getById: getById,
	loadPinnedFromDB: loadPinnedFromDB,
	savePinnedToDB: savePinnedToDB,
	leavePageFullScreen: leavePageFullScreen,
	onIPCMessage: onIPCMessage,
	createWebviewEl: createWebviewEl
});

/* globals URL */

// constants
// =

const MAX_TAB_WIDTH = 235; // px
const MIN_TAB_WIDTH = 48; // px
const SMALL_MODE_WIDTH = 67; // px
const TAB_SPACING = -1; // px

// globals
// =

var tabsContainerEl;

// tab-width and max showable is adjusted based on window width and # of tabs
var currentTabWidth = MAX_TAB_WIDTH;
var numPinnedTabs = 0;
var numTabsWeCanFit = Infinity; // we start out fairly optimistic 

// exported methods
// ==

function setup$1 () {
  // render
  tabsContainerEl = yo`<div class="chrome-tabs">
    <div class="chrome-tab chrome-tab-add-btn" onclick=${onClickNew} title="Open new tab">
      <div class="chrome-tab-bg"></div>
      <span class="plus">+</span>
    </div>
  </div>`;
  yo.update(document.getElementById('toolbar-tabs'), yo`<div id="toolbar-tabs" class="chrome-tabs-shell">
    ${tabsContainerEl}
  </div>`);

  // wire up listeners
  on('add', onAddTab);
  on('remove', onRemoveTab);
  on('set-active', onSetActive);
  on('pin-updated', onPinUpdated);
  on('did-start-loading', onUpdateTab);
  on('did-stop-loading', onUpdateTab);
  on('page-title-updated', onUpdateTab);
  on('page-favicon-updated', onUpdateTab);
  window.addEventListener('resize', debounce(onWindowResize, 500));
}

// render functions
// =

function drawTab (page) {
  const isActive = page.isActive;
  const isTabDragging = page.isTabDragging && (page.tabDragOffset !== 0);

  // pick a favicon
  var favicon;
  if (page.isLoading() && page.getIntendedURL() !== DEFAULT_URL) {
    // loading spinner
    favicon = yo`<div class="spinner"></div>`;
    if (!page.isReceivingAssets) { favicon.classList.add('reverse'); }
  } else {
    // page's explicit favicon
    if (page.favicons && page.favicons[0]) {
      favicon = yo`<img src=${page.favicons[page.favicons.length - 1]}>`;
      favicon.onerror = onFaviconError(page);
    } else if (page.getURL().startsWith('beaker:')) {
      // favicon = yo`<img src="beaker-favicon:beaker">`
      favicon = getBuiltinPageIcon(page.getURL());
    } else {
      // (check for cached icon)
      favicon = yo`<img src="beaker-favicon:${page.getURL()}?cache=${Date.now()}">`;
    }
  }

  // class
  var cls = '';
  if (isActive) cls += ' chrome-tab-current';
  if (isTabDragging) cls += ' chrome-tab-dragging';

  // styles
  var {pageIndex, style, smallMode} = getPageStyle(page);
  if (smallMode) cls += ' chrome-tab-small';

  // pinned rendering:
  if (page.isPinned) {
    return yo`<div class=${'chrome-tab chrome-tab-pinned' + cls}
                data-id=${page.id}
                style=${style}
                onclick=${onClickTab(page)}
                oncontextmenu=${onContextMenuTab(page)}
                onmousedown=${onMouseDown(page)}
                title=${getNiceTitle(page)}>
      <div class="chrome-tab-bg"></div>
      <div class="chrome-tab-favicon">${favicon}</div>
    </div>`
  }

  // normal rendering:

  return yo`
  <div class=${'chrome-tab' + cls}
      data-id=${page.id}
      style=${style}
      onclick=${onClickTab(page)}
      oncontextmenu=${onContextMenuTab(page)}
      onmousedown=${onMouseDown(page)}
      title=${getNiceTitle(page)}>
    <div class="chrome-tab-bg"></div>
    <div class="chrome-tab-favicon">${favicon}</div>
    <div class="chrome-tab-title">${getNiceTitle(page) || 'New Tab'}</div>
    <div class="chrome-tab-close" title="Close tab" onclick=${onClickTabClose(page)}></div>
  </div>`
}

// calculate and position all tabs
// - should be called any time the # of pages changes, or pin/unpin
function repositionTabs (e) {
  const allPages = getAll();

  // compute tab width for the space we have
  // - we need to distributed the space among unpinned tabs
  numPinnedTabs = 0;
  var numUnpinnedTabs = 0;
  var availableWidth = window.innerWidth;
  // correct for traffic lights
  if (window.process.platform == 'darwin' && !document.body.classList.contains('fullscreen')) { availableWidth -= 80; }
  if (window.process.platform == 'win32') { availableWidth -= 200; }
  // correct for new-tab and dropdown btns
  availableWidth -= (MIN_TAB_WIDTH + TAB_SPACING);
  // count the unpinned-tabs, and correct for the spacing and pinned-tabs
  allPages.forEach(p => {
    availableWidth -= TAB_SPACING;
    if (p.isPinned) {
      numPinnedTabs++;
      availableWidth -= MIN_TAB_WIDTH;
    }
    else numUnpinnedTabs++;
  });
  // check if we're out of space
  numTabsWeCanFit = Math.min(Math.floor(availableWidth / SMALL_MODE_WIDTH), numUnpinnedTabs);
  if (numTabsWeCanFit < numUnpinnedTabs) {
    // TODO we should provide a control to access the additional tabs
    numUnpinnedTabs = numTabsWeCanFit;
  }
  // now calculate a (clamped) size
  currentTabWidth = Math.min(MAX_TAB_WIDTH, Math.max(MIN_TAB_WIDTH, availableWidth / numUnpinnedTabs)) | 0;

  // update tab positions
  allPages.forEach(page => getTabEl(page, tabEl => {
    var {style, pageIndex, smallMode} = getPageStyle(page);
    tabEl.classList.toggle('chrome-tab-small', smallMode);
    tabEl.style = style;
  }));
  tabsContainerEl.querySelector('.chrome-tab-add-btn').style = getAddBtnStyle();
}

// page event
// =

function onAddTab (page) {
  tabsContainerEl.insertBefore(drawTab(page), tabsContainerEl.querySelector('.chrome-tab-add-btn'));
  repositionTabs();
}

function onRemoveTab (page) {
  getTabEl(page, tabEl => tabEl.parentNode.removeChild(tabEl));
  repositionTabs();
}

function onUpdateTab (page) {
  getTabEl(page, tabEl => yo.update(tabEl, drawTab(page)));
}

function onPinUpdated (page) {
  getTabEl(page, tabEl => yo.update(tabEl, drawTab(page)));
  repositionTabs();
}

function onSetActive (page) {
  getTabEl(page, newTabEl => {
    // make old active tab inactive
    var oldTabEl = tabsContainerEl.querySelector('.chrome-tab-current');
    if (oldTabEl) {
      oldTabEl.classList.remove('chrome-tab-current');
    }

    // set new tab active
    newTabEl.classList.add('chrome-tab-current');

    // recalculate tab styles
    repositionTabs();
  });
}

// ui events
// =

function onClickNew () {
  var page = create$$1();
  setActive(page);
  focusLocation(page);
}

function onClickDuplicate (page) {
  return () => create$$1(page.getURL())
}

function onClickPin (page) {
  return () => togglePinned(page)
}

function onToggleMuted (page) {
  return () => {
    if (page.webviewEl) {
      const wc = page.webviewEl.getWebContents();
      const isMuted = wc.isAudioMuted();
      wc.setAudioMuted(!isMuted);
    }
  }
}

function onClickTab (page) {
  return e => {
    if (e.which !== 2) {
      setActive(page);
    }
  }
}

function onClickTabClose (page) {
  return e => {
    if (e && e.preventDefault) {
      e.preventDefault();
      e.stopPropagation();
    }
    remove$$1(page);
  }
}

function onClickCloseOtherTabs (page) {
  return async () => {
    setActive(page);
    var ps = getAll().slice();
    for (var i = 0; i < ps.length; i++) {
      if (ps[i] != page) {
        await remove$$1(ps[i]);
      }
    }
  }
}

function onClickCloseTabsToTheRight (page) {
  return async () => {
    var ps = getAll();
    var index = ps.indexOf(page);
    for (var i = ps.length - 1; i > index; i--) {
      await remove$$1(ps[i]);
    }
  }
}

function onClickReopenClosedTab () {
  reopenLastRemoved();
}

function onContextMenuTab (page) {
  return e => {
    const { Menu } = electron.remote;
    var isMuted = false;
    if (page.webviewEl) {
      isMuted = page.webviewEl.getWebContents().isAudioMuted();
    }
    var menu = Menu.buildFromTemplate([
      { label: 'New Tab', click: onClickNew },
      { type: 'separator' },
      { label: 'Duplicate', click: onClickDuplicate(page) },
      { label: (page.isPinned) ? 'Unpin Tab' : 'Pin Tab', click: onClickPin(page) },
      { label: (isMuted) ? 'Unmute Tab' : 'Mute Tab', click: onToggleMuted(page) },
      { type: 'separator' },
      { label: 'Close Tab', click: onClickTabClose(page) },
      { label: 'Close Other Tabs', click: onClickCloseOtherTabs(page) },
      { label: 'Close Tabs to the Right', click: onClickCloseTabsToTheRight(page) },
      { type: 'separator' },
      { label: 'Reopen Closed Tab', click: onClickReopenClosedTab }
    ]);
    menu.popup(electron.remote.getCurrentWindow());
  }
}

function onMouseDown (page) {
  return e => {
    // middle click
    if (e.which === 2) {
      remove$$1(page);
      return
    }

    // left click
    if (e.which !== 1) {
      return
    }

    // FIXME when you move your cursor out of the tabs, dragging stops working -prf

    // start drag behaviors
    var startX = e.pageX;
    page.isTabDragging = true;
    e.preventDefault();
    e.stopPropagation();

    // register drag-relevant listeners
    document.addEventListener('mousemove', drag, true);
    document.addEventListener('mouseup', dragend, true);
    window.addEventListener('blur', dragend, true);

    // throttle so we only rerender as much as needed
    // - actually throttling seems to cause jank
    var rerender = /* throttle( */() => {
      repositionTabs();
    };/*, 30) */

    // drag handler
    var hasSetDragClass = false;
    function drag (e) {
      // calculate offset
      page.tabDragOffset = e.pageX - startX;

      // set drag class (wait till actually moved, it looks better that way)
      if (!hasSetDragClass && page.tabDragOffset !== 0) {
        getTabEl(page, tabEl => tabEl.classList.add('chrome-tab-dragging'));
        hasSetDragClass = true;
      }

      // do reorder?
      var reorderOffset = shouldReorderTab(page);
      if (reorderOffset) {
        // reorder, and recalc the offset
        if (reorderTab(page, reorderOffset)) {
          startX += (reorderOffset * (page.isPinned ? 40 : getTabWidth(page)));
          page.tabDragOffset = e.pageX - startX;
        }
      }

      // draw, partner
      rerender();
    }

    // done dragging handler
    function dragend (e) {
      // reset
      page.tabDragOffset = 0;
      page.isTabDragging = false;
      getTabEl(page, tabEl => tabEl.classList.remove('chrome-tab-dragging'));
      document.removeEventListener('mousemove', drag, true);
      document.removeEventListener('mouseup', dragend, true);
      rerender();
    }
  }
}

function onFaviconError (page) {
  return () => {
    // if the favicon 404s, just fallback to the icon
    page.favicons = null;
    onUpdateTab(page);
  }
}

function onWindowResize (e) {
  repositionTabs();
}

// internal helpers
// =

function getTabEl (page, cb) {
  var tabEl = tabsContainerEl.querySelector(`.chrome-tab[data-id="${page.id}"]`);
  if (cb && tabEl) cb(tabEl);
  return tabEl
}

function getTabX (pageIndex) {
  const allPages = getAll();

  // handle if given just a page object
  if (typeof pageIndex != 'number') {
    pageIndex = allPages.indexOf(pageIndex);
  }

  // calculate base X off of the widths of the pages before it
  var x = 0;
  for (var i = 0; i < pageIndex; i++) { x += getTabWidth(allPages[i]) + TAB_SPACING; }

  // add the page offset
  if (allPages[pageIndex]) { x += allPages[pageIndex].tabDragOffset; }

  // done
  return x
}

function getTabWidth (page) {
  if (page.isPinned) { return MIN_TAB_WIDTH }
  return currentTabWidth
}

function getPageStyle (page) {
  const allPages = getAll();

  // `page` is sometimes an index and sometimes a page object (gross, I know)
  // we need both
  var pageIndex, pageObject, smallMode = false;
  if (typeof page === 'object') {
    pageObject = page;
    pageIndex = allPages.indexOf(page);
  } else {
    pageObject = allPages[page];
    pageIndex = page;
  }

  // z-index
  var zIndex = pageIndex + 1; // default to the order across
  if (!pageObject) {
    zIndex = 0;
  } else if (pageObject.isActive) {
    zIndex = 999; // top
  } else if (pageObject.isTabDragging) {
    zIndex = 998; // almost top
  }

  var style = `
    transform: translateX(${getTabX(pageIndex)}px);
    z-index: ${zIndex};
  `;
  if (pageObject) {
    let width = getTabWidth(pageObject);
    style += ` width: ${width}px;`;
    if (width < SMALL_MODE_WIDTH) {
      smallMode = true;
    }
  }
  if (pageIndex >= numPinnedTabs + numTabsWeCanFit) {
    style += ' display: none;';
  }
  return {pageIndex, smallMode, style}
}

function getAddBtnStyle () {
  return `
    transform: translateX(${getTabX(numPinnedTabs + numTabsWeCanFit)}px);
    z-index: 0;
  `
}

// returns 0 for no, -1 or 1 for yes (the offset)
function shouldReorderTab (page) {
  // has the tab been dragged far enough to change order?
  if (!page.isTabDragging) { return 0 }

  var limit = (page.isPinned ? 40 : getTabWidth(page)) / 2;
  if (page.tabDragOffset < -1 * limit) { return -1 }
  if (page.tabDragOffset > limit) { return 1 }
  return 0
}

function getNiceTitle (page) {
  const title = page.getTitle();
  if (!title) return false

  // if the title is just the URL, give the path
  if (title !== page.getURL()) {
    return title
  }
  try {
    let { pathname, origin } = new URL(title);
    if (!pathname.endsWith('/')) {
      pathname = pathname.split('/').pop();
      return `${pathname} - ${origin}`
    }
    return origin
  } catch (e) {
    return title
  }
}

function getBuiltinPageIcon (url) {
  if (url.startsWith('beaker://library/dat://')) {
    // use the protocol, it will try to load the favicon of the dat
    return yo`<img src="beaker-favicon:${url}?cache=${Date.now()}">`
  }
  if (url.startsWith('beaker://library/')) {
    return yo`<i class="fa fa-book"></i>`
  }
  if (url.startsWith('beaker://bookmarks/')) {
    return yo`<i class="fa fa-star-o"></i>`
  }
  if (url.startsWith('beaker://history/')) {
    return yo`<i class="fa fa-history"></i>`
  }
  if (url.startsWith('beaker://downloads/')) {
    return yo`<i class="fa fa-download"></i>`
  }
  if (url.startsWith('beaker://settings/')) {
    return yo`<i class="fa fa-gear"></i>`
  }
  if (url.startsWith('beaker://swarm-debugger/')) {
    return yo`<i class="fa fa-bug"></i>`
  }
  return yo`<i class="fa fa-window-maximize"></i>`
}

// exported API
// =

function setup$6 () {
  render$10();
}

// internal methods
// =

function render$10 () {
  var el = document.getElementById('win32-titlebar');
  yo.update(el, yo`<div id="win32-titlebar">
    <a class="win32-titlebar-btn win32-titlebar-minimize" onclick=${onClickMinimize}></a>
    <a class="win32-titlebar-btn win32-titlebar-maximize" onclick=${onClickMaximize}></a>
    <a class="win32-titlebar-btn win32-titlebar-close" onclick=${onClickClose}></a>
  </div>`);
}

// event handlers
// =

function onClickMinimize () {
  electron.remote.getCurrentWindow().minimize();
}

function onClickMaximize () {
  var win = electron.remote.getCurrentWindow();
  if (win.isMaximized()) {
    win.unmaximize();
  } else {
    win.maximize();
  }
}

function onClickClose () {
  electron.remote.getCurrentWindow().close();
}

// exported api
// =

var permsPrompt = function (reqId, webContentsId, permission, opts = {}) {
  var page;
  const respond = decision => {
    electron.ipcRenderer.send('permission-response', reqId, decision);
    if (page) {
      // update page perms
      page.fetchSitePerms();
    }
  };

  // look up the page, deny if failed
  page = getByWebContentsID(webContentsId);
  if (!page) { return respond(false) }

  // lookup the perm description. auto-deny if it's not a known perm.
  const permId = getPermId(permission);
  const permParam = getPermParam(permission);
  const PERM = PERMS[permId];
  if (!PERM) return respond(false)
  const permIcon = PERM.icon;
  var permDesc = PERM.desc;

  // special case for openExternal
  if (permission == 'openExternal') {
    permDesc += shorten(page.getIntendedURL(), 128);
  }

  // run description functions
  if (typeof permDesc === 'function') {
    permDesc = permDesc(permParam, pages$1, opts);
  }

  // create the prompt
  let res = add(page, {
    type: 'permission:' + permission,
    render: ({ rerender, onClose }) => {
      return yo`
        <div>
          <p>This site wants to:</p>
          <p class="perm">
            <i class="fa fa-${permIcon}"></i>
            ${permDesc}
          </p>

          <div class="prompt-btns">
            <button class="btn prompt-reject" onclick=${() => { respond(false); onClose(); }}>Block</button>
            <button class="btn primary prompt-accept" onclick=${() => { respond(true); onClose(); }}>Allow</button>
          </div>

          ${PERM.experimental
            ? yo`
              <div class="perm-experimental">
                <i class="fa fa-info-circle"></i>
                <span>This page is requesting an experimental feature. Only click 'Allow' if you trust this page.</span>
              </div>`
            : ''}
        </div>
      `
    },
    onForceClose: () => {
      respond(false);
    }
  });
  if (!res) respond(false);
};

function setup$7 () {
  electron.ipcRenderer.on('command', function (event, type, arg1, arg2, arg3, arg4) {
    var page = getActive();
    switch (type) {
      case 'initialize': return initializeFromSnapshot(arg1)
      case 'file:new-tab':
        page = create$$1(arg1);
        setActive(page);
        focusLocation(page);
        return
      case 'file:open-location': return focusLocation(page)
      case 'file:close-tab': return remove$$1(page)
      case 'file:reopen-closed-tab': return reopenLastRemoved()
      case 'edit:find': return showInpageFind(page)
      case 'edit:find-next': return findNext(page, true)
      case 'edit:find-previous': return findNext(page, false)
      case 'view:reload': return page.reload()
      case 'view:hard-reload': return page.reloadIgnoringCacheAsync()
      case 'view:zoom-in': return zoomIn(page)
      case 'view:zoom-out': return zoomOut(page)
      case 'view:zoom-reset': return zoomReset(page)
      case 'view:toggle-dev-tools': return page.toggleDevTools()
      case 'view:toggle-javascript-console': return page.toggleDevTools(true)
      case 'view:toggle-live-reloading': return page.toggleLiveReloading()
      case 'history:back': return page.goBackAsync()
      case 'history:forward': return page.goForwardAsync()
      case 'bookmark:create': return bookmarkAndOpenMenu()
      case 'window:next-tab': return changeActiveBy(1)
      case 'window:prev-tab': return changeActiveBy(-1)
      case 'window:last-tab': return changeActiveToLast()
      case 'set-tab': return changeActiveTo(arg1)
      case 'load-pinned-tabs': return loadPinnedFromDB()
      case 'perms:prompt': return permsPrompt(arg1, arg2, arg3, arg4)
      case 'show-modal': return createFromBackgroundProcess(arg1, arg2, arg3, arg4)
    }
  });
}

const isDarwin = window.process.platform === 'darwin';

const SWIPE_TRIGGER_DIST = 400; // how far do you need to travel to trigger the navigation
const ARROW_OFF_DIST = 80; // how far off-screen are the arrows
const RESET_TIMEOUT = 2e3; // how long until we automatically reset the gesture

function setup$8 () {
  var horizontal = 0; // how much x traveled?
  var vertical = 0; // how much y traveled?
  var hnorm = 0; // normalized to a [-1,1] range
  var isTouching = false; // is touch event active?
  var resetTimeout = null;
  var leftSwipeArrowEl = document.getElementById('left-swipe-arrow');
  var rightSwipeArrowEl = document.getElementById('right-swipe-arrow');
  var toolbarSize = document.getElementById('toolbar').clientHeight;

  const canGoBack = () => {
    var page = getActive();
    if (page) return page.canGoBack()
  };
  const shouldGoBack = () => {
    return hnorm <= -1
  };
  const canGoForward = () => {
    var page = getActive();
    if (page) return page.canGoForward()
  };
  const shouldGoForward = () => {
    return hnorm >= 1
  };
  const resetArrows = () => {
    clearTimeout(resetTimeout);
    isTouching = false;
    horizontal = vertical = hnorm = 0;
    leftSwipeArrowEl.classList.add('returning');
    leftSwipeArrowEl.classList.remove('highlight');
    leftSwipeArrowEl.style.left = (-1 * ARROW_OFF_DIST) + 'px';
    rightSwipeArrowEl.classList.add('returning');
    rightSwipeArrowEl.classList.remove('highlight');
    rightSwipeArrowEl.style.right = (-1 * ARROW_OFF_DIST) + 'px';
  };

  window.addEventListener('mousewheel', e => {
    if (!isDarwin && e.ctrlKey === true) {
      var page = getActive();
      if (e.deltaY > 0) zoomOut(page);
      if (e.deltaY < 0) zoomIn(page);
    }

    if (isTouching) {
      // track amount of x & y traveled
      horizontal += e.deltaX;
      vertical += e.deltaY;

      // calculate the normalized horizontal
      if (Math.abs(vertical) > Math.abs(horizontal)) {
        hnorm = 0; // ignore if there's more vertical motion than horizontal
      } else if ((horizontal < 0 && !canGoBack()) || (horizontal > 0 && !canGoForward())) {
        hnorm = horizontal = 0; // ignore if the navigation isnt possible in that direction
      } else {
        hnorm = horizontal / SWIPE_TRIGGER_DIST;
      }
      hnorm = Math.min(1.0, Math.max(-1.0, hnorm)); // clamp to [-1.0, 1.0]

      // calculate arrow positions
      if (horizontal < 0) {
        leftSwipeArrowEl.style.left = ((-1 * ARROW_OFF_DIST) - (hnorm * ARROW_OFF_DIST)) + 'px';
        rightSwipeArrowEl.style.right = (-1 * ARROW_OFF_DIST) + 'px';
      }
      if (horizontal > 0) {
        leftSwipeArrowEl.style.left = (-1 * ARROW_OFF_DIST) + 'px';
        rightSwipeArrowEl.style.right = ((-1 * ARROW_OFF_DIST) + (hnorm * ARROW_OFF_DIST)) + 'px';
      }

      // highlight 
      if (shouldGoBack()) leftSwipeArrowEl.classList.add('highlight');
      else leftSwipeArrowEl.classList.remove('highlight');
      if (shouldGoForward()) rightSwipeArrowEl.classList.add('highlight');
      else rightSwipeArrowEl.classList.remove('highlight');
    }
  });

  // for various humorous reasons, the 'scroll-touch-end' event is emitted in the background process
  // so, listen for it over ipc
  // https://github.com/electron/electron/pull/4181
  electron.ipcRenderer.on('window-event', async function (event, type, data) {
    if (type == 'scroll-touch-begin') {
      leftSwipeArrowEl.classList.remove('returning');
      rightSwipeArrowEl.classList.remove('returning');

      // check if the item under the cursor is scrolling
      let page = getActive();
      if (!page) return
      page.webviewEl.executeJavaScript(`
        (function() {
          var isScrolling = false
          // check if the element under the cursor, or any of its parents, are scrolling horizontally right now
          var el = document.elementFromPoint(${data.cursorX}, ${(data.cursorY - toolbarSize)})
          while (el) {
            if (el.scrollWidth > el.clientWidth) {
              isScrolling = true
              break
            }
            el = el.parentNode
          }
          return isScrolling
        })()
      `, true, (isScrollingEl) => {
        if (isScrollingEl) return // dont do anything
        isTouching = true;
        resetTimeout = setTimeout(resetArrows, RESET_TIMEOUT);
      });
    }

    if (type == 'scroll-touch-end' && isTouching) {
      // trigger navigation
      if (shouldGoBack()) {
        let page = getActive();
        if (page) page.goBackAsync();
      }
      if (shouldGoForward()) {
        let page = getActive();
        if (page) page.goForwardAsync();
      }

      // reset arrows
      resetArrows();
    }
  });
}

function setup$$1 (cb) {
  if (window.process.platform == 'darwin') {
    document.body.classList.add('darwin');
  }
  if (window.process.platform == 'win32') {
    document.body.classList.add('win32');
  }

  // wire up event handlers
  electron.ipcRenderer.on('window-event', onWindowEvent);
  document.addEventListener('dragover', preventDragDrop, false);
  document.addEventListener('drop', preventDragDrop, false);
  function preventDragDrop (event) {
    // important - dont allow drag/drop in the shell window, only into the webview
    if (!event.target || event.target.tagName != 'WEBVIEW') {
      event.preventDefault();
      return false
    }
  }

  // disable zooming in the shell window
  electron.webFrame.setVisualZoomLevelLimits(1, 1);
  electron.webFrame.setLayoutZoomLevelLimits(0, 0);

  // attach some window globals
  window.pages = pages$1;
  window.navbar = navbar;

  // setup subsystems
  setup$1();
  setup$3();
  setup$5();
  if (window.process.platform == 'win32') {
    setup$6();
  }
  setup$7();
  setup$8();
  setup$2();
  setup$4();
  electron.ipcRenderer.send('shell-window:pages-ready');
  on('first-page', cb);
}


function onWindowEvent (event, type) {
  switch (type) {
    case 'blur': return document.body.classList.add('window-blurred')
    case 'focus':
      document.body.classList.remove('window-blurred');
      try { getActive().webviewEl.focus(); } catch (e) {}
      break
    case 'enter-full-screen': return document.body.classList.add('fullscreen')
    case 'leave-full-screen': return document.body.classList.remove('fullscreen')
    case 'leave-page-full-screen': leavePageFullScreen();
  }
}

// exported API
// =

async function getScreenshot (url, {width, height}, {resizeTo} = {}) {
  var webview;
  var hiddenWebviews = document.querySelector('#hidden-webviews');
  try {
    // create the webview
    webview = document.createElement('webview');
    webview.setAttribute('preload', 'file://' + path.join(APP_PATH, 'webview-preload.build.js'));
    webview.setAttribute('webpreferences', 'allowDisplayingInsecureContent,contentIsolation,defaultEncoding=utf-8');
    webview.setAttribute('src', url);
    webview.style.width = `${width}px`;
    webview.style.height = `${height}px`;

    // add to page
    hiddenWebviews.append(webview);

    // wait for load
    await new Promise((resolve, reject) => {
      webview.addEventListener('did-stop-loading', resolve);
    });
    await new Promise(r => setTimeout(r, 100)); // give an extra 100ms for the JS rendering

    // capture the page
    var wc = webview.getWebContents();
    var image = await new Promise((resolve, reject) => {
      wc.capturePage({x: 0, y: 0, width, height}, resolve);
    });

    // resize if asked
    if (resizeTo) {
      image = image.resize(resizeTo);
    }
  } finally {
    if (webview) webview.remove();
  }
  return image
}

const beakerCoreWebview = require ('@beaker/core/webview');
beakerCoreWebview.setup({rpcAPI});
setup$$1(() => {
  electron.ipcRenderer.send('shell-window:ready');
});

// DEBUG
window.getScreenshot = getScreenshot;
window.captureTemplate = async function (url, title) {
  if (!url) throw 'Need url'
  if (!url.startsWith('dat://')) throw new 'Need dat url'
  if (!title) throw 'Need title'
  var screenshot = await getScreenshot(url, {width: 800, height: 600}, {resizeTo: {width: 160, height: 120}});
  await beaker.archives.putTemplate(url, {title, screenshot: screenshot.toDataURL()});
};

},{"@beaker/core/lib/error-page":2,"@beaker/core/webview":18,"bytes":21,"electron":undefined,"events":undefined,"fs":undefined,"lodash.debounce":27,"lodash.get":28,"lodash.throttle":29,"moment":30,"os":undefined,"parse-dat-url":33,"path":undefined,"pauls-electron-rpc":34,"pauls-word-boundary":38,"pretty-hash":39,"url":undefined,"yo-yo":40}],2:[function(require,module,exports){
var errorPageCSS = `
* {
  box-sizing: border-box;
}
a {
  text-decoration: none;
  color: inherit;
  cursor: pointer;
}
body {
  background: #fff;
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Ubuntu, Cantarell, "Oxygen Sans", "Helvetica Neue", sans-serif;
}
.btn {
  display: inline-block;
  cursor: pointer;
  color: #777;
  border-radius: 2px;
  background: #fafafa;
  border: 1px solid #ddd;
  font-size: 12px;
  font-weight: 500;
  height: 25px;
  line-height: 2;
  padding: 0 8px;
  letter-spacing: .2px;
  height: 26px;
  font-weight: 400;
}
.btn * {
  cursor: pointer;
  line-height: 25px;
  vertical-align: baseline;
  display: inline-block;
}
.btn:focus {
  outline-color: #007aff;
}
.btn:hover {
  text-decoration: none;
  background: #f0f0f0;
}
.btn.disabled,
.btn:disabled {
  cursor: default;
  color: #999999;
  border: 1px solid #ccc;
  box-shadow: none;
}
.btn.disabled .spinner,
.btn:disabled .spinner {
  color: #aaa;
}
.btn.primary {
  -webkit-font-smoothing: antialiased;
  font-weight: 800;
  background: #007aff;
  color: #fff;
  border: none;
  transition: background .1s ease;
}
.btn.primary:hover {
  background: #0074f2;
}
a.btn span {
  vertical-align: baseline;
}
a.link {
  color: blue;
  text-decoration: underline;
}
.icon-wrapper {
  vertical-align: top;
  width: 70px;
  font-size: 50px;
  display: inline-block;
  color: #555;

  i {
    margin-top: -3px;
  }
}
.error-wrapper {
  display: inline-block;
  width: 80%;
}
div.error-page-content {
  max-width: 650px;
  margin: auto;
  transform: translateX(-20px);
  margin-top: 30vh;
  color: #777;
  font-size: 14px;
}
div.error-page-content .description {

  p {
    margin: 20px 0;
  }
}
div.error-page-content i {
  margin-right: 5px;
}
div.error-page-content .btn {
  float: right;
}
h1 {
  margin: 0;
  color: #333;
  font-weight: 400;
  font-size: 22px;
}
.icon {
  float: right;
}
li {
  margin-bottom: 0.5em;
}
li:last-child {
  margin: 0;
}
.footer {
  font-size: 14px;
  color: #777;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-top: 30px;
  padding-top: 10px;
  border-top: 1px solid #ddd;
}
`

module.exports = function (e) {
  var title = 'This site can’t be reached'
  var info = ''
  var icon = 'fa-exclamation-circle'
  var button = '<a class="btn" href="javascript:window.location.reload()">Try again</a>'
  var errorDescription
  var moreHelp = ''

  if (typeof e === 'object') {
    errorDescription = e.errorDescription || ''
    // remove trailing slash
    var origin = e.validatedURL.slice(0, e.validatedURL.length - 1)

    // strip protocol
    if (origin.startsWith('https://')) {
      origin = origin.slice(8)
    } else if (origin.startsWith('http://')) {
      origin = origin.slice(7)
    }

    switch (e.errorCode) {
      case -106:
        title = 'No internet connection'
        info = '<p>Your computer is not connected to the internet.</p><p>Try:</p><ul><li>Resetting your Wi-Fi connection<li>Checking your router and modem.</li></ul>'
        break
      case -105:
        icon = 'fa-frown-o'
        info = `<p>Couldn’t resolve the DNS address for <strong>${origin}</strong></p>`
        break
      case 404:
        icon = 'fa-frown-o'
        title = e.title || 'Page Not Found'
        info = `<p>${e.errorInfo}</p>`
        break
      case -501:
        title = 'Your connection is not secure'
        info = `<p>Beaker cannot establish a secure connection to the server for <strong>${origin}</strong>.</p>`
        icon = 'fa-close warning'
        button = '<a class="btn" href="javascript:window.history.back()">Go back</a>'
        break
      case 504:
        title = 'Timed out'
        info = `<p>It took too long to find this ${e.resource} on the peer-to-peer network.</p>`
        errorDescription = `Beaker will keep searching. Wait a few moments and try again.`
        moreHelp = `
          <p>
            Troubleshooting:
          </p>

          <ul>
            <li>Your firewall may be blocking peer-to-peer traffic.<br /><a class="link" href="https://beakerbrowser.com/docs/using-beaker/troubleshooting.html" target="_blank">How to configure your firewall.</a></li>
            <li>There may not be any peers hosting this ${e.resource} right now.<br /><a class="link" href="beaker://swarm-debugger/${e.validatedURL.slice('dat://'.length)}">Open the network debugger</a>.</li>
            <li>If you think this is a bug, copy the <a class="link" href="beaker://debug-log/" target="_blank">debug log</a> and <a class="link" href="https://github.com/beakerbrowser/beaker/issues" target="_blank">file an issue</a>.</li>
          </ul>
        `
        break
    }
  } else {
    errorDescription = e
  }

  return `
    <html>
      <head>
        <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
      </head>
      <body>
        <style>${errorPageCSS}</style>
        <link rel="stylesheet" href="beaker://assets/font-awesome.css">
        <div class="error-page-content">
          <div class="icon-wrapper"><i class="fa ${icon}"></i></div>

          <div class="error-wrapper">
            <h1>${title}</h1>
            <div class="description">
              ${info}
              ${moreHelp}
            </div>
            <div class="footer">
              ${errorDescription}
              ${button}
            </div>
          </div>
        </div>
      </body>
    </html>`.replace(/\n/g, '')
}

},{}],3:[function(require,module,exports){
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

},{"./fg/beaker":4,"./fg/dat-archive":5,"./fg/experimental":7}],4:[function(require,module,exports){
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

},{"../manifests/internal/archives":12,"../manifests/internal/bookmarks":13,"../manifests/internal/browser":14,"../manifests/internal/downloads":15,"../manifests/internal/history":16,"../manifests/internal/sitedata":17,"./event-target":6,"beaker-error-constants":19}],5:[function(require,module,exports){
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

},{"../manifests/external/dat-archive":9,"./event-target":6,"./stat":8,"beaker-error-constants":19,"parse-dat-url":33}],6:[function(require,module,exports){
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

},{}],7:[function(require,module,exports){
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

},{"../manifests/external/experimental/global-fetch":10,"../manifests/external/experimental/library":11,"./event-target":6,"beaker-error-constants":19}],8:[function(require,module,exports){
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

},{}],9:[function(require,module,exports){
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

},{}],10:[function(require,module,exports){
module.exports = {
  fetch: 'promise'
}

},{}],11:[function(require,module,exports){
module.exports = {
  add: 'promise',
  remove: 'promise',
  get: 'promise',
  list: 'promise',

  requestAdd: 'promise',
  requestRemove: 'promise',

  createEventStream: 'readable'
}

},{}],12:[function(require,module,exports){
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

},{}],13:[function(require,module,exports){
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

},{}],14:[function(require,module,exports){
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

},{}],15:[function(require,module,exports){
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

},{}],16:[function(require,module,exports){
module.exports = {
  addVisit: 'promise',
  getVisitHistory: 'promise',
  getMostVisited: 'promise',
  search: 'promise',
  removeVisit: 'promise',
  removeAllVisits: 'promise',
  removeVisitsAfter: 'promise'
}

},{}],17:[function(require,module,exports){
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

},{}],18:[function(require,module,exports){
const webApis = require('./web-apis/fg')

exports.setup = function ({rpcAPI}) {
  webApis.setup({rpcAPI})
}

},{"./web-apis/fg":3}],19:[function(require,module,exports){
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

},{}],20:[function(require,module,exports){
var document = require('global/document')
var hyperx = require('hyperx')
var onload = require('on-load')

var SVGNS = 'http://www.w3.org/2000/svg'
var XLINKNS = 'http://www.w3.org/1999/xlink'

var BOOL_PROPS = {
  autofocus: 1,
  checked: 1,
  defaultchecked: 1,
  disabled: 1,
  formnovalidate: 1,
  indeterminate: 1,
  readonly: 1,
  required: 1,
  selected: 1,
  willvalidate: 1
}
var COMMENT_TAG = '!--'
var SVG_TAGS = [
  'svg',
  'altGlyph', 'altGlyphDef', 'altGlyphItem', 'animate', 'animateColor',
  'animateMotion', 'animateTransform', 'circle', 'clipPath', 'color-profile',
  'cursor', 'defs', 'desc', 'ellipse', 'feBlend', 'feColorMatrix',
  'feComponentTransfer', 'feComposite', 'feConvolveMatrix', 'feDiffuseLighting',
  'feDisplacementMap', 'feDistantLight', 'feFlood', 'feFuncA', 'feFuncB',
  'feFuncG', 'feFuncR', 'feGaussianBlur', 'feImage', 'feMerge', 'feMergeNode',
  'feMorphology', 'feOffset', 'fePointLight', 'feSpecularLighting',
  'feSpotLight', 'feTile', 'feTurbulence', 'filter', 'font', 'font-face',
  'font-face-format', 'font-face-name', 'font-face-src', 'font-face-uri',
  'foreignObject', 'g', 'glyph', 'glyphRef', 'hkern', 'image', 'line',
  'linearGradient', 'marker', 'mask', 'metadata', 'missing-glyph', 'mpath',
  'path', 'pattern', 'polygon', 'polyline', 'radialGradient', 'rect',
  'set', 'stop', 'switch', 'symbol', 'text', 'textPath', 'title', 'tref',
  'tspan', 'use', 'view', 'vkern'
]

function belCreateElement (tag, props, children) {
  var el

  // If an svg tag, it needs a namespace
  if (SVG_TAGS.indexOf(tag) !== -1) {
    props.namespace = SVGNS
  }

  // If we are using a namespace
  var ns = false
  if (props.namespace) {
    ns = props.namespace
    delete props.namespace
  }

  // Create the element
  if (ns) {
    el = document.createElementNS(ns, tag)
  } else if (tag === COMMENT_TAG) {
    return document.createComment(props.comment)
  } else {
    el = document.createElement(tag)
  }

  // If adding onload events
  if (props.onload || props.onunload) {
    var load = props.onload || function () {}
    var unload = props.onunload || function () {}
    onload(el, function belOnload () {
      load(el)
    }, function belOnunload () {
      unload(el)
    },
    // We have to use non-standard `caller` to find who invokes `belCreateElement`
    belCreateElement.caller.caller.caller)
    delete props.onload
    delete props.onunload
  }

  // Create the properties
  for (var p in props) {
    if (props.hasOwnProperty(p)) {
      var key = p.toLowerCase()
      var val = props[p]
      // Normalize className
      if (key === 'classname') {
        key = 'class'
        p = 'class'
      }
      // The for attribute gets transformed to htmlFor, but we just set as for
      if (p === 'htmlFor') {
        p = 'for'
      }
      // If a property is boolean, set itself to the key
      if (BOOL_PROPS[key]) {
        if (val === 'true') val = key
        else if (val === 'false') continue
      }
      // If a property prefers being set directly vs setAttribute
      if (key.slice(0, 2) === 'on') {
        el[p] = val
      } else {
        if (ns) {
          if (p === 'xlink:href') {
            el.setAttributeNS(XLINKNS, p, val)
          } else if (/^xmlns($|:)/i.test(p)) {
            // skip xmlns definitions
          } else {
            el.setAttributeNS(null, p, val)
          }
        } else {
          el.setAttribute(p, val)
        }
      }
    }
  }

  function appendChild (childs) {
    if (!Array.isArray(childs)) return
    for (var i = 0; i < childs.length; i++) {
      var node = childs[i]
      if (Array.isArray(node)) {
        appendChild(node)
        continue
      }

      if (typeof node === 'number' ||
        typeof node === 'boolean' ||
        typeof node === 'function' ||
        node instanceof Date ||
        node instanceof RegExp) {
        node = node.toString()
      }

      if (typeof node === 'string') {
        if (el.lastChild && el.lastChild.nodeName === '#text') {
          el.lastChild.nodeValue += node
          continue
        }
        node = document.createTextNode(node)
      }

      if (node && node.nodeType) {
        el.appendChild(node)
      }
    }
  }
  appendChild(children)

  return el
}

module.exports = hyperx(belCreateElement, {comments: true})
module.exports.default = module.exports
module.exports.createElement = belCreateElement

},{"global/document":23,"hyperx":26,"on-load":32}],21:[function(require,module,exports){
/*!
 * bytes
 * Copyright(c) 2012-2014 TJ Holowaychuk
 * Copyright(c) 2015 Jed Watson
 * MIT Licensed
 */

'use strict';

/**
 * Module exports.
 * @public
 */

module.exports = bytes;
module.exports.format = format;
module.exports.parse = parse;

/**
 * Module variables.
 * @private
 */

var formatThousandsRegExp = /\B(?=(\d{3})+(?!\d))/g;

var formatDecimalsRegExp = /(?:\.0*|(\.[^0]+)0+)$/;

var map = {
  b:  1,
  kb: 1 << 10,
  mb: 1 << 20,
  gb: 1 << 30,
  tb: ((1 << 30) * 1024)
};

// TODO: use is-finite module?
var numberIsFinite = Number.isFinite || function (v) { return typeof v === 'number' && isFinite(v); };

var parseRegExp = /^((-|\+)?(\d+(?:\.\d+)?)) *(kb|mb|gb|tb)$/i;

/**
 * Convert the given value in bytes into a string or parse to string to an integer in bytes.
 *
 * @param {string|number} value
 * @param {{
 *  case: [string],
 *  decimalPlaces: [number]
 *  fixedDecimals: [boolean]
 *  thousandsSeparator: [string]
 *  unitSeparator: [string]
 *  }} [options] bytes options.
 *
 * @returns {string|number|null}
 */

function bytes(value, options) {
  if (typeof value === 'string') {
    return parse(value);
  }

  if (typeof value === 'number') {
    return format(value, options);
  }

  return null;
}

/**
 * Format the given value in bytes into a string.
 *
 * If the value is negative, it is kept as such. If it is a float,
 * it is rounded.
 *
 * @param {number} value
 * @param {object} [options]
 * @param {number} [options.decimalPlaces=2]
 * @param {number} [options.fixedDecimals=false]
 * @param {string} [options.thousandsSeparator=]
 * @param {string} [options.unit=]
 * @param {string} [options.unitSeparator=]
 *
 * @returns {string|null}
 * @public
 */

function format(value, options) {
  if (!numberIsFinite(value)) {
    return null;
  }

  var mag = Math.abs(value);
  var thousandsSeparator = (options && options.thousandsSeparator) || '';
  var unitSeparator = (options && options.unitSeparator) || '';
  var decimalPlaces = (options && options.decimalPlaces !== undefined) ? options.decimalPlaces : 2;
  var fixedDecimals = Boolean(options && options.fixedDecimals);
  var unit = (options && options.unit) || '';

  if (!unit || !map[unit.toLowerCase()]) {
    if (mag >= map.tb) {
      unit = 'TB';
    } else if (mag >= map.gb) {
      unit = 'GB';
    } else if (mag >= map.mb) {
      unit = 'MB';
    } else if (mag >= map.kb) {
      unit = 'kB';
    } else {
      unit = 'B';
    }
  }

  var val = value / map[unit.toLowerCase()];
  var str = val.toFixed(decimalPlaces);

  if (!fixedDecimals) {
    str = str.replace(formatDecimalsRegExp, '$1');
  }

  if (thousandsSeparator) {
    str = str.replace(formatThousandsRegExp, thousandsSeparator);
  }

  return str + unitSeparator + unit;
}

/**
 * Parse the string value into an integer in bytes.
 *
 * If no unit is given, it is assumed the value is in bytes.
 *
 * @param {number|string} val
 *
 * @returns {number|null}
 * @public
 */

function parse(val) {
  if (typeof val === 'number' && !isNaN(val)) {
    return val;
  }

  if (typeof val !== 'string') {
    return null;
  }

  // Test if the string passed is valid
  var results = parseRegExp.exec(val);
  var floatValue;
  var unit = 'b';

  if (!results) {
    // Nothing could be extracted from the given string
    floatValue = parseInt(val, 10);
    unit = 'b'
  } else {
    // Retrieve the value and the unit
    floatValue = parseFloat(results[1]);
    unit = results[4].toLowerCase();
  }

  return Math.floor(map[unit] * floatValue);
}

},{}],22:[function(require,module,exports){
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

},{"stream":undefined}],23:[function(require,module,exports){
(function (global){
var topLevel = typeof global !== 'undefined' ? global :
    typeof window !== 'undefined' ? window : {}
var minDoc = require('min-document');

var doccy;

if (typeof document !== 'undefined') {
    doccy = document;
} else {
    doccy = topLevel['__GLOBAL_DOCUMENT_CACHE@4'];

    if (!doccy) {
        doccy = topLevel['__GLOBAL_DOCUMENT_CACHE@4'] = minDoc;
    }
}

module.exports = doccy;

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"min-document":42}],24:[function(require,module,exports){
(function (global){
var win;

if (typeof window !== "undefined") {
    win = window;
} else if (typeof global !== "undefined") {
    win = global;
} else if (typeof self !== "undefined"){
    win = self;
} else {
    win = {};
}

module.exports = win;

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],25:[function(require,module,exports){
module.exports = attributeToProperty

var transform = {
  'class': 'className',
  'for': 'htmlFor',
  'http-equiv': 'httpEquiv'
}

function attributeToProperty (h) {
  return function (tagName, attrs, children) {
    for (var attr in attrs) {
      if (attr in transform) {
        attrs[transform[attr]] = attrs[attr]
        delete attrs[attr]
      }
    }
    return h(tagName, attrs, children)
  }
}

},{}],26:[function(require,module,exports){
var attrToProp = require('hyperscript-attribute-to-property')

var VAR = 0, TEXT = 1, OPEN = 2, CLOSE = 3, ATTR = 4
var ATTR_KEY = 5, ATTR_KEY_W = 6
var ATTR_VALUE_W = 7, ATTR_VALUE = 8
var ATTR_VALUE_SQ = 9, ATTR_VALUE_DQ = 10
var ATTR_EQ = 11, ATTR_BREAK = 12
var COMMENT = 13

module.exports = function (h, opts) {
  if (!opts) opts = {}
  var concat = opts.concat || function (a, b) {
    return String(a) + String(b)
  }
  if (opts.attrToProp !== false) {
    h = attrToProp(h)
  }

  return function (strings) {
    var state = TEXT, reg = ''
    var arglen = arguments.length
    var parts = []

    for (var i = 0; i < strings.length; i++) {
      if (i < arglen - 1) {
        var arg = arguments[i+1]
        var p = parse(strings[i])
        var xstate = state
        if (xstate === ATTR_VALUE_DQ) xstate = ATTR_VALUE
        if (xstate === ATTR_VALUE_SQ) xstate = ATTR_VALUE
        if (xstate === ATTR_VALUE_W) xstate = ATTR_VALUE
        if (xstate === ATTR) xstate = ATTR_KEY
        if (xstate === OPEN) {
          if (reg === '/') {
            p.push([ OPEN, '/', arg ])
            reg = ''
          } else {
            p.push([ OPEN, arg ])
          }
        } else {
          p.push([ VAR, xstate, arg ])
        }
        parts.push.apply(parts, p)
      } else parts.push.apply(parts, parse(strings[i]))
    }

    var tree = [null,{},[]]
    var stack = [[tree,-1]]
    for (var i = 0; i < parts.length; i++) {
      var cur = stack[stack.length-1][0]
      var p = parts[i], s = p[0]
      if (s === OPEN && /^\//.test(p[1])) {
        var ix = stack[stack.length-1][1]
        if (stack.length > 1) {
          stack.pop()
          stack[stack.length-1][0][2][ix] = h(
            cur[0], cur[1], cur[2].length ? cur[2] : undefined
          )
        }
      } else if (s === OPEN) {
        var c = [p[1],{},[]]
        cur[2].push(c)
        stack.push([c,cur[2].length-1])
      } else if (s === ATTR_KEY || (s === VAR && p[1] === ATTR_KEY)) {
        var key = ''
        var copyKey
        for (; i < parts.length; i++) {
          if (parts[i][0] === ATTR_KEY) {
            key = concat(key, parts[i][1])
          } else if (parts[i][0] === VAR && parts[i][1] === ATTR_KEY) {
            if (typeof parts[i][2] === 'object' && !key) {
              for (copyKey in parts[i][2]) {
                if (parts[i][2].hasOwnProperty(copyKey) && !cur[1][copyKey]) {
                  cur[1][copyKey] = parts[i][2][copyKey]
                }
              }
            } else {
              key = concat(key, parts[i][2])
            }
          } else break
        }
        if (parts[i][0] === ATTR_EQ) i++
        var j = i
        for (; i < parts.length; i++) {
          if (parts[i][0] === ATTR_VALUE || parts[i][0] === ATTR_KEY) {
            if (!cur[1][key]) cur[1][key] = strfn(parts[i][1])
            else parts[i][1]==="" || (cur[1][key] = concat(cur[1][key], parts[i][1]));
          } else if (parts[i][0] === VAR
          && (parts[i][1] === ATTR_VALUE || parts[i][1] === ATTR_KEY)) {
            if (!cur[1][key]) cur[1][key] = strfn(parts[i][2])
            else parts[i][2]==="" || (cur[1][key] = concat(cur[1][key], parts[i][2]));
          } else {
            if (key.length && !cur[1][key] && i === j
            && (parts[i][0] === CLOSE || parts[i][0] === ATTR_BREAK)) {
              // https://html.spec.whatwg.org/multipage/infrastructure.html#boolean-attributes
              // empty string is falsy, not well behaved value in browser
              cur[1][key] = key.toLowerCase()
            }
            if (parts[i][0] === CLOSE) {
              i--
            }
            break
          }
        }
      } else if (s === ATTR_KEY) {
        cur[1][p[1]] = true
      } else if (s === VAR && p[1] === ATTR_KEY) {
        cur[1][p[2]] = true
      } else if (s === CLOSE) {
        if (selfClosing(cur[0]) && stack.length) {
          var ix = stack[stack.length-1][1]
          stack.pop()
          stack[stack.length-1][0][2][ix] = h(
            cur[0], cur[1], cur[2].length ? cur[2] : undefined
          )
        }
      } else if (s === VAR && p[1] === TEXT) {
        if (p[2] === undefined || p[2] === null) p[2] = ''
        else if (!p[2]) p[2] = concat('', p[2])
        if (Array.isArray(p[2][0])) {
          cur[2].push.apply(cur[2], p[2])
        } else {
          cur[2].push(p[2])
        }
      } else if (s === TEXT) {
        cur[2].push(p[1])
      } else if (s === ATTR_EQ || s === ATTR_BREAK) {
        // no-op
      } else {
        throw new Error('unhandled: ' + s)
      }
    }

    if (tree[2].length > 1 && /^\s*$/.test(tree[2][0])) {
      tree[2].shift()
    }

    if (tree[2].length > 2
    || (tree[2].length === 2 && /\S/.test(tree[2][1]))) {
      throw new Error(
        'multiple root elements must be wrapped in an enclosing tag'
      )
    }
    if (Array.isArray(tree[2][0]) && typeof tree[2][0][0] === 'string'
    && Array.isArray(tree[2][0][2])) {
      tree[2][0] = h(tree[2][0][0], tree[2][0][1], tree[2][0][2])
    }
    return tree[2][0]

    function parse (str) {
      var res = []
      if (state === ATTR_VALUE_W) state = ATTR
      for (var i = 0; i < str.length; i++) {
        var c = str.charAt(i)
        if (state === TEXT && c === '<') {
          if (reg.length) res.push([TEXT, reg])
          reg = ''
          state = OPEN
        } else if (c === '>' && !quot(state) && state !== COMMENT) {
          if (state === OPEN && reg.length) {
            res.push([OPEN,reg])
          } else if (state === ATTR_KEY) {
            res.push([ATTR_KEY,reg])
          } else if (state === ATTR_VALUE && reg.length) {
            res.push([ATTR_VALUE,reg])
          }
          res.push([CLOSE])
          reg = ''
          state = TEXT
        } else if (state === COMMENT && /-$/.test(reg) && c === '-') {
          if (opts.comments) {
            res.push([ATTR_VALUE,reg.substr(0, reg.length - 1)],[CLOSE])
          }
          reg = ''
          state = TEXT
        } else if (state === OPEN && /^!--$/.test(reg)) {
          if (opts.comments) {
            res.push([OPEN, reg],[ATTR_KEY,'comment'],[ATTR_EQ])
          }
          reg = c
          state = COMMENT
        } else if (state === TEXT || state === COMMENT) {
          reg += c
        } else if (state === OPEN && c === '/' && reg.length) {
          // no-op, self closing tag without a space <br/>
        } else if (state === OPEN && /\s/.test(c)) {
          if (reg.length) {
            res.push([OPEN, reg])
          }
          reg = ''
          state = ATTR
        } else if (state === OPEN) {
          reg += c
        } else if (state === ATTR && /[^\s"'=/]/.test(c)) {
          state = ATTR_KEY
          reg = c
        } else if (state === ATTR && /\s/.test(c)) {
          if (reg.length) res.push([ATTR_KEY,reg])
          res.push([ATTR_BREAK])
        } else if (state === ATTR_KEY && /\s/.test(c)) {
          res.push([ATTR_KEY,reg])
          reg = ''
          state = ATTR_KEY_W
        } else if (state === ATTR_KEY && c === '=') {
          res.push([ATTR_KEY,reg],[ATTR_EQ])
          reg = ''
          state = ATTR_VALUE_W
        } else if (state === ATTR_KEY) {
          reg += c
        } else if ((state === ATTR_KEY_W || state === ATTR) && c === '=') {
          res.push([ATTR_EQ])
          state = ATTR_VALUE_W
        } else if ((state === ATTR_KEY_W || state === ATTR) && !/\s/.test(c)) {
          res.push([ATTR_BREAK])
          if (/[\w-]/.test(c)) {
            reg += c
            state = ATTR_KEY
          } else state = ATTR
        } else if (state === ATTR_VALUE_W && c === '"') {
          state = ATTR_VALUE_DQ
        } else if (state === ATTR_VALUE_W && c === "'") {
          state = ATTR_VALUE_SQ
        } else if (state === ATTR_VALUE_DQ && c === '"') {
          res.push([ATTR_VALUE,reg],[ATTR_BREAK])
          reg = ''
          state = ATTR
        } else if (state === ATTR_VALUE_SQ && c === "'") {
          res.push([ATTR_VALUE,reg],[ATTR_BREAK])
          reg = ''
          state = ATTR
        } else if (state === ATTR_VALUE_W && !/\s/.test(c)) {
          state = ATTR_VALUE
          i--
        } else if (state === ATTR_VALUE && /\s/.test(c)) {
          res.push([ATTR_VALUE,reg],[ATTR_BREAK])
          reg = ''
          state = ATTR
        } else if (state === ATTR_VALUE || state === ATTR_VALUE_SQ
        || state === ATTR_VALUE_DQ) {
          reg += c
        }
      }
      if (state === TEXT && reg.length) {
        res.push([TEXT,reg])
        reg = ''
      } else if (state === ATTR_VALUE && reg.length) {
        res.push([ATTR_VALUE,reg])
        reg = ''
      } else if (state === ATTR_VALUE_DQ && reg.length) {
        res.push([ATTR_VALUE,reg])
        reg = ''
      } else if (state === ATTR_VALUE_SQ && reg.length) {
        res.push([ATTR_VALUE,reg])
        reg = ''
      } else if (state === ATTR_KEY) {
        res.push([ATTR_KEY,reg])
        reg = ''
      }
      return res
    }
  }

  function strfn (x) {
    if (typeof x === 'function') return x
    else if (typeof x === 'string') return x
    else if (x && typeof x === 'object') return x
    else return concat('', x)
  }
}

function quot (state) {
  return state === ATTR_VALUE_SQ || state === ATTR_VALUE_DQ
}

var hasOwn = Object.prototype.hasOwnProperty
function has (obj, key) { return hasOwn.call(obj, key) }

var closeRE = RegExp('^(' + [
  'area', 'base', 'basefont', 'bgsound', 'br', 'col', 'command', 'embed',
  'frame', 'hr', 'img', 'input', 'isindex', 'keygen', 'link', 'meta', 'param',
  'source', 'track', 'wbr', '!--',
  // SVG TAGS
  'animate', 'animateTransform', 'circle', 'cursor', 'desc', 'ellipse',
  'feBlend', 'feColorMatrix', 'feComposite',
  'feConvolveMatrix', 'feDiffuseLighting', 'feDisplacementMap',
  'feDistantLight', 'feFlood', 'feFuncA', 'feFuncB', 'feFuncG', 'feFuncR',
  'feGaussianBlur', 'feImage', 'feMergeNode', 'feMorphology',
  'feOffset', 'fePointLight', 'feSpecularLighting', 'feSpotLight', 'feTile',
  'feTurbulence', 'font-face-format', 'font-face-name', 'font-face-uri',
  'glyph', 'glyphRef', 'hkern', 'image', 'line', 'missing-glyph', 'mpath',
  'path', 'polygon', 'polyline', 'rect', 'set', 'stop', 'tref', 'use', 'view',
  'vkern'
].join('|') + ')(?:[\.#][a-zA-Z0-9\u007F-\uFFFF_:-]+)*$')
function selfClosing (tag) { return closeRE.test(tag) }

},{"hyperscript-attribute-to-property":25}],27:[function(require,module,exports){
(function (global){
/**
 * lodash (Custom Build) <https://lodash.com/>
 * Build: `lodash modularize exports="npm" -o ./`
 * Copyright jQuery Foundation and other contributors <https://jquery.org/>
 * Released under MIT license <https://lodash.com/license>
 * Based on Underscore.js 1.8.3 <http://underscorejs.org/LICENSE>
 * Copyright Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 */

/** Used as the `TypeError` message for "Functions" methods. */
var FUNC_ERROR_TEXT = 'Expected a function';

/** Used as references for various `Number` constants. */
var NAN = 0 / 0;

/** `Object#toString` result references. */
var symbolTag = '[object Symbol]';

/** Used to match leading and trailing whitespace. */
var reTrim = /^\s+|\s+$/g;

/** Used to detect bad signed hexadecimal string values. */
var reIsBadHex = /^[-+]0x[0-9a-f]+$/i;

/** Used to detect binary string values. */
var reIsBinary = /^0b[01]+$/i;

/** Used to detect octal string values. */
var reIsOctal = /^0o[0-7]+$/i;

/** Built-in method references without a dependency on `root`. */
var freeParseInt = parseInt;

/** Detect free variable `global` from Node.js. */
var freeGlobal = typeof global == 'object' && global && global.Object === Object && global;

/** Detect free variable `self`. */
var freeSelf = typeof self == 'object' && self && self.Object === Object && self;

/** Used as a reference to the global object. */
var root = freeGlobal || freeSelf || Function('return this')();

/** Used for built-in method references. */
var objectProto = Object.prototype;

/**
 * Used to resolve the
 * [`toStringTag`](http://ecma-international.org/ecma-262/7.0/#sec-object.prototype.tostring)
 * of values.
 */
var objectToString = objectProto.toString;

/* Built-in method references for those with the same name as other `lodash` methods. */
var nativeMax = Math.max,
    nativeMin = Math.min;

/**
 * Gets the timestamp of the number of milliseconds that have elapsed since
 * the Unix epoch (1 January 1970 00:00:00 UTC).
 *
 * @static
 * @memberOf _
 * @since 2.4.0
 * @category Date
 * @returns {number} Returns the timestamp.
 * @example
 *
 * _.defer(function(stamp) {
 *   console.log(_.now() - stamp);
 * }, _.now());
 * // => Logs the number of milliseconds it took for the deferred invocation.
 */
var now = function() {
  return root.Date.now();
};

/**
 * Creates a debounced function that delays invoking `func` until after `wait`
 * milliseconds have elapsed since the last time the debounced function was
 * invoked. The debounced function comes with a `cancel` method to cancel
 * delayed `func` invocations and a `flush` method to immediately invoke them.
 * Provide `options` to indicate whether `func` should be invoked on the
 * leading and/or trailing edge of the `wait` timeout. The `func` is invoked
 * with the last arguments provided to the debounced function. Subsequent
 * calls to the debounced function return the result of the last `func`
 * invocation.
 *
 * **Note:** If `leading` and `trailing` options are `true`, `func` is
 * invoked on the trailing edge of the timeout only if the debounced function
 * is invoked more than once during the `wait` timeout.
 *
 * If `wait` is `0` and `leading` is `false`, `func` invocation is deferred
 * until to the next tick, similar to `setTimeout` with a timeout of `0`.
 *
 * See [David Corbacho's article](https://css-tricks.com/debouncing-throttling-explained-examples/)
 * for details over the differences between `_.debounce` and `_.throttle`.
 *
 * @static
 * @memberOf _
 * @since 0.1.0
 * @category Function
 * @param {Function} func The function to debounce.
 * @param {number} [wait=0] The number of milliseconds to delay.
 * @param {Object} [options={}] The options object.
 * @param {boolean} [options.leading=false]
 *  Specify invoking on the leading edge of the timeout.
 * @param {number} [options.maxWait]
 *  The maximum time `func` is allowed to be delayed before it's invoked.
 * @param {boolean} [options.trailing=true]
 *  Specify invoking on the trailing edge of the timeout.
 * @returns {Function} Returns the new debounced function.
 * @example
 *
 * // Avoid costly calculations while the window size is in flux.
 * jQuery(window).on('resize', _.debounce(calculateLayout, 150));
 *
 * // Invoke `sendMail` when clicked, debouncing subsequent calls.
 * jQuery(element).on('click', _.debounce(sendMail, 300, {
 *   'leading': true,
 *   'trailing': false
 * }));
 *
 * // Ensure `batchLog` is invoked once after 1 second of debounced calls.
 * var debounced = _.debounce(batchLog, 250, { 'maxWait': 1000 });
 * var source = new EventSource('/stream');
 * jQuery(source).on('message', debounced);
 *
 * // Cancel the trailing debounced invocation.
 * jQuery(window).on('popstate', debounced.cancel);
 */
function debounce(func, wait, options) {
  var lastArgs,
      lastThis,
      maxWait,
      result,
      timerId,
      lastCallTime,
      lastInvokeTime = 0,
      leading = false,
      maxing = false,
      trailing = true;

  if (typeof func != 'function') {
    throw new TypeError(FUNC_ERROR_TEXT);
  }
  wait = toNumber(wait) || 0;
  if (isObject(options)) {
    leading = !!options.leading;
    maxing = 'maxWait' in options;
    maxWait = maxing ? nativeMax(toNumber(options.maxWait) || 0, wait) : maxWait;
    trailing = 'trailing' in options ? !!options.trailing : trailing;
  }

  function invokeFunc(time) {
    var args = lastArgs,
        thisArg = lastThis;

    lastArgs = lastThis = undefined;
    lastInvokeTime = time;
    result = func.apply(thisArg, args);
    return result;
  }

  function leadingEdge(time) {
    // Reset any `maxWait` timer.
    lastInvokeTime = time;
    // Start the timer for the trailing edge.
    timerId = setTimeout(timerExpired, wait);
    // Invoke the leading edge.
    return leading ? invokeFunc(time) : result;
  }

  function remainingWait(time) {
    var timeSinceLastCall = time - lastCallTime,
        timeSinceLastInvoke = time - lastInvokeTime,
        result = wait - timeSinceLastCall;

    return maxing ? nativeMin(result, maxWait - timeSinceLastInvoke) : result;
  }

  function shouldInvoke(time) {
    var timeSinceLastCall = time - lastCallTime,
        timeSinceLastInvoke = time - lastInvokeTime;

    // Either this is the first call, activity has stopped and we're at the
    // trailing edge, the system time has gone backwards and we're treating
    // it as the trailing edge, or we've hit the `maxWait` limit.
    return (lastCallTime === undefined || (timeSinceLastCall >= wait) ||
      (timeSinceLastCall < 0) || (maxing && timeSinceLastInvoke >= maxWait));
  }

  function timerExpired() {
    var time = now();
    if (shouldInvoke(time)) {
      return trailingEdge(time);
    }
    // Restart the timer.
    timerId = setTimeout(timerExpired, remainingWait(time));
  }

  function trailingEdge(time) {
    timerId = undefined;

    // Only invoke if we have `lastArgs` which means `func` has been
    // debounced at least once.
    if (trailing && lastArgs) {
      return invokeFunc(time);
    }
    lastArgs = lastThis = undefined;
    return result;
  }

  function cancel() {
    if (timerId !== undefined) {
      clearTimeout(timerId);
    }
    lastInvokeTime = 0;
    lastArgs = lastCallTime = lastThis = timerId = undefined;
  }

  function flush() {
    return timerId === undefined ? result : trailingEdge(now());
  }

  function debounced() {
    var time = now(),
        isInvoking = shouldInvoke(time);

    lastArgs = arguments;
    lastThis = this;
    lastCallTime = time;

    if (isInvoking) {
      if (timerId === undefined) {
        return leadingEdge(lastCallTime);
      }
      if (maxing) {
        // Handle invocations in a tight loop.
        timerId = setTimeout(timerExpired, wait);
        return invokeFunc(lastCallTime);
      }
    }
    if (timerId === undefined) {
      timerId = setTimeout(timerExpired, wait);
    }
    return result;
  }
  debounced.cancel = cancel;
  debounced.flush = flush;
  return debounced;
}

/**
 * Checks if `value` is the
 * [language type](http://www.ecma-international.org/ecma-262/7.0/#sec-ecmascript-language-types)
 * of `Object`. (e.g. arrays, functions, objects, regexes, `new Number(0)`, and `new String('')`)
 *
 * @static
 * @memberOf _
 * @since 0.1.0
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is an object, else `false`.
 * @example
 *
 * _.isObject({});
 * // => true
 *
 * _.isObject([1, 2, 3]);
 * // => true
 *
 * _.isObject(_.noop);
 * // => true
 *
 * _.isObject(null);
 * // => false
 */
function isObject(value) {
  var type = typeof value;
  return !!value && (type == 'object' || type == 'function');
}

/**
 * Checks if `value` is object-like. A value is object-like if it's not `null`
 * and has a `typeof` result of "object".
 *
 * @static
 * @memberOf _
 * @since 4.0.0
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is object-like, else `false`.
 * @example
 *
 * _.isObjectLike({});
 * // => true
 *
 * _.isObjectLike([1, 2, 3]);
 * // => true
 *
 * _.isObjectLike(_.noop);
 * // => false
 *
 * _.isObjectLike(null);
 * // => false
 */
function isObjectLike(value) {
  return !!value && typeof value == 'object';
}

/**
 * Checks if `value` is classified as a `Symbol` primitive or object.
 *
 * @static
 * @memberOf _
 * @since 4.0.0
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is a symbol, else `false`.
 * @example
 *
 * _.isSymbol(Symbol.iterator);
 * // => true
 *
 * _.isSymbol('abc');
 * // => false
 */
function isSymbol(value) {
  return typeof value == 'symbol' ||
    (isObjectLike(value) && objectToString.call(value) == symbolTag);
}

/**
 * Converts `value` to a number.
 *
 * @static
 * @memberOf _
 * @since 4.0.0
 * @category Lang
 * @param {*} value The value to process.
 * @returns {number} Returns the number.
 * @example
 *
 * _.toNumber(3.2);
 * // => 3.2
 *
 * _.toNumber(Number.MIN_VALUE);
 * // => 5e-324
 *
 * _.toNumber(Infinity);
 * // => Infinity
 *
 * _.toNumber('3.2');
 * // => 3.2
 */
function toNumber(value) {
  if (typeof value == 'number') {
    return value;
  }
  if (isSymbol(value)) {
    return NAN;
  }
  if (isObject(value)) {
    var other = typeof value.valueOf == 'function' ? value.valueOf() : value;
    value = isObject(other) ? (other + '') : other;
  }
  if (typeof value != 'string') {
    return value === 0 ? value : +value;
  }
  value = value.replace(reTrim, '');
  var isBinary = reIsBinary.test(value);
  return (isBinary || reIsOctal.test(value))
    ? freeParseInt(value.slice(2), isBinary ? 2 : 8)
    : (reIsBadHex.test(value) ? NAN : +value);
}

module.exports = debounce;

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],28:[function(require,module,exports){
(function (global){
/**
 * lodash (Custom Build) <https://lodash.com/>
 * Build: `lodash modularize exports="npm" -o ./`
 * Copyright jQuery Foundation and other contributors <https://jquery.org/>
 * Released under MIT license <https://lodash.com/license>
 * Based on Underscore.js 1.8.3 <http://underscorejs.org/LICENSE>
 * Copyright Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 */

/** Used as the `TypeError` message for "Functions" methods. */
var FUNC_ERROR_TEXT = 'Expected a function';

/** Used to stand-in for `undefined` hash values. */
var HASH_UNDEFINED = '__lodash_hash_undefined__';

/** Used as references for various `Number` constants. */
var INFINITY = 1 / 0;

/** `Object#toString` result references. */
var funcTag = '[object Function]',
    genTag = '[object GeneratorFunction]',
    symbolTag = '[object Symbol]';

/** Used to match property names within property paths. */
var reIsDeepProp = /\.|\[(?:[^[\]]*|(["'])(?:(?!\1)[^\\]|\\.)*?\1)\]/,
    reIsPlainProp = /^\w*$/,
    reLeadingDot = /^\./,
    rePropName = /[^.[\]]+|\[(?:(-?\d+(?:\.\d+)?)|(["'])((?:(?!\2)[^\\]|\\.)*?)\2)\]|(?=(?:\.|\[\])(?:\.|\[\]|$))/g;

/**
 * Used to match `RegExp`
 * [syntax characters](http://ecma-international.org/ecma-262/7.0/#sec-patterns).
 */
var reRegExpChar = /[\\^$.*+?()[\]{}|]/g;

/** Used to match backslashes in property paths. */
var reEscapeChar = /\\(\\)?/g;

/** Used to detect host constructors (Safari). */
var reIsHostCtor = /^\[object .+?Constructor\]$/;

/** Detect free variable `global` from Node.js. */
var freeGlobal = typeof global == 'object' && global && global.Object === Object && global;

/** Detect free variable `self`. */
var freeSelf = typeof self == 'object' && self && self.Object === Object && self;

/** Used as a reference to the global object. */
var root = freeGlobal || freeSelf || Function('return this')();

/**
 * Gets the value at `key` of `object`.
 *
 * @private
 * @param {Object} [object] The object to query.
 * @param {string} key The key of the property to get.
 * @returns {*} Returns the property value.
 */
function getValue(object, key) {
  return object == null ? undefined : object[key];
}

/**
 * Checks if `value` is a host object in IE < 9.
 *
 * @private
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is a host object, else `false`.
 */
function isHostObject(value) {
  // Many host objects are `Object` objects that can coerce to strings
  // despite having improperly defined `toString` methods.
  var result = false;
  if (value != null && typeof value.toString != 'function') {
    try {
      result = !!(value + '');
    } catch (e) {}
  }
  return result;
}

/** Used for built-in method references. */
var arrayProto = Array.prototype,
    funcProto = Function.prototype,
    objectProto = Object.prototype;

/** Used to detect overreaching core-js shims. */
var coreJsData = root['__core-js_shared__'];

/** Used to detect methods masquerading as native. */
var maskSrcKey = (function() {
  var uid = /[^.]+$/.exec(coreJsData && coreJsData.keys && coreJsData.keys.IE_PROTO || '');
  return uid ? ('Symbol(src)_1.' + uid) : '';
}());

/** Used to resolve the decompiled source of functions. */
var funcToString = funcProto.toString;

/** Used to check objects for own properties. */
var hasOwnProperty = objectProto.hasOwnProperty;

/**
 * Used to resolve the
 * [`toStringTag`](http://ecma-international.org/ecma-262/7.0/#sec-object.prototype.tostring)
 * of values.
 */
var objectToString = objectProto.toString;

/** Used to detect if a method is native. */
var reIsNative = RegExp('^' +
  funcToString.call(hasOwnProperty).replace(reRegExpChar, '\\$&')
  .replace(/hasOwnProperty|(function).*?(?=\\\()| for .+?(?=\\\])/g, '$1.*?') + '$'
);

/** Built-in value references. */
var Symbol = root.Symbol,
    splice = arrayProto.splice;

/* Built-in method references that are verified to be native. */
var Map = getNative(root, 'Map'),
    nativeCreate = getNative(Object, 'create');

/** Used to convert symbols to primitives and strings. */
var symbolProto = Symbol ? Symbol.prototype : undefined,
    symbolToString = symbolProto ? symbolProto.toString : undefined;

/**
 * Creates a hash object.
 *
 * @private
 * @constructor
 * @param {Array} [entries] The key-value pairs to cache.
 */
function Hash(entries) {
  var index = -1,
      length = entries ? entries.length : 0;

  this.clear();
  while (++index < length) {
    var entry = entries[index];
    this.set(entry[0], entry[1]);
  }
}

/**
 * Removes all key-value entries from the hash.
 *
 * @private
 * @name clear
 * @memberOf Hash
 */
function hashClear() {
  this.__data__ = nativeCreate ? nativeCreate(null) : {};
}

/**
 * Removes `key` and its value from the hash.
 *
 * @private
 * @name delete
 * @memberOf Hash
 * @param {Object} hash The hash to modify.
 * @param {string} key The key of the value to remove.
 * @returns {boolean} Returns `true` if the entry was removed, else `false`.
 */
function hashDelete(key) {
  return this.has(key) && delete this.__data__[key];
}

/**
 * Gets the hash value for `key`.
 *
 * @private
 * @name get
 * @memberOf Hash
 * @param {string} key The key of the value to get.
 * @returns {*} Returns the entry value.
 */
function hashGet(key) {
  var data = this.__data__;
  if (nativeCreate) {
    var result = data[key];
    return result === HASH_UNDEFINED ? undefined : result;
  }
  return hasOwnProperty.call(data, key) ? data[key] : undefined;
}

/**
 * Checks if a hash value for `key` exists.
 *
 * @private
 * @name has
 * @memberOf Hash
 * @param {string} key The key of the entry to check.
 * @returns {boolean} Returns `true` if an entry for `key` exists, else `false`.
 */
function hashHas(key) {
  var data = this.__data__;
  return nativeCreate ? data[key] !== undefined : hasOwnProperty.call(data, key);
}

/**
 * Sets the hash `key` to `value`.
 *
 * @private
 * @name set
 * @memberOf Hash
 * @param {string} key The key of the value to set.
 * @param {*} value The value to set.
 * @returns {Object} Returns the hash instance.
 */
function hashSet(key, value) {
  var data = this.__data__;
  data[key] = (nativeCreate && value === undefined) ? HASH_UNDEFINED : value;
  return this;
}

// Add methods to `Hash`.
Hash.prototype.clear = hashClear;
Hash.prototype['delete'] = hashDelete;
Hash.prototype.get = hashGet;
Hash.prototype.has = hashHas;
Hash.prototype.set = hashSet;

/**
 * Creates an list cache object.
 *
 * @private
 * @constructor
 * @param {Array} [entries] The key-value pairs to cache.
 */
function ListCache(entries) {
  var index = -1,
      length = entries ? entries.length : 0;

  this.clear();
  while (++index < length) {
    var entry = entries[index];
    this.set(entry[0], entry[1]);
  }
}

/**
 * Removes all key-value entries from the list cache.
 *
 * @private
 * @name clear
 * @memberOf ListCache
 */
function listCacheClear() {
  this.__data__ = [];
}

/**
 * Removes `key` and its value from the list cache.
 *
 * @private
 * @name delete
 * @memberOf ListCache
 * @param {string} key The key of the value to remove.
 * @returns {boolean} Returns `true` if the entry was removed, else `false`.
 */
function listCacheDelete(key) {
  var data = this.__data__,
      index = assocIndexOf(data, key);

  if (index < 0) {
    return false;
  }
  var lastIndex = data.length - 1;
  if (index == lastIndex) {
    data.pop();
  } else {
    splice.call(data, index, 1);
  }
  return true;
}

/**
 * Gets the list cache value for `key`.
 *
 * @private
 * @name get
 * @memberOf ListCache
 * @param {string} key The key of the value to get.
 * @returns {*} Returns the entry value.
 */
function listCacheGet(key) {
  var data = this.__data__,
      index = assocIndexOf(data, key);

  return index < 0 ? undefined : data[index][1];
}

/**
 * Checks if a list cache value for `key` exists.
 *
 * @private
 * @name has
 * @memberOf ListCache
 * @param {string} key The key of the entry to check.
 * @returns {boolean} Returns `true` if an entry for `key` exists, else `false`.
 */
function listCacheHas(key) {
  return assocIndexOf(this.__data__, key) > -1;
}

/**
 * Sets the list cache `key` to `value`.
 *
 * @private
 * @name set
 * @memberOf ListCache
 * @param {string} key The key of the value to set.
 * @param {*} value The value to set.
 * @returns {Object} Returns the list cache instance.
 */
function listCacheSet(key, value) {
  var data = this.__data__,
      index = assocIndexOf(data, key);

  if (index < 0) {
    data.push([key, value]);
  } else {
    data[index][1] = value;
  }
  return this;
}

// Add methods to `ListCache`.
ListCache.prototype.clear = listCacheClear;
ListCache.prototype['delete'] = listCacheDelete;
ListCache.prototype.get = listCacheGet;
ListCache.prototype.has = listCacheHas;
ListCache.prototype.set = listCacheSet;

/**
 * Creates a map cache object to store key-value pairs.
 *
 * @private
 * @constructor
 * @param {Array} [entries] The key-value pairs to cache.
 */
function MapCache(entries) {
  var index = -1,
      length = entries ? entries.length : 0;

  this.clear();
  while (++index < length) {
    var entry = entries[index];
    this.set(entry[0], entry[1]);
  }
}

/**
 * Removes all key-value entries from the map.
 *
 * @private
 * @name clear
 * @memberOf MapCache
 */
function mapCacheClear() {
  this.__data__ = {
    'hash': new Hash,
    'map': new (Map || ListCache),
    'string': new Hash
  };
}

/**
 * Removes `key` and its value from the map.
 *
 * @private
 * @name delete
 * @memberOf MapCache
 * @param {string} key The key of the value to remove.
 * @returns {boolean} Returns `true` if the entry was removed, else `false`.
 */
function mapCacheDelete(key) {
  return getMapData(this, key)['delete'](key);
}

/**
 * Gets the map value for `key`.
 *
 * @private
 * @name get
 * @memberOf MapCache
 * @param {string} key The key of the value to get.
 * @returns {*} Returns the entry value.
 */
function mapCacheGet(key) {
  return getMapData(this, key).get(key);
}

/**
 * Checks if a map value for `key` exists.
 *
 * @private
 * @name has
 * @memberOf MapCache
 * @param {string} key The key of the entry to check.
 * @returns {boolean} Returns `true` if an entry for `key` exists, else `false`.
 */
function mapCacheHas(key) {
  return getMapData(this, key).has(key);
}

/**
 * Sets the map `key` to `value`.
 *
 * @private
 * @name set
 * @memberOf MapCache
 * @param {string} key The key of the value to set.
 * @param {*} value The value to set.
 * @returns {Object} Returns the map cache instance.
 */
function mapCacheSet(key, value) {
  getMapData(this, key).set(key, value);
  return this;
}

// Add methods to `MapCache`.
MapCache.prototype.clear = mapCacheClear;
MapCache.prototype['delete'] = mapCacheDelete;
MapCache.prototype.get = mapCacheGet;
MapCache.prototype.has = mapCacheHas;
MapCache.prototype.set = mapCacheSet;

/**
 * Gets the index at which the `key` is found in `array` of key-value pairs.
 *
 * @private
 * @param {Array} array The array to inspect.
 * @param {*} key The key to search for.
 * @returns {number} Returns the index of the matched value, else `-1`.
 */
function assocIndexOf(array, key) {
  var length = array.length;
  while (length--) {
    if (eq(array[length][0], key)) {
      return length;
    }
  }
  return -1;
}

/**
 * The base implementation of `_.get` without support for default values.
 *
 * @private
 * @param {Object} object The object to query.
 * @param {Array|string} path The path of the property to get.
 * @returns {*} Returns the resolved value.
 */
function baseGet(object, path) {
  path = isKey(path, object) ? [path] : castPath(path);

  var index = 0,
      length = path.length;

  while (object != null && index < length) {
    object = object[toKey(path[index++])];
  }
  return (index && index == length) ? object : undefined;
}

/**
 * The base implementation of `_.isNative` without bad shim checks.
 *
 * @private
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is a native function,
 *  else `false`.
 */
function baseIsNative(value) {
  if (!isObject(value) || isMasked(value)) {
    return false;
  }
  var pattern = (isFunction(value) || isHostObject(value)) ? reIsNative : reIsHostCtor;
  return pattern.test(toSource(value));
}

/**
 * The base implementation of `_.toString` which doesn't convert nullish
 * values to empty strings.
 *
 * @private
 * @param {*} value The value to process.
 * @returns {string} Returns the string.
 */
function baseToString(value) {
  // Exit early for strings to avoid a performance hit in some environments.
  if (typeof value == 'string') {
    return value;
  }
  if (isSymbol(value)) {
    return symbolToString ? symbolToString.call(value) : '';
  }
  var result = (value + '');
  return (result == '0' && (1 / value) == -INFINITY) ? '-0' : result;
}

/**
 * Casts `value` to a path array if it's not one.
 *
 * @private
 * @param {*} value The value to inspect.
 * @returns {Array} Returns the cast property path array.
 */
function castPath(value) {
  return isArray(value) ? value : stringToPath(value);
}

/**
 * Gets the data for `map`.
 *
 * @private
 * @param {Object} map The map to query.
 * @param {string} key The reference key.
 * @returns {*} Returns the map data.
 */
function getMapData(map, key) {
  var data = map.__data__;
  return isKeyable(key)
    ? data[typeof key == 'string' ? 'string' : 'hash']
    : data.map;
}

/**
 * Gets the native function at `key` of `object`.
 *
 * @private
 * @param {Object} object The object to query.
 * @param {string} key The key of the method to get.
 * @returns {*} Returns the function if it's native, else `undefined`.
 */
function getNative(object, key) {
  var value = getValue(object, key);
  return baseIsNative(value) ? value : undefined;
}

/**
 * Checks if `value` is a property name and not a property path.
 *
 * @private
 * @param {*} value The value to check.
 * @param {Object} [object] The object to query keys on.
 * @returns {boolean} Returns `true` if `value` is a property name, else `false`.
 */
function isKey(value, object) {
  if (isArray(value)) {
    return false;
  }
  var type = typeof value;
  if (type == 'number' || type == 'symbol' || type == 'boolean' ||
      value == null || isSymbol(value)) {
    return true;
  }
  return reIsPlainProp.test(value) || !reIsDeepProp.test(value) ||
    (object != null && value in Object(object));
}

/**
 * Checks if `value` is suitable for use as unique object key.
 *
 * @private
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is suitable, else `false`.
 */
function isKeyable(value) {
  var type = typeof value;
  return (type == 'string' || type == 'number' || type == 'symbol' || type == 'boolean')
    ? (value !== '__proto__')
    : (value === null);
}

/**
 * Checks if `func` has its source masked.
 *
 * @private
 * @param {Function} func The function to check.
 * @returns {boolean} Returns `true` if `func` is masked, else `false`.
 */
function isMasked(func) {
  return !!maskSrcKey && (maskSrcKey in func);
}

/**
 * Converts `string` to a property path array.
 *
 * @private
 * @param {string} string The string to convert.
 * @returns {Array} Returns the property path array.
 */
var stringToPath = memoize(function(string) {
  string = toString(string);

  var result = [];
  if (reLeadingDot.test(string)) {
    result.push('');
  }
  string.replace(rePropName, function(match, number, quote, string) {
    result.push(quote ? string.replace(reEscapeChar, '$1') : (number || match));
  });
  return result;
});

/**
 * Converts `value` to a string key if it's not a string or symbol.
 *
 * @private
 * @param {*} value The value to inspect.
 * @returns {string|symbol} Returns the key.
 */
function toKey(value) {
  if (typeof value == 'string' || isSymbol(value)) {
    return value;
  }
  var result = (value + '');
  return (result == '0' && (1 / value) == -INFINITY) ? '-0' : result;
}

/**
 * Converts `func` to its source code.
 *
 * @private
 * @param {Function} func The function to process.
 * @returns {string} Returns the source code.
 */
function toSource(func) {
  if (func != null) {
    try {
      return funcToString.call(func);
    } catch (e) {}
    try {
      return (func + '');
    } catch (e) {}
  }
  return '';
}

/**
 * Creates a function that memoizes the result of `func`. If `resolver` is
 * provided, it determines the cache key for storing the result based on the
 * arguments provided to the memoized function. By default, the first argument
 * provided to the memoized function is used as the map cache key. The `func`
 * is invoked with the `this` binding of the memoized function.
 *
 * **Note:** The cache is exposed as the `cache` property on the memoized
 * function. Its creation may be customized by replacing the `_.memoize.Cache`
 * constructor with one whose instances implement the
 * [`Map`](http://ecma-international.org/ecma-262/7.0/#sec-properties-of-the-map-prototype-object)
 * method interface of `delete`, `get`, `has`, and `set`.
 *
 * @static
 * @memberOf _
 * @since 0.1.0
 * @category Function
 * @param {Function} func The function to have its output memoized.
 * @param {Function} [resolver] The function to resolve the cache key.
 * @returns {Function} Returns the new memoized function.
 * @example
 *
 * var object = { 'a': 1, 'b': 2 };
 * var other = { 'c': 3, 'd': 4 };
 *
 * var values = _.memoize(_.values);
 * values(object);
 * // => [1, 2]
 *
 * values(other);
 * // => [3, 4]
 *
 * object.a = 2;
 * values(object);
 * // => [1, 2]
 *
 * // Modify the result cache.
 * values.cache.set(object, ['a', 'b']);
 * values(object);
 * // => ['a', 'b']
 *
 * // Replace `_.memoize.Cache`.
 * _.memoize.Cache = WeakMap;
 */
function memoize(func, resolver) {
  if (typeof func != 'function' || (resolver && typeof resolver != 'function')) {
    throw new TypeError(FUNC_ERROR_TEXT);
  }
  var memoized = function() {
    var args = arguments,
        key = resolver ? resolver.apply(this, args) : args[0],
        cache = memoized.cache;

    if (cache.has(key)) {
      return cache.get(key);
    }
    var result = func.apply(this, args);
    memoized.cache = cache.set(key, result);
    return result;
  };
  memoized.cache = new (memoize.Cache || MapCache);
  return memoized;
}

// Assign cache to `_.memoize`.
memoize.Cache = MapCache;

/**
 * Performs a
 * [`SameValueZero`](http://ecma-international.org/ecma-262/7.0/#sec-samevaluezero)
 * comparison between two values to determine if they are equivalent.
 *
 * @static
 * @memberOf _
 * @since 4.0.0
 * @category Lang
 * @param {*} value The value to compare.
 * @param {*} other The other value to compare.
 * @returns {boolean} Returns `true` if the values are equivalent, else `false`.
 * @example
 *
 * var object = { 'a': 1 };
 * var other = { 'a': 1 };
 *
 * _.eq(object, object);
 * // => true
 *
 * _.eq(object, other);
 * // => false
 *
 * _.eq('a', 'a');
 * // => true
 *
 * _.eq('a', Object('a'));
 * // => false
 *
 * _.eq(NaN, NaN);
 * // => true
 */
function eq(value, other) {
  return value === other || (value !== value && other !== other);
}

/**
 * Checks if `value` is classified as an `Array` object.
 *
 * @static
 * @memberOf _
 * @since 0.1.0
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is an array, else `false`.
 * @example
 *
 * _.isArray([1, 2, 3]);
 * // => true
 *
 * _.isArray(document.body.children);
 * // => false
 *
 * _.isArray('abc');
 * // => false
 *
 * _.isArray(_.noop);
 * // => false
 */
var isArray = Array.isArray;

/**
 * Checks if `value` is classified as a `Function` object.
 *
 * @static
 * @memberOf _
 * @since 0.1.0
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is a function, else `false`.
 * @example
 *
 * _.isFunction(_);
 * // => true
 *
 * _.isFunction(/abc/);
 * // => false
 */
function isFunction(value) {
  // The use of `Object#toString` avoids issues with the `typeof` operator
  // in Safari 8-9 which returns 'object' for typed array and other constructors.
  var tag = isObject(value) ? objectToString.call(value) : '';
  return tag == funcTag || tag == genTag;
}

/**
 * Checks if `value` is the
 * [language type](http://www.ecma-international.org/ecma-262/7.0/#sec-ecmascript-language-types)
 * of `Object`. (e.g. arrays, functions, objects, regexes, `new Number(0)`, and `new String('')`)
 *
 * @static
 * @memberOf _
 * @since 0.1.0
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is an object, else `false`.
 * @example
 *
 * _.isObject({});
 * // => true
 *
 * _.isObject([1, 2, 3]);
 * // => true
 *
 * _.isObject(_.noop);
 * // => true
 *
 * _.isObject(null);
 * // => false
 */
function isObject(value) {
  var type = typeof value;
  return !!value && (type == 'object' || type == 'function');
}

/**
 * Checks if `value` is object-like. A value is object-like if it's not `null`
 * and has a `typeof` result of "object".
 *
 * @static
 * @memberOf _
 * @since 4.0.0
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is object-like, else `false`.
 * @example
 *
 * _.isObjectLike({});
 * // => true
 *
 * _.isObjectLike([1, 2, 3]);
 * // => true
 *
 * _.isObjectLike(_.noop);
 * // => false
 *
 * _.isObjectLike(null);
 * // => false
 */
function isObjectLike(value) {
  return !!value && typeof value == 'object';
}

/**
 * Checks if `value` is classified as a `Symbol` primitive or object.
 *
 * @static
 * @memberOf _
 * @since 4.0.0
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is a symbol, else `false`.
 * @example
 *
 * _.isSymbol(Symbol.iterator);
 * // => true
 *
 * _.isSymbol('abc');
 * // => false
 */
function isSymbol(value) {
  return typeof value == 'symbol' ||
    (isObjectLike(value) && objectToString.call(value) == symbolTag);
}

/**
 * Converts `value` to a string. An empty string is returned for `null`
 * and `undefined` values. The sign of `-0` is preserved.
 *
 * @static
 * @memberOf _
 * @since 4.0.0
 * @category Lang
 * @param {*} value The value to process.
 * @returns {string} Returns the string.
 * @example
 *
 * _.toString(null);
 * // => ''
 *
 * _.toString(-0);
 * // => '-0'
 *
 * _.toString([1, 2, 3]);
 * // => '1,2,3'
 */
function toString(value) {
  return value == null ? '' : baseToString(value);
}

/**
 * Gets the value at `path` of `object`. If the resolved value is
 * `undefined`, the `defaultValue` is returned in its place.
 *
 * @static
 * @memberOf _
 * @since 3.7.0
 * @category Object
 * @param {Object} object The object to query.
 * @param {Array|string} path The path of the property to get.
 * @param {*} [defaultValue] The value returned for `undefined` resolved values.
 * @returns {*} Returns the resolved value.
 * @example
 *
 * var object = { 'a': [{ 'b': { 'c': 3 } }] };
 *
 * _.get(object, 'a[0].b.c');
 * // => 3
 *
 * _.get(object, ['a', '0', 'b', 'c']);
 * // => 3
 *
 * _.get(object, 'a.b.c', 'default');
 * // => 'default'
 */
function get(object, path, defaultValue) {
  var result = object == null ? undefined : baseGet(object, path);
  return result === undefined ? defaultValue : result;
}

module.exports = get;

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],29:[function(require,module,exports){
(function (global){
/**
 * lodash (Custom Build) <https://lodash.com/>
 * Build: `lodash modularize exports="npm" -o ./`
 * Copyright jQuery Foundation and other contributors <https://jquery.org/>
 * Released under MIT license <https://lodash.com/license>
 * Based on Underscore.js 1.8.3 <http://underscorejs.org/LICENSE>
 * Copyright Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 */

/** Used as the `TypeError` message for "Functions" methods. */
var FUNC_ERROR_TEXT = 'Expected a function';

/** Used as references for various `Number` constants. */
var NAN = 0 / 0;

/** `Object#toString` result references. */
var symbolTag = '[object Symbol]';

/** Used to match leading and trailing whitespace. */
var reTrim = /^\s+|\s+$/g;

/** Used to detect bad signed hexadecimal string values. */
var reIsBadHex = /^[-+]0x[0-9a-f]+$/i;

/** Used to detect binary string values. */
var reIsBinary = /^0b[01]+$/i;

/** Used to detect octal string values. */
var reIsOctal = /^0o[0-7]+$/i;

/** Built-in method references without a dependency on `root`. */
var freeParseInt = parseInt;

/** Detect free variable `global` from Node.js. */
var freeGlobal = typeof global == 'object' && global && global.Object === Object && global;

/** Detect free variable `self`. */
var freeSelf = typeof self == 'object' && self && self.Object === Object && self;

/** Used as a reference to the global object. */
var root = freeGlobal || freeSelf || Function('return this')();

/** Used for built-in method references. */
var objectProto = Object.prototype;

/**
 * Used to resolve the
 * [`toStringTag`](http://ecma-international.org/ecma-262/7.0/#sec-object.prototype.tostring)
 * of values.
 */
var objectToString = objectProto.toString;

/* Built-in method references for those with the same name as other `lodash` methods. */
var nativeMax = Math.max,
    nativeMin = Math.min;

/**
 * Gets the timestamp of the number of milliseconds that have elapsed since
 * the Unix epoch (1 January 1970 00:00:00 UTC).
 *
 * @static
 * @memberOf _
 * @since 2.4.0
 * @category Date
 * @returns {number} Returns the timestamp.
 * @example
 *
 * _.defer(function(stamp) {
 *   console.log(_.now() - stamp);
 * }, _.now());
 * // => Logs the number of milliseconds it took for the deferred invocation.
 */
var now = function() {
  return root.Date.now();
};

/**
 * Creates a debounced function that delays invoking `func` until after `wait`
 * milliseconds have elapsed since the last time the debounced function was
 * invoked. The debounced function comes with a `cancel` method to cancel
 * delayed `func` invocations and a `flush` method to immediately invoke them.
 * Provide `options` to indicate whether `func` should be invoked on the
 * leading and/or trailing edge of the `wait` timeout. The `func` is invoked
 * with the last arguments provided to the debounced function. Subsequent
 * calls to the debounced function return the result of the last `func`
 * invocation.
 *
 * **Note:** If `leading` and `trailing` options are `true`, `func` is
 * invoked on the trailing edge of the timeout only if the debounced function
 * is invoked more than once during the `wait` timeout.
 *
 * If `wait` is `0` and `leading` is `false`, `func` invocation is deferred
 * until to the next tick, similar to `setTimeout` with a timeout of `0`.
 *
 * See [David Corbacho's article](https://css-tricks.com/debouncing-throttling-explained-examples/)
 * for details over the differences between `_.debounce` and `_.throttle`.
 *
 * @static
 * @memberOf _
 * @since 0.1.0
 * @category Function
 * @param {Function} func The function to debounce.
 * @param {number} [wait=0] The number of milliseconds to delay.
 * @param {Object} [options={}] The options object.
 * @param {boolean} [options.leading=false]
 *  Specify invoking on the leading edge of the timeout.
 * @param {number} [options.maxWait]
 *  The maximum time `func` is allowed to be delayed before it's invoked.
 * @param {boolean} [options.trailing=true]
 *  Specify invoking on the trailing edge of the timeout.
 * @returns {Function} Returns the new debounced function.
 * @example
 *
 * // Avoid costly calculations while the window size is in flux.
 * jQuery(window).on('resize', _.debounce(calculateLayout, 150));
 *
 * // Invoke `sendMail` when clicked, debouncing subsequent calls.
 * jQuery(element).on('click', _.debounce(sendMail, 300, {
 *   'leading': true,
 *   'trailing': false
 * }));
 *
 * // Ensure `batchLog` is invoked once after 1 second of debounced calls.
 * var debounced = _.debounce(batchLog, 250, { 'maxWait': 1000 });
 * var source = new EventSource('/stream');
 * jQuery(source).on('message', debounced);
 *
 * // Cancel the trailing debounced invocation.
 * jQuery(window).on('popstate', debounced.cancel);
 */
function debounce(func, wait, options) {
  var lastArgs,
      lastThis,
      maxWait,
      result,
      timerId,
      lastCallTime,
      lastInvokeTime = 0,
      leading = false,
      maxing = false,
      trailing = true;

  if (typeof func != 'function') {
    throw new TypeError(FUNC_ERROR_TEXT);
  }
  wait = toNumber(wait) || 0;
  if (isObject(options)) {
    leading = !!options.leading;
    maxing = 'maxWait' in options;
    maxWait = maxing ? nativeMax(toNumber(options.maxWait) || 0, wait) : maxWait;
    trailing = 'trailing' in options ? !!options.trailing : trailing;
  }

  function invokeFunc(time) {
    var args = lastArgs,
        thisArg = lastThis;

    lastArgs = lastThis = undefined;
    lastInvokeTime = time;
    result = func.apply(thisArg, args);
    return result;
  }

  function leadingEdge(time) {
    // Reset any `maxWait` timer.
    lastInvokeTime = time;
    // Start the timer for the trailing edge.
    timerId = setTimeout(timerExpired, wait);
    // Invoke the leading edge.
    return leading ? invokeFunc(time) : result;
  }

  function remainingWait(time) {
    var timeSinceLastCall = time - lastCallTime,
        timeSinceLastInvoke = time - lastInvokeTime,
        result = wait - timeSinceLastCall;

    return maxing ? nativeMin(result, maxWait - timeSinceLastInvoke) : result;
  }

  function shouldInvoke(time) {
    var timeSinceLastCall = time - lastCallTime,
        timeSinceLastInvoke = time - lastInvokeTime;

    // Either this is the first call, activity has stopped and we're at the
    // trailing edge, the system time has gone backwards and we're treating
    // it as the trailing edge, or we've hit the `maxWait` limit.
    return (lastCallTime === undefined || (timeSinceLastCall >= wait) ||
      (timeSinceLastCall < 0) || (maxing && timeSinceLastInvoke >= maxWait));
  }

  function timerExpired() {
    var time = now();
    if (shouldInvoke(time)) {
      return trailingEdge(time);
    }
    // Restart the timer.
    timerId = setTimeout(timerExpired, remainingWait(time));
  }

  function trailingEdge(time) {
    timerId = undefined;

    // Only invoke if we have `lastArgs` which means `func` has been
    // debounced at least once.
    if (trailing && lastArgs) {
      return invokeFunc(time);
    }
    lastArgs = lastThis = undefined;
    return result;
  }

  function cancel() {
    if (timerId !== undefined) {
      clearTimeout(timerId);
    }
    lastInvokeTime = 0;
    lastArgs = lastCallTime = lastThis = timerId = undefined;
  }

  function flush() {
    return timerId === undefined ? result : trailingEdge(now());
  }

  function debounced() {
    var time = now(),
        isInvoking = shouldInvoke(time);

    lastArgs = arguments;
    lastThis = this;
    lastCallTime = time;

    if (isInvoking) {
      if (timerId === undefined) {
        return leadingEdge(lastCallTime);
      }
      if (maxing) {
        // Handle invocations in a tight loop.
        timerId = setTimeout(timerExpired, wait);
        return invokeFunc(lastCallTime);
      }
    }
    if (timerId === undefined) {
      timerId = setTimeout(timerExpired, wait);
    }
    return result;
  }
  debounced.cancel = cancel;
  debounced.flush = flush;
  return debounced;
}

/**
 * Creates a throttled function that only invokes `func` at most once per
 * every `wait` milliseconds. The throttled function comes with a `cancel`
 * method to cancel delayed `func` invocations and a `flush` method to
 * immediately invoke them. Provide `options` to indicate whether `func`
 * should be invoked on the leading and/or trailing edge of the `wait`
 * timeout. The `func` is invoked with the last arguments provided to the
 * throttled function. Subsequent calls to the throttled function return the
 * result of the last `func` invocation.
 *
 * **Note:** If `leading` and `trailing` options are `true`, `func` is
 * invoked on the trailing edge of the timeout only if the throttled function
 * is invoked more than once during the `wait` timeout.
 *
 * If `wait` is `0` and `leading` is `false`, `func` invocation is deferred
 * until to the next tick, similar to `setTimeout` with a timeout of `0`.
 *
 * See [David Corbacho's article](https://css-tricks.com/debouncing-throttling-explained-examples/)
 * for details over the differences between `_.throttle` and `_.debounce`.
 *
 * @static
 * @memberOf _
 * @since 0.1.0
 * @category Function
 * @param {Function} func The function to throttle.
 * @param {number} [wait=0] The number of milliseconds to throttle invocations to.
 * @param {Object} [options={}] The options object.
 * @param {boolean} [options.leading=true]
 *  Specify invoking on the leading edge of the timeout.
 * @param {boolean} [options.trailing=true]
 *  Specify invoking on the trailing edge of the timeout.
 * @returns {Function} Returns the new throttled function.
 * @example
 *
 * // Avoid excessively updating the position while scrolling.
 * jQuery(window).on('scroll', _.throttle(updatePosition, 100));
 *
 * // Invoke `renewToken` when the click event is fired, but not more than once every 5 minutes.
 * var throttled = _.throttle(renewToken, 300000, { 'trailing': false });
 * jQuery(element).on('click', throttled);
 *
 * // Cancel the trailing throttled invocation.
 * jQuery(window).on('popstate', throttled.cancel);
 */
function throttle(func, wait, options) {
  var leading = true,
      trailing = true;

  if (typeof func != 'function') {
    throw new TypeError(FUNC_ERROR_TEXT);
  }
  if (isObject(options)) {
    leading = 'leading' in options ? !!options.leading : leading;
    trailing = 'trailing' in options ? !!options.trailing : trailing;
  }
  return debounce(func, wait, {
    'leading': leading,
    'maxWait': wait,
    'trailing': trailing
  });
}

/**
 * Checks if `value` is the
 * [language type](http://www.ecma-international.org/ecma-262/7.0/#sec-ecmascript-language-types)
 * of `Object`. (e.g. arrays, functions, objects, regexes, `new Number(0)`, and `new String('')`)
 *
 * @static
 * @memberOf _
 * @since 0.1.0
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is an object, else `false`.
 * @example
 *
 * _.isObject({});
 * // => true
 *
 * _.isObject([1, 2, 3]);
 * // => true
 *
 * _.isObject(_.noop);
 * // => true
 *
 * _.isObject(null);
 * // => false
 */
function isObject(value) {
  var type = typeof value;
  return !!value && (type == 'object' || type == 'function');
}

/**
 * Checks if `value` is object-like. A value is object-like if it's not `null`
 * and has a `typeof` result of "object".
 *
 * @static
 * @memberOf _
 * @since 4.0.0
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is object-like, else `false`.
 * @example
 *
 * _.isObjectLike({});
 * // => true
 *
 * _.isObjectLike([1, 2, 3]);
 * // => true
 *
 * _.isObjectLike(_.noop);
 * // => false
 *
 * _.isObjectLike(null);
 * // => false
 */
function isObjectLike(value) {
  return !!value && typeof value == 'object';
}

/**
 * Checks if `value` is classified as a `Symbol` primitive or object.
 *
 * @static
 * @memberOf _
 * @since 4.0.0
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is a symbol, else `false`.
 * @example
 *
 * _.isSymbol(Symbol.iterator);
 * // => true
 *
 * _.isSymbol('abc');
 * // => false
 */
function isSymbol(value) {
  return typeof value == 'symbol' ||
    (isObjectLike(value) && objectToString.call(value) == symbolTag);
}

/**
 * Converts `value` to a number.
 *
 * @static
 * @memberOf _
 * @since 4.0.0
 * @category Lang
 * @param {*} value The value to process.
 * @returns {number} Returns the number.
 * @example
 *
 * _.toNumber(3.2);
 * // => 3.2
 *
 * _.toNumber(Number.MIN_VALUE);
 * // => 5e-324
 *
 * _.toNumber(Infinity);
 * // => Infinity
 *
 * _.toNumber('3.2');
 * // => 3.2
 */
function toNumber(value) {
  if (typeof value == 'number') {
    return value;
  }
  if (isSymbol(value)) {
    return NAN;
  }
  if (isObject(value)) {
    var other = typeof value.valueOf == 'function' ? value.valueOf() : value;
    value = isObject(other) ? (other + '') : other;
  }
  if (typeof value != 'string') {
    return value === 0 ? value : +value;
  }
  value = value.replace(reTrim, '');
  var isBinary = reIsBinary.test(value);
  return (isBinary || reIsOctal.test(value))
    ? freeParseInt(value.slice(2), isBinary ? 2 : 8)
    : (reIsBadHex.test(value) ? NAN : +value);
}

module.exports = throttle;

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],30:[function(require,module,exports){
//! moment.js

;(function (global, factory) {
    typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory() :
    typeof define === 'function' && define.amd ? define(factory) :
    global.moment = factory()
}(this, (function () { 'use strict';

    var hookCallback;

    function hooks () {
        return hookCallback.apply(null, arguments);
    }

    // This is done to register the method called with moment()
    // without creating circular dependencies.
    function setHookCallback (callback) {
        hookCallback = callback;
    }

    function isArray(input) {
        return input instanceof Array || Object.prototype.toString.call(input) === '[object Array]';
    }

    function isObject(input) {
        // IE8 will treat undefined and null as object if it wasn't for
        // input != null
        return input != null && Object.prototype.toString.call(input) === '[object Object]';
    }

    function isObjectEmpty(obj) {
        if (Object.getOwnPropertyNames) {
            return (Object.getOwnPropertyNames(obj).length === 0);
        } else {
            var k;
            for (k in obj) {
                if (obj.hasOwnProperty(k)) {
                    return false;
                }
            }
            return true;
        }
    }

    function isUndefined(input) {
        return input === void 0;
    }

    function isNumber(input) {
        return typeof input === 'number' || Object.prototype.toString.call(input) === '[object Number]';
    }

    function isDate(input) {
        return input instanceof Date || Object.prototype.toString.call(input) === '[object Date]';
    }

    function map(arr, fn) {
        var res = [], i;
        for (i = 0; i < arr.length; ++i) {
            res.push(fn(arr[i], i));
        }
        return res;
    }

    function hasOwnProp(a, b) {
        return Object.prototype.hasOwnProperty.call(a, b);
    }

    function extend(a, b) {
        for (var i in b) {
            if (hasOwnProp(b, i)) {
                a[i] = b[i];
            }
        }

        if (hasOwnProp(b, 'toString')) {
            a.toString = b.toString;
        }

        if (hasOwnProp(b, 'valueOf')) {
            a.valueOf = b.valueOf;
        }

        return a;
    }

    function createUTC (input, format, locale, strict) {
        return createLocalOrUTC(input, format, locale, strict, true).utc();
    }

    function defaultParsingFlags() {
        // We need to deep clone this object.
        return {
            empty           : false,
            unusedTokens    : [],
            unusedInput     : [],
            overflow        : -2,
            charsLeftOver   : 0,
            nullInput       : false,
            invalidMonth    : null,
            invalidFormat   : false,
            userInvalidated : false,
            iso             : false,
            parsedDateParts : [],
            meridiem        : null,
            rfc2822         : false,
            weekdayMismatch : false
        };
    }

    function getParsingFlags(m) {
        if (m._pf == null) {
            m._pf = defaultParsingFlags();
        }
        return m._pf;
    }

    var some;
    if (Array.prototype.some) {
        some = Array.prototype.some;
    } else {
        some = function (fun) {
            var t = Object(this);
            var len = t.length >>> 0;

            for (var i = 0; i < len; i++) {
                if (i in t && fun.call(this, t[i], i, t)) {
                    return true;
                }
            }

            return false;
        };
    }

    function isValid(m) {
        if (m._isValid == null) {
            var flags = getParsingFlags(m);
            var parsedParts = some.call(flags.parsedDateParts, function (i) {
                return i != null;
            });
            var isNowValid = !isNaN(m._d.getTime()) &&
                flags.overflow < 0 &&
                !flags.empty &&
                !flags.invalidMonth &&
                !flags.invalidWeekday &&
                !flags.weekdayMismatch &&
                !flags.nullInput &&
                !flags.invalidFormat &&
                !flags.userInvalidated &&
                (!flags.meridiem || (flags.meridiem && parsedParts));

            if (m._strict) {
                isNowValid = isNowValid &&
                    flags.charsLeftOver === 0 &&
                    flags.unusedTokens.length === 0 &&
                    flags.bigHour === undefined;
            }

            if (Object.isFrozen == null || !Object.isFrozen(m)) {
                m._isValid = isNowValid;
            }
            else {
                return isNowValid;
            }
        }
        return m._isValid;
    }

    function createInvalid (flags) {
        var m = createUTC(NaN);
        if (flags != null) {
            extend(getParsingFlags(m), flags);
        }
        else {
            getParsingFlags(m).userInvalidated = true;
        }

        return m;
    }

    // Plugins that add properties should also add the key here (null value),
    // so we can properly clone ourselves.
    var momentProperties = hooks.momentProperties = [];

    function copyConfig(to, from) {
        var i, prop, val;

        if (!isUndefined(from._isAMomentObject)) {
            to._isAMomentObject = from._isAMomentObject;
        }
        if (!isUndefined(from._i)) {
            to._i = from._i;
        }
        if (!isUndefined(from._f)) {
            to._f = from._f;
        }
        if (!isUndefined(from._l)) {
            to._l = from._l;
        }
        if (!isUndefined(from._strict)) {
            to._strict = from._strict;
        }
        if (!isUndefined(from._tzm)) {
            to._tzm = from._tzm;
        }
        if (!isUndefined(from._isUTC)) {
            to._isUTC = from._isUTC;
        }
        if (!isUndefined(from._offset)) {
            to._offset = from._offset;
        }
        if (!isUndefined(from._pf)) {
            to._pf = getParsingFlags(from);
        }
        if (!isUndefined(from._locale)) {
            to._locale = from._locale;
        }

        if (momentProperties.length > 0) {
            for (i = 0; i < momentProperties.length; i++) {
                prop = momentProperties[i];
                val = from[prop];
                if (!isUndefined(val)) {
                    to[prop] = val;
                }
            }
        }

        return to;
    }

    var updateInProgress = false;

    // Moment prototype object
    function Moment(config) {
        copyConfig(this, config);
        this._d = new Date(config._d != null ? config._d.getTime() : NaN);
        if (!this.isValid()) {
            this._d = new Date(NaN);
        }
        // Prevent infinite loop in case updateOffset creates new moment
        // objects.
        if (updateInProgress === false) {
            updateInProgress = true;
            hooks.updateOffset(this);
            updateInProgress = false;
        }
    }

    function isMoment (obj) {
        return obj instanceof Moment || (obj != null && obj._isAMomentObject != null);
    }

    function absFloor (number) {
        if (number < 0) {
            // -0 -> 0
            return Math.ceil(number) || 0;
        } else {
            return Math.floor(number);
        }
    }

    function toInt(argumentForCoercion) {
        var coercedNumber = +argumentForCoercion,
            value = 0;

        if (coercedNumber !== 0 && isFinite(coercedNumber)) {
            value = absFloor(coercedNumber);
        }

        return value;
    }

    // compare two arrays, return the number of differences
    function compareArrays(array1, array2, dontConvert) {
        var len = Math.min(array1.length, array2.length),
            lengthDiff = Math.abs(array1.length - array2.length),
            diffs = 0,
            i;
        for (i = 0; i < len; i++) {
            if ((dontConvert && array1[i] !== array2[i]) ||
                (!dontConvert && toInt(array1[i]) !== toInt(array2[i]))) {
                diffs++;
            }
        }
        return diffs + lengthDiff;
    }

    function warn(msg) {
        if (hooks.suppressDeprecationWarnings === false &&
                (typeof console !==  'undefined') && console.warn) {
            console.warn('Deprecation warning: ' + msg);
        }
    }

    function deprecate(msg, fn) {
        var firstTime = true;

        return extend(function () {
            if (hooks.deprecationHandler != null) {
                hooks.deprecationHandler(null, msg);
            }
            if (firstTime) {
                var args = [];
                var arg;
                for (var i = 0; i < arguments.length; i++) {
                    arg = '';
                    if (typeof arguments[i] === 'object') {
                        arg += '\n[' + i + '] ';
                        for (var key in arguments[0]) {
                            arg += key + ': ' + arguments[0][key] + ', ';
                        }
                        arg = arg.slice(0, -2); // Remove trailing comma and space
                    } else {
                        arg = arguments[i];
                    }
                    args.push(arg);
                }
                warn(msg + '\nArguments: ' + Array.prototype.slice.call(args).join('') + '\n' + (new Error()).stack);
                firstTime = false;
            }
            return fn.apply(this, arguments);
        }, fn);
    }

    var deprecations = {};

    function deprecateSimple(name, msg) {
        if (hooks.deprecationHandler != null) {
            hooks.deprecationHandler(name, msg);
        }
        if (!deprecations[name]) {
            warn(msg);
            deprecations[name] = true;
        }
    }

    hooks.suppressDeprecationWarnings = false;
    hooks.deprecationHandler = null;

    function isFunction(input) {
        return input instanceof Function || Object.prototype.toString.call(input) === '[object Function]';
    }

    function set (config) {
        var prop, i;
        for (i in config) {
            prop = config[i];
            if (isFunction(prop)) {
                this[i] = prop;
            } else {
                this['_' + i] = prop;
            }
        }
        this._config = config;
        // Lenient ordinal parsing accepts just a number in addition to
        // number + (possibly) stuff coming from _dayOfMonthOrdinalParse.
        // TODO: Remove "ordinalParse" fallback in next major release.
        this._dayOfMonthOrdinalParseLenient = new RegExp(
            (this._dayOfMonthOrdinalParse.source || this._ordinalParse.source) +
                '|' + (/\d{1,2}/).source);
    }

    function mergeConfigs(parentConfig, childConfig) {
        var res = extend({}, parentConfig), prop;
        for (prop in childConfig) {
            if (hasOwnProp(childConfig, prop)) {
                if (isObject(parentConfig[prop]) && isObject(childConfig[prop])) {
                    res[prop] = {};
                    extend(res[prop], parentConfig[prop]);
                    extend(res[prop], childConfig[prop]);
                } else if (childConfig[prop] != null) {
                    res[prop] = childConfig[prop];
                } else {
                    delete res[prop];
                }
            }
        }
        for (prop in parentConfig) {
            if (hasOwnProp(parentConfig, prop) &&
                    !hasOwnProp(childConfig, prop) &&
                    isObject(parentConfig[prop])) {
                // make sure changes to properties don't modify parent config
                res[prop] = extend({}, res[prop]);
            }
        }
        return res;
    }

    function Locale(config) {
        if (config != null) {
            this.set(config);
        }
    }

    var keys;

    if (Object.keys) {
        keys = Object.keys;
    } else {
        keys = function (obj) {
            var i, res = [];
            for (i in obj) {
                if (hasOwnProp(obj, i)) {
                    res.push(i);
                }
            }
            return res;
        };
    }

    var defaultCalendar = {
        sameDay : '[Today at] LT',
        nextDay : '[Tomorrow at] LT',
        nextWeek : 'dddd [at] LT',
        lastDay : '[Yesterday at] LT',
        lastWeek : '[Last] dddd [at] LT',
        sameElse : 'L'
    };

    function calendar (key, mom, now) {
        var output = this._calendar[key] || this._calendar['sameElse'];
        return isFunction(output) ? output.call(mom, now) : output;
    }

    var defaultLongDateFormat = {
        LTS  : 'h:mm:ss A',
        LT   : 'h:mm A',
        L    : 'MM/DD/YYYY',
        LL   : 'MMMM D, YYYY',
        LLL  : 'MMMM D, YYYY h:mm A',
        LLLL : 'dddd, MMMM D, YYYY h:mm A'
    };

    function longDateFormat (key) {
        var format = this._longDateFormat[key],
            formatUpper = this._longDateFormat[key.toUpperCase()];

        if (format || !formatUpper) {
            return format;
        }

        this._longDateFormat[key] = formatUpper.replace(/MMMM|MM|DD|dddd/g, function (val) {
            return val.slice(1);
        });

        return this._longDateFormat[key];
    }

    var defaultInvalidDate = 'Invalid date';

    function invalidDate () {
        return this._invalidDate;
    }

    var defaultOrdinal = '%d';
    var defaultDayOfMonthOrdinalParse = /\d{1,2}/;

    function ordinal (number) {
        return this._ordinal.replace('%d', number);
    }

    var defaultRelativeTime = {
        future : 'in %s',
        past   : '%s ago',
        s  : 'a few seconds',
        ss : '%d seconds',
        m  : 'a minute',
        mm : '%d minutes',
        h  : 'an hour',
        hh : '%d hours',
        d  : 'a day',
        dd : '%d days',
        M  : 'a month',
        MM : '%d months',
        y  : 'a year',
        yy : '%d years'
    };

    function relativeTime (number, withoutSuffix, string, isFuture) {
        var output = this._relativeTime[string];
        return (isFunction(output)) ?
            output(number, withoutSuffix, string, isFuture) :
            output.replace(/%d/i, number);
    }

    function pastFuture (diff, output) {
        var format = this._relativeTime[diff > 0 ? 'future' : 'past'];
        return isFunction(format) ? format(output) : format.replace(/%s/i, output);
    }

    var aliases = {};

    function addUnitAlias (unit, shorthand) {
        var lowerCase = unit.toLowerCase();
        aliases[lowerCase] = aliases[lowerCase + 's'] = aliases[shorthand] = unit;
    }

    function normalizeUnits(units) {
        return typeof units === 'string' ? aliases[units] || aliases[units.toLowerCase()] : undefined;
    }

    function normalizeObjectUnits(inputObject) {
        var normalizedInput = {},
            normalizedProp,
            prop;

        for (prop in inputObject) {
            if (hasOwnProp(inputObject, prop)) {
                normalizedProp = normalizeUnits(prop);
                if (normalizedProp) {
                    normalizedInput[normalizedProp] = inputObject[prop];
                }
            }
        }

        return normalizedInput;
    }

    var priorities = {};

    function addUnitPriority(unit, priority) {
        priorities[unit] = priority;
    }

    function getPrioritizedUnits(unitsObj) {
        var units = [];
        for (var u in unitsObj) {
            units.push({unit: u, priority: priorities[u]});
        }
        units.sort(function (a, b) {
            return a.priority - b.priority;
        });
        return units;
    }

    function zeroFill(number, targetLength, forceSign) {
        var absNumber = '' + Math.abs(number),
            zerosToFill = targetLength - absNumber.length,
            sign = number >= 0;
        return (sign ? (forceSign ? '+' : '') : '-') +
            Math.pow(10, Math.max(0, zerosToFill)).toString().substr(1) + absNumber;
    }

    var formattingTokens = /(\[[^\[]*\])|(\\)?([Hh]mm(ss)?|Mo|MM?M?M?|Do|DDDo|DD?D?D?|ddd?d?|do?|w[o|w]?|W[o|W]?|Qo?|YYYYYY|YYYYY|YYYY|YY|gg(ggg?)?|GG(GGG?)?|e|E|a|A|hh?|HH?|kk?|mm?|ss?|S{1,9}|x|X|zz?|ZZ?|.)/g;

    var localFormattingTokens = /(\[[^\[]*\])|(\\)?(LTS|LT|LL?L?L?|l{1,4})/g;

    var formatFunctions = {};

    var formatTokenFunctions = {};

    // token:    'M'
    // padded:   ['MM', 2]
    // ordinal:  'Mo'
    // callback: function () { this.month() + 1 }
    function addFormatToken (token, padded, ordinal, callback) {
        var func = callback;
        if (typeof callback === 'string') {
            func = function () {
                return this[callback]();
            };
        }
        if (token) {
            formatTokenFunctions[token] = func;
        }
        if (padded) {
            formatTokenFunctions[padded[0]] = function () {
                return zeroFill(func.apply(this, arguments), padded[1], padded[2]);
            };
        }
        if (ordinal) {
            formatTokenFunctions[ordinal] = function () {
                return this.localeData().ordinal(func.apply(this, arguments), token);
            };
        }
    }

    function removeFormattingTokens(input) {
        if (input.match(/\[[\s\S]/)) {
            return input.replace(/^\[|\]$/g, '');
        }
        return input.replace(/\\/g, '');
    }

    function makeFormatFunction(format) {
        var array = format.match(formattingTokens), i, length;

        for (i = 0, length = array.length; i < length; i++) {
            if (formatTokenFunctions[array[i]]) {
                array[i] = formatTokenFunctions[array[i]];
            } else {
                array[i] = removeFormattingTokens(array[i]);
            }
        }

        return function (mom) {
            var output = '', i;
            for (i = 0; i < length; i++) {
                output += isFunction(array[i]) ? array[i].call(mom, format) : array[i];
            }
            return output;
        };
    }

    // format date using native date object
    function formatMoment(m, format) {
        if (!m.isValid()) {
            return m.localeData().invalidDate();
        }

        format = expandFormat(format, m.localeData());
        formatFunctions[format] = formatFunctions[format] || makeFormatFunction(format);

        return formatFunctions[format](m);
    }

    function expandFormat(format, locale) {
        var i = 5;

        function replaceLongDateFormatTokens(input) {
            return locale.longDateFormat(input) || input;
        }

        localFormattingTokens.lastIndex = 0;
        while (i >= 0 && localFormattingTokens.test(format)) {
            format = format.replace(localFormattingTokens, replaceLongDateFormatTokens);
            localFormattingTokens.lastIndex = 0;
            i -= 1;
        }

        return format;
    }

    var match1         = /\d/;            //       0 - 9
    var match2         = /\d\d/;          //      00 - 99
    var match3         = /\d{3}/;         //     000 - 999
    var match4         = /\d{4}/;         //    0000 - 9999
    var match6         = /[+-]?\d{6}/;    // -999999 - 999999
    var match1to2      = /\d\d?/;         //       0 - 99
    var match3to4      = /\d\d\d\d?/;     //     999 - 9999
    var match5to6      = /\d\d\d\d\d\d?/; //   99999 - 999999
    var match1to3      = /\d{1,3}/;       //       0 - 999
    var match1to4      = /\d{1,4}/;       //       0 - 9999
    var match1to6      = /[+-]?\d{1,6}/;  // -999999 - 999999

    var matchUnsigned  = /\d+/;           //       0 - inf
    var matchSigned    = /[+-]?\d+/;      //    -inf - inf

    var matchOffset    = /Z|[+-]\d\d:?\d\d/gi; // +00:00 -00:00 +0000 -0000 or Z
    var matchShortOffset = /Z|[+-]\d\d(?::?\d\d)?/gi; // +00 -00 +00:00 -00:00 +0000 -0000 or Z

    var matchTimestamp = /[+-]?\d+(\.\d{1,3})?/; // 123456789 123456789.123

    // any word (or two) characters or numbers including two/three word month in arabic.
    // includes scottish gaelic two word and hyphenated months
    var matchWord = /[0-9]{0,256}['a-z\u00A0-\u05FF\u0700-\uD7FF\uF900-\uFDCF\uFDF0-\uFF07\uFF10-\uFFEF]{1,256}|[\u0600-\u06FF\/]{1,256}(\s*?[\u0600-\u06FF]{1,256}){1,2}/i;

    var regexes = {};

    function addRegexToken (token, regex, strictRegex) {
        regexes[token] = isFunction(regex) ? regex : function (isStrict, localeData) {
            return (isStrict && strictRegex) ? strictRegex : regex;
        };
    }

    function getParseRegexForToken (token, config) {
        if (!hasOwnProp(regexes, token)) {
            return new RegExp(unescapeFormat(token));
        }

        return regexes[token](config._strict, config._locale);
    }

    // Code from http://stackoverflow.com/questions/3561493/is-there-a-regexp-escape-function-in-javascript
    function unescapeFormat(s) {
        return regexEscape(s.replace('\\', '').replace(/\\(\[)|\\(\])|\[([^\]\[]*)\]|\\(.)/g, function (matched, p1, p2, p3, p4) {
            return p1 || p2 || p3 || p4;
        }));
    }

    function regexEscape(s) {
        return s.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    }

    var tokens = {};

    function addParseToken (token, callback) {
        var i, func = callback;
        if (typeof token === 'string') {
            token = [token];
        }
        if (isNumber(callback)) {
            func = function (input, array) {
                array[callback] = toInt(input);
            };
        }
        for (i = 0; i < token.length; i++) {
            tokens[token[i]] = func;
        }
    }

    function addWeekParseToken (token, callback) {
        addParseToken(token, function (input, array, config, token) {
            config._w = config._w || {};
            callback(input, config._w, config, token);
        });
    }

    function addTimeToArrayFromToken(token, input, config) {
        if (input != null && hasOwnProp(tokens, token)) {
            tokens[token](input, config._a, config, token);
        }
    }

    var YEAR = 0;
    var MONTH = 1;
    var DATE = 2;
    var HOUR = 3;
    var MINUTE = 4;
    var SECOND = 5;
    var MILLISECOND = 6;
    var WEEK = 7;
    var WEEKDAY = 8;

    // FORMATTING

    addFormatToken('Y', 0, 0, function () {
        var y = this.year();
        return y <= 9999 ? '' + y : '+' + y;
    });

    addFormatToken(0, ['YY', 2], 0, function () {
        return this.year() % 100;
    });

    addFormatToken(0, ['YYYY',   4],       0, 'year');
    addFormatToken(0, ['YYYYY',  5],       0, 'year');
    addFormatToken(0, ['YYYYYY', 6, true], 0, 'year');

    // ALIASES

    addUnitAlias('year', 'y');

    // PRIORITIES

    addUnitPriority('year', 1);

    // PARSING

    addRegexToken('Y',      matchSigned);
    addRegexToken('YY',     match1to2, match2);
    addRegexToken('YYYY',   match1to4, match4);
    addRegexToken('YYYYY',  match1to6, match6);
    addRegexToken('YYYYYY', match1to6, match6);

    addParseToken(['YYYYY', 'YYYYYY'], YEAR);
    addParseToken('YYYY', function (input, array) {
        array[YEAR] = input.length === 2 ? hooks.parseTwoDigitYear(input) : toInt(input);
    });
    addParseToken('YY', function (input, array) {
        array[YEAR] = hooks.parseTwoDigitYear(input);
    });
    addParseToken('Y', function (input, array) {
        array[YEAR] = parseInt(input, 10);
    });

    // HELPERS

    function daysInYear(year) {
        return isLeapYear(year) ? 366 : 365;
    }

    function isLeapYear(year) {
        return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    }

    // HOOKS

    hooks.parseTwoDigitYear = function (input) {
        return toInt(input) + (toInt(input) > 68 ? 1900 : 2000);
    };

    // MOMENTS

    var getSetYear = makeGetSet('FullYear', true);

    function getIsLeapYear () {
        return isLeapYear(this.year());
    }

    function makeGetSet (unit, keepTime) {
        return function (value) {
            if (value != null) {
                set$1(this, unit, value);
                hooks.updateOffset(this, keepTime);
                return this;
            } else {
                return get(this, unit);
            }
        };
    }

    function get (mom, unit) {
        return mom.isValid() ?
            mom._d['get' + (mom._isUTC ? 'UTC' : '') + unit]() : NaN;
    }

    function set$1 (mom, unit, value) {
        if (mom.isValid() && !isNaN(value)) {
            if (unit === 'FullYear' && isLeapYear(mom.year()) && mom.month() === 1 && mom.date() === 29) {
                mom._d['set' + (mom._isUTC ? 'UTC' : '') + unit](value, mom.month(), daysInMonth(value, mom.month()));
            }
            else {
                mom._d['set' + (mom._isUTC ? 'UTC' : '') + unit](value);
            }
        }
    }

    // MOMENTS

    function stringGet (units) {
        units = normalizeUnits(units);
        if (isFunction(this[units])) {
            return this[units]();
        }
        return this;
    }


    function stringSet (units, value) {
        if (typeof units === 'object') {
            units = normalizeObjectUnits(units);
            var prioritized = getPrioritizedUnits(units);
            for (var i = 0; i < prioritized.length; i++) {
                this[prioritized[i].unit](units[prioritized[i].unit]);
            }
        } else {
            units = normalizeUnits(units);
            if (isFunction(this[units])) {
                return this[units](value);
            }
        }
        return this;
    }

    function mod(n, x) {
        return ((n % x) + x) % x;
    }

    var indexOf;

    if (Array.prototype.indexOf) {
        indexOf = Array.prototype.indexOf;
    } else {
        indexOf = function (o) {
            // I know
            var i;
            for (i = 0; i < this.length; ++i) {
                if (this[i] === o) {
                    return i;
                }
            }
            return -1;
        };
    }

    function daysInMonth(year, month) {
        if (isNaN(year) || isNaN(month)) {
            return NaN;
        }
        var modMonth = mod(month, 12);
        year += (month - modMonth) / 12;
        return modMonth === 1 ? (isLeapYear(year) ? 29 : 28) : (31 - modMonth % 7 % 2);
    }

    // FORMATTING

    addFormatToken('M', ['MM', 2], 'Mo', function () {
        return this.month() + 1;
    });

    addFormatToken('MMM', 0, 0, function (format) {
        return this.localeData().monthsShort(this, format);
    });

    addFormatToken('MMMM', 0, 0, function (format) {
        return this.localeData().months(this, format);
    });

    // ALIASES

    addUnitAlias('month', 'M');

    // PRIORITY

    addUnitPriority('month', 8);

    // PARSING

    addRegexToken('M',    match1to2);
    addRegexToken('MM',   match1to2, match2);
    addRegexToken('MMM',  function (isStrict, locale) {
        return locale.monthsShortRegex(isStrict);
    });
    addRegexToken('MMMM', function (isStrict, locale) {
        return locale.monthsRegex(isStrict);
    });

    addParseToken(['M', 'MM'], function (input, array) {
        array[MONTH] = toInt(input) - 1;
    });

    addParseToken(['MMM', 'MMMM'], function (input, array, config, token) {
        var month = config._locale.monthsParse(input, token, config._strict);
        // if we didn't find a month name, mark the date as invalid.
        if (month != null) {
            array[MONTH] = month;
        } else {
            getParsingFlags(config).invalidMonth = input;
        }
    });

    // LOCALES

    var MONTHS_IN_FORMAT = /D[oD]?(\[[^\[\]]*\]|\s)+MMMM?/;
    var defaultLocaleMonths = 'January_February_March_April_May_June_July_August_September_October_November_December'.split('_');
    function localeMonths (m, format) {
        if (!m) {
            return isArray(this._months) ? this._months :
                this._months['standalone'];
        }
        return isArray(this._months) ? this._months[m.month()] :
            this._months[(this._months.isFormat || MONTHS_IN_FORMAT).test(format) ? 'format' : 'standalone'][m.month()];
    }

    var defaultLocaleMonthsShort = 'Jan_Feb_Mar_Apr_May_Jun_Jul_Aug_Sep_Oct_Nov_Dec'.split('_');
    function localeMonthsShort (m, format) {
        if (!m) {
            return isArray(this._monthsShort) ? this._monthsShort :
                this._monthsShort['standalone'];
        }
        return isArray(this._monthsShort) ? this._monthsShort[m.month()] :
            this._monthsShort[MONTHS_IN_FORMAT.test(format) ? 'format' : 'standalone'][m.month()];
    }

    function handleStrictParse(monthName, format, strict) {
        var i, ii, mom, llc = monthName.toLocaleLowerCase();
        if (!this._monthsParse) {
            // this is not used
            this._monthsParse = [];
            this._longMonthsParse = [];
            this._shortMonthsParse = [];
            for (i = 0; i < 12; ++i) {
                mom = createUTC([2000, i]);
                this._shortMonthsParse[i] = this.monthsShort(mom, '').toLocaleLowerCase();
                this._longMonthsParse[i] = this.months(mom, '').toLocaleLowerCase();
            }
        }

        if (strict) {
            if (format === 'MMM') {
                ii = indexOf.call(this._shortMonthsParse, llc);
                return ii !== -1 ? ii : null;
            } else {
                ii = indexOf.call(this._longMonthsParse, llc);
                return ii !== -1 ? ii : null;
            }
        } else {
            if (format === 'MMM') {
                ii = indexOf.call(this._shortMonthsParse, llc);
                if (ii !== -1) {
                    return ii;
                }
                ii = indexOf.call(this._longMonthsParse, llc);
                return ii !== -1 ? ii : null;
            } else {
                ii = indexOf.call(this._longMonthsParse, llc);
                if (ii !== -1) {
                    return ii;
                }
                ii = indexOf.call(this._shortMonthsParse, llc);
                return ii !== -1 ? ii : null;
            }
        }
    }

    function localeMonthsParse (monthName, format, strict) {
        var i, mom, regex;

        if (this._monthsParseExact) {
            return handleStrictParse.call(this, monthName, format, strict);
        }

        if (!this._monthsParse) {
            this._monthsParse = [];
            this._longMonthsParse = [];
            this._shortMonthsParse = [];
        }

        // TODO: add sorting
        // Sorting makes sure if one month (or abbr) is a prefix of another
        // see sorting in computeMonthsParse
        for (i = 0; i < 12; i++) {
            // make the regex if we don't have it already
            mom = createUTC([2000, i]);
            if (strict && !this._longMonthsParse[i]) {
                this._longMonthsParse[i] = new RegExp('^' + this.months(mom, '').replace('.', '') + '$', 'i');
                this._shortMonthsParse[i] = new RegExp('^' + this.monthsShort(mom, '').replace('.', '') + '$', 'i');
            }
            if (!strict && !this._monthsParse[i]) {
                regex = '^' + this.months(mom, '') + '|^' + this.monthsShort(mom, '');
                this._monthsParse[i] = new RegExp(regex.replace('.', ''), 'i');
            }
            // test the regex
            if (strict && format === 'MMMM' && this._longMonthsParse[i].test(monthName)) {
                return i;
            } else if (strict && format === 'MMM' && this._shortMonthsParse[i].test(monthName)) {
                return i;
            } else if (!strict && this._monthsParse[i].test(monthName)) {
                return i;
            }
        }
    }

    // MOMENTS

    function setMonth (mom, value) {
        var dayOfMonth;

        if (!mom.isValid()) {
            // No op
            return mom;
        }

        if (typeof value === 'string') {
            if (/^\d+$/.test(value)) {
                value = toInt(value);
            } else {
                value = mom.localeData().monthsParse(value);
                // TODO: Another silent failure?
                if (!isNumber(value)) {
                    return mom;
                }
            }
        }

        dayOfMonth = Math.min(mom.date(), daysInMonth(mom.year(), value));
        mom._d['set' + (mom._isUTC ? 'UTC' : '') + 'Month'](value, dayOfMonth);
        return mom;
    }

    function getSetMonth (value) {
        if (value != null) {
            setMonth(this, value);
            hooks.updateOffset(this, true);
            return this;
        } else {
            return get(this, 'Month');
        }
    }

    function getDaysInMonth () {
        return daysInMonth(this.year(), this.month());
    }

    var defaultMonthsShortRegex = matchWord;
    function monthsShortRegex (isStrict) {
        if (this._monthsParseExact) {
            if (!hasOwnProp(this, '_monthsRegex')) {
                computeMonthsParse.call(this);
            }
            if (isStrict) {
                return this._monthsShortStrictRegex;
            } else {
                return this._monthsShortRegex;
            }
        } else {
            if (!hasOwnProp(this, '_monthsShortRegex')) {
                this._monthsShortRegex = defaultMonthsShortRegex;
            }
            return this._monthsShortStrictRegex && isStrict ?
                this._monthsShortStrictRegex : this._monthsShortRegex;
        }
    }

    var defaultMonthsRegex = matchWord;
    function monthsRegex (isStrict) {
        if (this._monthsParseExact) {
            if (!hasOwnProp(this, '_monthsRegex')) {
                computeMonthsParse.call(this);
            }
            if (isStrict) {
                return this._monthsStrictRegex;
            } else {
                return this._monthsRegex;
            }
        } else {
            if (!hasOwnProp(this, '_monthsRegex')) {
                this._monthsRegex = defaultMonthsRegex;
            }
            return this._monthsStrictRegex && isStrict ?
                this._monthsStrictRegex : this._monthsRegex;
        }
    }

    function computeMonthsParse () {
        function cmpLenRev(a, b) {
            return b.length - a.length;
        }

        var shortPieces = [], longPieces = [], mixedPieces = [],
            i, mom;
        for (i = 0; i < 12; i++) {
            // make the regex if we don't have it already
            mom = createUTC([2000, i]);
            shortPieces.push(this.monthsShort(mom, ''));
            longPieces.push(this.months(mom, ''));
            mixedPieces.push(this.months(mom, ''));
            mixedPieces.push(this.monthsShort(mom, ''));
        }
        // Sorting makes sure if one month (or abbr) is a prefix of another it
        // will match the longer piece.
        shortPieces.sort(cmpLenRev);
        longPieces.sort(cmpLenRev);
        mixedPieces.sort(cmpLenRev);
        for (i = 0; i < 12; i++) {
            shortPieces[i] = regexEscape(shortPieces[i]);
            longPieces[i] = regexEscape(longPieces[i]);
        }
        for (i = 0; i < 24; i++) {
            mixedPieces[i] = regexEscape(mixedPieces[i]);
        }

        this._monthsRegex = new RegExp('^(' + mixedPieces.join('|') + ')', 'i');
        this._monthsShortRegex = this._monthsRegex;
        this._monthsStrictRegex = new RegExp('^(' + longPieces.join('|') + ')', 'i');
        this._monthsShortStrictRegex = new RegExp('^(' + shortPieces.join('|') + ')', 'i');
    }

    function createDate (y, m, d, h, M, s, ms) {
        // can't just apply() to create a date:
        // https://stackoverflow.com/q/181348
        var date = new Date(y, m, d, h, M, s, ms);

        // the date constructor remaps years 0-99 to 1900-1999
        if (y < 100 && y >= 0 && isFinite(date.getFullYear())) {
            date.setFullYear(y);
        }
        return date;
    }

    function createUTCDate (y) {
        var date = new Date(Date.UTC.apply(null, arguments));

        // the Date.UTC function remaps years 0-99 to 1900-1999
        if (y < 100 && y >= 0 && isFinite(date.getUTCFullYear())) {
            date.setUTCFullYear(y);
        }
        return date;
    }

    // start-of-first-week - start-of-year
    function firstWeekOffset(year, dow, doy) {
        var // first-week day -- which january is always in the first week (4 for iso, 1 for other)
            fwd = 7 + dow - doy,
            // first-week day local weekday -- which local weekday is fwd
            fwdlw = (7 + createUTCDate(year, 0, fwd).getUTCDay() - dow) % 7;

        return -fwdlw + fwd - 1;
    }

    // https://en.wikipedia.org/wiki/ISO_week_date#Calculating_a_date_given_the_year.2C_week_number_and_weekday
    function dayOfYearFromWeeks(year, week, weekday, dow, doy) {
        var localWeekday = (7 + weekday - dow) % 7,
            weekOffset = firstWeekOffset(year, dow, doy),
            dayOfYear = 1 + 7 * (week - 1) + localWeekday + weekOffset,
            resYear, resDayOfYear;

        if (dayOfYear <= 0) {
            resYear = year - 1;
            resDayOfYear = daysInYear(resYear) + dayOfYear;
        } else if (dayOfYear > daysInYear(year)) {
            resYear = year + 1;
            resDayOfYear = dayOfYear - daysInYear(year);
        } else {
            resYear = year;
            resDayOfYear = dayOfYear;
        }

        return {
            year: resYear,
            dayOfYear: resDayOfYear
        };
    }

    function weekOfYear(mom, dow, doy) {
        var weekOffset = firstWeekOffset(mom.year(), dow, doy),
            week = Math.floor((mom.dayOfYear() - weekOffset - 1) / 7) + 1,
            resWeek, resYear;

        if (week < 1) {
            resYear = mom.year() - 1;
            resWeek = week + weeksInYear(resYear, dow, doy);
        } else if (week > weeksInYear(mom.year(), dow, doy)) {
            resWeek = week - weeksInYear(mom.year(), dow, doy);
            resYear = mom.year() + 1;
        } else {
            resYear = mom.year();
            resWeek = week;
        }

        return {
            week: resWeek,
            year: resYear
        };
    }

    function weeksInYear(year, dow, doy) {
        var weekOffset = firstWeekOffset(year, dow, doy),
            weekOffsetNext = firstWeekOffset(year + 1, dow, doy);
        return (daysInYear(year) - weekOffset + weekOffsetNext) / 7;
    }

    // FORMATTING

    addFormatToken('w', ['ww', 2], 'wo', 'week');
    addFormatToken('W', ['WW', 2], 'Wo', 'isoWeek');

    // ALIASES

    addUnitAlias('week', 'w');
    addUnitAlias('isoWeek', 'W');

    // PRIORITIES

    addUnitPriority('week', 5);
    addUnitPriority('isoWeek', 5);

    // PARSING

    addRegexToken('w',  match1to2);
    addRegexToken('ww', match1to2, match2);
    addRegexToken('W',  match1to2);
    addRegexToken('WW', match1to2, match2);

    addWeekParseToken(['w', 'ww', 'W', 'WW'], function (input, week, config, token) {
        week[token.substr(0, 1)] = toInt(input);
    });

    // HELPERS

    // LOCALES

    function localeWeek (mom) {
        return weekOfYear(mom, this._week.dow, this._week.doy).week;
    }

    var defaultLocaleWeek = {
        dow : 0, // Sunday is the first day of the week.
        doy : 6  // The week that contains Jan 1st is the first week of the year.
    };

    function localeFirstDayOfWeek () {
        return this._week.dow;
    }

    function localeFirstDayOfYear () {
        return this._week.doy;
    }

    // MOMENTS

    function getSetWeek (input) {
        var week = this.localeData().week(this);
        return input == null ? week : this.add((input - week) * 7, 'd');
    }

    function getSetISOWeek (input) {
        var week = weekOfYear(this, 1, 4).week;
        return input == null ? week : this.add((input - week) * 7, 'd');
    }

    // FORMATTING

    addFormatToken('d', 0, 'do', 'day');

    addFormatToken('dd', 0, 0, function (format) {
        return this.localeData().weekdaysMin(this, format);
    });

    addFormatToken('ddd', 0, 0, function (format) {
        return this.localeData().weekdaysShort(this, format);
    });

    addFormatToken('dddd', 0, 0, function (format) {
        return this.localeData().weekdays(this, format);
    });

    addFormatToken('e', 0, 0, 'weekday');
    addFormatToken('E', 0, 0, 'isoWeekday');

    // ALIASES

    addUnitAlias('day', 'd');
    addUnitAlias('weekday', 'e');
    addUnitAlias('isoWeekday', 'E');

    // PRIORITY
    addUnitPriority('day', 11);
    addUnitPriority('weekday', 11);
    addUnitPriority('isoWeekday', 11);

    // PARSING

    addRegexToken('d',    match1to2);
    addRegexToken('e',    match1to2);
    addRegexToken('E',    match1to2);
    addRegexToken('dd',   function (isStrict, locale) {
        return locale.weekdaysMinRegex(isStrict);
    });
    addRegexToken('ddd',   function (isStrict, locale) {
        return locale.weekdaysShortRegex(isStrict);
    });
    addRegexToken('dddd',   function (isStrict, locale) {
        return locale.weekdaysRegex(isStrict);
    });

    addWeekParseToken(['dd', 'ddd', 'dddd'], function (input, week, config, token) {
        var weekday = config._locale.weekdaysParse(input, token, config._strict);
        // if we didn't get a weekday name, mark the date as invalid
        if (weekday != null) {
            week.d = weekday;
        } else {
            getParsingFlags(config).invalidWeekday = input;
        }
    });

    addWeekParseToken(['d', 'e', 'E'], function (input, week, config, token) {
        week[token] = toInt(input);
    });

    // HELPERS

    function parseWeekday(input, locale) {
        if (typeof input !== 'string') {
            return input;
        }

        if (!isNaN(input)) {
            return parseInt(input, 10);
        }

        input = locale.weekdaysParse(input);
        if (typeof input === 'number') {
            return input;
        }

        return null;
    }

    function parseIsoWeekday(input, locale) {
        if (typeof input === 'string') {
            return locale.weekdaysParse(input) % 7 || 7;
        }
        return isNaN(input) ? null : input;
    }

    // LOCALES

    var defaultLocaleWeekdays = 'Sunday_Monday_Tuesday_Wednesday_Thursday_Friday_Saturday'.split('_');
    function localeWeekdays (m, format) {
        if (!m) {
            return isArray(this._weekdays) ? this._weekdays :
                this._weekdays['standalone'];
        }
        return isArray(this._weekdays) ? this._weekdays[m.day()] :
            this._weekdays[this._weekdays.isFormat.test(format) ? 'format' : 'standalone'][m.day()];
    }

    var defaultLocaleWeekdaysShort = 'Sun_Mon_Tue_Wed_Thu_Fri_Sat'.split('_');
    function localeWeekdaysShort (m) {
        return (m) ? this._weekdaysShort[m.day()] : this._weekdaysShort;
    }

    var defaultLocaleWeekdaysMin = 'Su_Mo_Tu_We_Th_Fr_Sa'.split('_');
    function localeWeekdaysMin (m) {
        return (m) ? this._weekdaysMin[m.day()] : this._weekdaysMin;
    }

    function handleStrictParse$1(weekdayName, format, strict) {
        var i, ii, mom, llc = weekdayName.toLocaleLowerCase();
        if (!this._weekdaysParse) {
            this._weekdaysParse = [];
            this._shortWeekdaysParse = [];
            this._minWeekdaysParse = [];

            for (i = 0; i < 7; ++i) {
                mom = createUTC([2000, 1]).day(i);
                this._minWeekdaysParse[i] = this.weekdaysMin(mom, '').toLocaleLowerCase();
                this._shortWeekdaysParse[i] = this.weekdaysShort(mom, '').toLocaleLowerCase();
                this._weekdaysParse[i] = this.weekdays(mom, '').toLocaleLowerCase();
            }
        }

        if (strict) {
            if (format === 'dddd') {
                ii = indexOf.call(this._weekdaysParse, llc);
                return ii !== -1 ? ii : null;
            } else if (format === 'ddd') {
                ii = indexOf.call(this._shortWeekdaysParse, llc);
                return ii !== -1 ? ii : null;
            } else {
                ii = indexOf.call(this._minWeekdaysParse, llc);
                return ii !== -1 ? ii : null;
            }
        } else {
            if (format === 'dddd') {
                ii = indexOf.call(this._weekdaysParse, llc);
                if (ii !== -1) {
                    return ii;
                }
                ii = indexOf.call(this._shortWeekdaysParse, llc);
                if (ii !== -1) {
                    return ii;
                }
                ii = indexOf.call(this._minWeekdaysParse, llc);
                return ii !== -1 ? ii : null;
            } else if (format === 'ddd') {
                ii = indexOf.call(this._shortWeekdaysParse, llc);
                if (ii !== -1) {
                    return ii;
                }
                ii = indexOf.call(this._weekdaysParse, llc);
                if (ii !== -1) {
                    return ii;
                }
                ii = indexOf.call(this._minWeekdaysParse, llc);
                return ii !== -1 ? ii : null;
            } else {
                ii = indexOf.call(this._minWeekdaysParse, llc);
                if (ii !== -1) {
                    return ii;
                }
                ii = indexOf.call(this._weekdaysParse, llc);
                if (ii !== -1) {
                    return ii;
                }
                ii = indexOf.call(this._shortWeekdaysParse, llc);
                return ii !== -1 ? ii : null;
            }
        }
    }

    function localeWeekdaysParse (weekdayName, format, strict) {
        var i, mom, regex;

        if (this._weekdaysParseExact) {
            return handleStrictParse$1.call(this, weekdayName, format, strict);
        }

        if (!this._weekdaysParse) {
            this._weekdaysParse = [];
            this._minWeekdaysParse = [];
            this._shortWeekdaysParse = [];
            this._fullWeekdaysParse = [];
        }

        for (i = 0; i < 7; i++) {
            // make the regex if we don't have it already

            mom = createUTC([2000, 1]).day(i);
            if (strict && !this._fullWeekdaysParse[i]) {
                this._fullWeekdaysParse[i] = new RegExp('^' + this.weekdays(mom, '').replace('.', '\\.?') + '$', 'i');
                this._shortWeekdaysParse[i] = new RegExp('^' + this.weekdaysShort(mom, '').replace('.', '\\.?') + '$', 'i');
                this._minWeekdaysParse[i] = new RegExp('^' + this.weekdaysMin(mom, '').replace('.', '\\.?') + '$', 'i');
            }
            if (!this._weekdaysParse[i]) {
                regex = '^' + this.weekdays(mom, '') + '|^' + this.weekdaysShort(mom, '') + '|^' + this.weekdaysMin(mom, '');
                this._weekdaysParse[i] = new RegExp(regex.replace('.', ''), 'i');
            }
            // test the regex
            if (strict && format === 'dddd' && this._fullWeekdaysParse[i].test(weekdayName)) {
                return i;
            } else if (strict && format === 'ddd' && this._shortWeekdaysParse[i].test(weekdayName)) {
                return i;
            } else if (strict && format === 'dd' && this._minWeekdaysParse[i].test(weekdayName)) {
                return i;
            } else if (!strict && this._weekdaysParse[i].test(weekdayName)) {
                return i;
            }
        }
    }

    // MOMENTS

    function getSetDayOfWeek (input) {
        if (!this.isValid()) {
            return input != null ? this : NaN;
        }
        var day = this._isUTC ? this._d.getUTCDay() : this._d.getDay();
        if (input != null) {
            input = parseWeekday(input, this.localeData());
            return this.add(input - day, 'd');
        } else {
            return day;
        }
    }

    function getSetLocaleDayOfWeek (input) {
        if (!this.isValid()) {
            return input != null ? this : NaN;
        }
        var weekday = (this.day() + 7 - this.localeData()._week.dow) % 7;
        return input == null ? weekday : this.add(input - weekday, 'd');
    }

    function getSetISODayOfWeek (input) {
        if (!this.isValid()) {
            return input != null ? this : NaN;
        }

        // behaves the same as moment#day except
        // as a getter, returns 7 instead of 0 (1-7 range instead of 0-6)
        // as a setter, sunday should belong to the previous week.

        if (input != null) {
            var weekday = parseIsoWeekday(input, this.localeData());
            return this.day(this.day() % 7 ? weekday : weekday - 7);
        } else {
            return this.day() || 7;
        }
    }

    var defaultWeekdaysRegex = matchWord;
    function weekdaysRegex (isStrict) {
        if (this._weekdaysParseExact) {
            if (!hasOwnProp(this, '_weekdaysRegex')) {
                computeWeekdaysParse.call(this);
            }
            if (isStrict) {
                return this._weekdaysStrictRegex;
            } else {
                return this._weekdaysRegex;
            }
        } else {
            if (!hasOwnProp(this, '_weekdaysRegex')) {
                this._weekdaysRegex = defaultWeekdaysRegex;
            }
            return this._weekdaysStrictRegex && isStrict ?
                this._weekdaysStrictRegex : this._weekdaysRegex;
        }
    }

    var defaultWeekdaysShortRegex = matchWord;
    function weekdaysShortRegex (isStrict) {
        if (this._weekdaysParseExact) {
            if (!hasOwnProp(this, '_weekdaysRegex')) {
                computeWeekdaysParse.call(this);
            }
            if (isStrict) {
                return this._weekdaysShortStrictRegex;
            } else {
                return this._weekdaysShortRegex;
            }
        } else {
            if (!hasOwnProp(this, '_weekdaysShortRegex')) {
                this._weekdaysShortRegex = defaultWeekdaysShortRegex;
            }
            return this._weekdaysShortStrictRegex && isStrict ?
                this._weekdaysShortStrictRegex : this._weekdaysShortRegex;
        }
    }

    var defaultWeekdaysMinRegex = matchWord;
    function weekdaysMinRegex (isStrict) {
        if (this._weekdaysParseExact) {
            if (!hasOwnProp(this, '_weekdaysRegex')) {
                computeWeekdaysParse.call(this);
            }
            if (isStrict) {
                return this._weekdaysMinStrictRegex;
            } else {
                return this._weekdaysMinRegex;
            }
        } else {
            if (!hasOwnProp(this, '_weekdaysMinRegex')) {
                this._weekdaysMinRegex = defaultWeekdaysMinRegex;
            }
            return this._weekdaysMinStrictRegex && isStrict ?
                this._weekdaysMinStrictRegex : this._weekdaysMinRegex;
        }
    }


    function computeWeekdaysParse () {
        function cmpLenRev(a, b) {
            return b.length - a.length;
        }

        var minPieces = [], shortPieces = [], longPieces = [], mixedPieces = [],
            i, mom, minp, shortp, longp;
        for (i = 0; i < 7; i++) {
            // make the regex if we don't have it already
            mom = createUTC([2000, 1]).day(i);
            minp = this.weekdaysMin(mom, '');
            shortp = this.weekdaysShort(mom, '');
            longp = this.weekdays(mom, '');
            minPieces.push(minp);
            shortPieces.push(shortp);
            longPieces.push(longp);
            mixedPieces.push(minp);
            mixedPieces.push(shortp);
            mixedPieces.push(longp);
        }
        // Sorting makes sure if one weekday (or abbr) is a prefix of another it
        // will match the longer piece.
        minPieces.sort(cmpLenRev);
        shortPieces.sort(cmpLenRev);
        longPieces.sort(cmpLenRev);
        mixedPieces.sort(cmpLenRev);
        for (i = 0; i < 7; i++) {
            shortPieces[i] = regexEscape(shortPieces[i]);
            longPieces[i] = regexEscape(longPieces[i]);
            mixedPieces[i] = regexEscape(mixedPieces[i]);
        }

        this._weekdaysRegex = new RegExp('^(' + mixedPieces.join('|') + ')', 'i');
        this._weekdaysShortRegex = this._weekdaysRegex;
        this._weekdaysMinRegex = this._weekdaysRegex;

        this._weekdaysStrictRegex = new RegExp('^(' + longPieces.join('|') + ')', 'i');
        this._weekdaysShortStrictRegex = new RegExp('^(' + shortPieces.join('|') + ')', 'i');
        this._weekdaysMinStrictRegex = new RegExp('^(' + minPieces.join('|') + ')', 'i');
    }

    // FORMATTING

    function hFormat() {
        return this.hours() % 12 || 12;
    }

    function kFormat() {
        return this.hours() || 24;
    }

    addFormatToken('H', ['HH', 2], 0, 'hour');
    addFormatToken('h', ['hh', 2], 0, hFormat);
    addFormatToken('k', ['kk', 2], 0, kFormat);

    addFormatToken('hmm', 0, 0, function () {
        return '' + hFormat.apply(this) + zeroFill(this.minutes(), 2);
    });

    addFormatToken('hmmss', 0, 0, function () {
        return '' + hFormat.apply(this) + zeroFill(this.minutes(), 2) +
            zeroFill(this.seconds(), 2);
    });

    addFormatToken('Hmm', 0, 0, function () {
        return '' + this.hours() + zeroFill(this.minutes(), 2);
    });

    addFormatToken('Hmmss', 0, 0, function () {
        return '' + this.hours() + zeroFill(this.minutes(), 2) +
            zeroFill(this.seconds(), 2);
    });

    function meridiem (token, lowercase) {
        addFormatToken(token, 0, 0, function () {
            return this.localeData().meridiem(this.hours(), this.minutes(), lowercase);
        });
    }

    meridiem('a', true);
    meridiem('A', false);

    // ALIASES

    addUnitAlias('hour', 'h');

    // PRIORITY
    addUnitPriority('hour', 13);

    // PARSING

    function matchMeridiem (isStrict, locale) {
        return locale._meridiemParse;
    }

    addRegexToken('a',  matchMeridiem);
    addRegexToken('A',  matchMeridiem);
    addRegexToken('H',  match1to2);
    addRegexToken('h',  match1to2);
    addRegexToken('k',  match1to2);
    addRegexToken('HH', match1to2, match2);
    addRegexToken('hh', match1to2, match2);
    addRegexToken('kk', match1to2, match2);

    addRegexToken('hmm', match3to4);
    addRegexToken('hmmss', match5to6);
    addRegexToken('Hmm', match3to4);
    addRegexToken('Hmmss', match5to6);

    addParseToken(['H', 'HH'], HOUR);
    addParseToken(['k', 'kk'], function (input, array, config) {
        var kInput = toInt(input);
        array[HOUR] = kInput === 24 ? 0 : kInput;
    });
    addParseToken(['a', 'A'], function (input, array, config) {
        config._isPm = config._locale.isPM(input);
        config._meridiem = input;
    });
    addParseToken(['h', 'hh'], function (input, array, config) {
        array[HOUR] = toInt(input);
        getParsingFlags(config).bigHour = true;
    });
    addParseToken('hmm', function (input, array, config) {
        var pos = input.length - 2;
        array[HOUR] = toInt(input.substr(0, pos));
        array[MINUTE] = toInt(input.substr(pos));
        getParsingFlags(config).bigHour = true;
    });
    addParseToken('hmmss', function (input, array, config) {
        var pos1 = input.length - 4;
        var pos2 = input.length - 2;
        array[HOUR] = toInt(input.substr(0, pos1));
        array[MINUTE] = toInt(input.substr(pos1, 2));
        array[SECOND] = toInt(input.substr(pos2));
        getParsingFlags(config).bigHour = true;
    });
    addParseToken('Hmm', function (input, array, config) {
        var pos = input.length - 2;
        array[HOUR] = toInt(input.substr(0, pos));
        array[MINUTE] = toInt(input.substr(pos));
    });
    addParseToken('Hmmss', function (input, array, config) {
        var pos1 = input.length - 4;
        var pos2 = input.length - 2;
        array[HOUR] = toInt(input.substr(0, pos1));
        array[MINUTE] = toInt(input.substr(pos1, 2));
        array[SECOND] = toInt(input.substr(pos2));
    });

    // LOCALES

    function localeIsPM (input) {
        // IE8 Quirks Mode & IE7 Standards Mode do not allow accessing strings like arrays
        // Using charAt should be more compatible.
        return ((input + '').toLowerCase().charAt(0) === 'p');
    }

    var defaultLocaleMeridiemParse = /[ap]\.?m?\.?/i;
    function localeMeridiem (hours, minutes, isLower) {
        if (hours > 11) {
            return isLower ? 'pm' : 'PM';
        } else {
            return isLower ? 'am' : 'AM';
        }
    }


    // MOMENTS

    // Setting the hour should keep the time, because the user explicitly
    // specified which hour they want. So trying to maintain the same hour (in
    // a new timezone) makes sense. Adding/subtracting hours does not follow
    // this rule.
    var getSetHour = makeGetSet('Hours', true);

    var baseConfig = {
        calendar: defaultCalendar,
        longDateFormat: defaultLongDateFormat,
        invalidDate: defaultInvalidDate,
        ordinal: defaultOrdinal,
        dayOfMonthOrdinalParse: defaultDayOfMonthOrdinalParse,
        relativeTime: defaultRelativeTime,

        months: defaultLocaleMonths,
        monthsShort: defaultLocaleMonthsShort,

        week: defaultLocaleWeek,

        weekdays: defaultLocaleWeekdays,
        weekdaysMin: defaultLocaleWeekdaysMin,
        weekdaysShort: defaultLocaleWeekdaysShort,

        meridiemParse: defaultLocaleMeridiemParse
    };

    // internal storage for locale config files
    var locales = {};
    var localeFamilies = {};
    var globalLocale;

    function normalizeLocale(key) {
        return key ? key.toLowerCase().replace('_', '-') : key;
    }

    // pick the locale from the array
    // try ['en-au', 'en-gb'] as 'en-au', 'en-gb', 'en', as in move through the list trying each
    // substring from most specific to least, but move to the next array item if it's a more specific variant than the current root
    function chooseLocale(names) {
        var i = 0, j, next, locale, split;

        while (i < names.length) {
            split = normalizeLocale(names[i]).split('-');
            j = split.length;
            next = normalizeLocale(names[i + 1]);
            next = next ? next.split('-') : null;
            while (j > 0) {
                locale = loadLocale(split.slice(0, j).join('-'));
                if (locale) {
                    return locale;
                }
                if (next && next.length >= j && compareArrays(split, next, true) >= j - 1) {
                    //the next array item is better than a shallower substring of this one
                    break;
                }
                j--;
            }
            i++;
        }
        return globalLocale;
    }

    function loadLocale(name) {
        var oldLocale = null;
        // TODO: Find a better way to register and load all the locales in Node
        if (!locales[name] && (typeof module !== 'undefined') &&
                module && module.exports) {
            try {
                oldLocale = globalLocale._abbr;
                var aliasedRequire = require;
                aliasedRequire('./locale/' + name);
                getSetGlobalLocale(oldLocale);
            } catch (e) {}
        }
        return locales[name];
    }

    // This function will load locale and then set the global locale.  If
    // no arguments are passed in, it will simply return the current global
    // locale key.
    function getSetGlobalLocale (key, values) {
        var data;
        if (key) {
            if (isUndefined(values)) {
                data = getLocale(key);
            }
            else {
                data = defineLocale(key, values);
            }

            if (data) {
                // moment.duration._locale = moment._locale = data;
                globalLocale = data;
            }
            else {
                if ((typeof console !==  'undefined') && console.warn) {
                    //warn user if arguments are passed but the locale could not be set
                    console.warn('Locale ' + key +  ' not found. Did you forget to load it?');
                }
            }
        }

        return globalLocale._abbr;
    }

    function defineLocale (name, config) {
        if (config !== null) {
            var locale, parentConfig = baseConfig;
            config.abbr = name;
            if (locales[name] != null) {
                deprecateSimple('defineLocaleOverride',
                        'use moment.updateLocale(localeName, config) to change ' +
                        'an existing locale. moment.defineLocale(localeName, ' +
                        'config) should only be used for creating a new locale ' +
                        'See http://momentjs.com/guides/#/warnings/define-locale/ for more info.');
                parentConfig = locales[name]._config;
            } else if (config.parentLocale != null) {
                if (locales[config.parentLocale] != null) {
                    parentConfig = locales[config.parentLocale]._config;
                } else {
                    locale = loadLocale(config.parentLocale);
                    if (locale != null) {
                        parentConfig = locale._config;
                    } else {
                        if (!localeFamilies[config.parentLocale]) {
                            localeFamilies[config.parentLocale] = [];
                        }
                        localeFamilies[config.parentLocale].push({
                            name: name,
                            config: config
                        });
                        return null;
                    }
                }
            }
            locales[name] = new Locale(mergeConfigs(parentConfig, config));

            if (localeFamilies[name]) {
                localeFamilies[name].forEach(function (x) {
                    defineLocale(x.name, x.config);
                });
            }

            // backwards compat for now: also set the locale
            // make sure we set the locale AFTER all child locales have been
            // created, so we won't end up with the child locale set.
            getSetGlobalLocale(name);


            return locales[name];
        } else {
            // useful for testing
            delete locales[name];
            return null;
        }
    }

    function updateLocale(name, config) {
        if (config != null) {
            var locale, tmpLocale, parentConfig = baseConfig;
            // MERGE
            tmpLocale = loadLocale(name);
            if (tmpLocale != null) {
                parentConfig = tmpLocale._config;
            }
            config = mergeConfigs(parentConfig, config);
            locale = new Locale(config);
            locale.parentLocale = locales[name];
            locales[name] = locale;

            // backwards compat for now: also set the locale
            getSetGlobalLocale(name);
        } else {
            // pass null for config to unupdate, useful for tests
            if (locales[name] != null) {
                if (locales[name].parentLocale != null) {
                    locales[name] = locales[name].parentLocale;
                } else if (locales[name] != null) {
                    delete locales[name];
                }
            }
        }
        return locales[name];
    }

    // returns locale data
    function getLocale (key) {
        var locale;

        if (key && key._locale && key._locale._abbr) {
            key = key._locale._abbr;
        }

        if (!key) {
            return globalLocale;
        }

        if (!isArray(key)) {
            //short-circuit everything else
            locale = loadLocale(key);
            if (locale) {
                return locale;
            }
            key = [key];
        }

        return chooseLocale(key);
    }

    function listLocales() {
        return keys(locales);
    }

    function checkOverflow (m) {
        var overflow;
        var a = m._a;

        if (a && getParsingFlags(m).overflow === -2) {
            overflow =
                a[MONTH]       < 0 || a[MONTH]       > 11  ? MONTH :
                a[DATE]        < 1 || a[DATE]        > daysInMonth(a[YEAR], a[MONTH]) ? DATE :
                a[HOUR]        < 0 || a[HOUR]        > 24 || (a[HOUR] === 24 && (a[MINUTE] !== 0 || a[SECOND] !== 0 || a[MILLISECOND] !== 0)) ? HOUR :
                a[MINUTE]      < 0 || a[MINUTE]      > 59  ? MINUTE :
                a[SECOND]      < 0 || a[SECOND]      > 59  ? SECOND :
                a[MILLISECOND] < 0 || a[MILLISECOND] > 999 ? MILLISECOND :
                -1;

            if (getParsingFlags(m)._overflowDayOfYear && (overflow < YEAR || overflow > DATE)) {
                overflow = DATE;
            }
            if (getParsingFlags(m)._overflowWeeks && overflow === -1) {
                overflow = WEEK;
            }
            if (getParsingFlags(m)._overflowWeekday && overflow === -1) {
                overflow = WEEKDAY;
            }

            getParsingFlags(m).overflow = overflow;
        }

        return m;
    }

    // Pick the first defined of two or three arguments.
    function defaults(a, b, c) {
        if (a != null) {
            return a;
        }
        if (b != null) {
            return b;
        }
        return c;
    }

    function currentDateArray(config) {
        // hooks is actually the exported moment object
        var nowValue = new Date(hooks.now());
        if (config._useUTC) {
            return [nowValue.getUTCFullYear(), nowValue.getUTCMonth(), nowValue.getUTCDate()];
        }
        return [nowValue.getFullYear(), nowValue.getMonth(), nowValue.getDate()];
    }

    // convert an array to a date.
    // the array should mirror the parameters below
    // note: all values past the year are optional and will default to the lowest possible value.
    // [year, month, day , hour, minute, second, millisecond]
    function configFromArray (config) {
        var i, date, input = [], currentDate, expectedWeekday, yearToUse;

        if (config._d) {
            return;
        }

        currentDate = currentDateArray(config);

        //compute day of the year from weeks and weekdays
        if (config._w && config._a[DATE] == null && config._a[MONTH] == null) {
            dayOfYearFromWeekInfo(config);
        }

        //if the day of the year is set, figure out what it is
        if (config._dayOfYear != null) {
            yearToUse = defaults(config._a[YEAR], currentDate[YEAR]);

            if (config._dayOfYear > daysInYear(yearToUse) || config._dayOfYear === 0) {
                getParsingFlags(config)._overflowDayOfYear = true;
            }

            date = createUTCDate(yearToUse, 0, config._dayOfYear);
            config._a[MONTH] = date.getUTCMonth();
            config._a[DATE] = date.getUTCDate();
        }

        // Default to current date.
        // * if no year, month, day of month are given, default to today
        // * if day of month is given, default month and year
        // * if month is given, default only year
        // * if year is given, don't default anything
        for (i = 0; i < 3 && config._a[i] == null; ++i) {
            config._a[i] = input[i] = currentDate[i];
        }

        // Zero out whatever was not defaulted, including time
        for (; i < 7; i++) {
            config._a[i] = input[i] = (config._a[i] == null) ? (i === 2 ? 1 : 0) : config._a[i];
        }

        // Check for 24:00:00.000
        if (config._a[HOUR] === 24 &&
                config._a[MINUTE] === 0 &&
                config._a[SECOND] === 0 &&
                config._a[MILLISECOND] === 0) {
            config._nextDay = true;
            config._a[HOUR] = 0;
        }

        config._d = (config._useUTC ? createUTCDate : createDate).apply(null, input);
        expectedWeekday = config._useUTC ? config._d.getUTCDay() : config._d.getDay();

        // Apply timezone offset from input. The actual utcOffset can be changed
        // with parseZone.
        if (config._tzm != null) {
            config._d.setUTCMinutes(config._d.getUTCMinutes() - config._tzm);
        }

        if (config._nextDay) {
            config._a[HOUR] = 24;
        }

        // check for mismatching day of week
        if (config._w && typeof config._w.d !== 'undefined' && config._w.d !== expectedWeekday) {
            getParsingFlags(config).weekdayMismatch = true;
        }
    }

    function dayOfYearFromWeekInfo(config) {
        var w, weekYear, week, weekday, dow, doy, temp, weekdayOverflow;

        w = config._w;
        if (w.GG != null || w.W != null || w.E != null) {
            dow = 1;
            doy = 4;

            // TODO: We need to take the current isoWeekYear, but that depends on
            // how we interpret now (local, utc, fixed offset). So create
            // a now version of current config (take local/utc/offset flags, and
            // create now).
            weekYear = defaults(w.GG, config._a[YEAR], weekOfYear(createLocal(), 1, 4).year);
            week = defaults(w.W, 1);
            weekday = defaults(w.E, 1);
            if (weekday < 1 || weekday > 7) {
                weekdayOverflow = true;
            }
        } else {
            dow = config._locale._week.dow;
            doy = config._locale._week.doy;

            var curWeek = weekOfYear(createLocal(), dow, doy);

            weekYear = defaults(w.gg, config._a[YEAR], curWeek.year);

            // Default to current week.
            week = defaults(w.w, curWeek.week);

            if (w.d != null) {
                // weekday -- low day numbers are considered next week
                weekday = w.d;
                if (weekday < 0 || weekday > 6) {
                    weekdayOverflow = true;
                }
            } else if (w.e != null) {
                // local weekday -- counting starts from begining of week
                weekday = w.e + dow;
                if (w.e < 0 || w.e > 6) {
                    weekdayOverflow = true;
                }
            } else {
                // default to begining of week
                weekday = dow;
            }
        }
        if (week < 1 || week > weeksInYear(weekYear, dow, doy)) {
            getParsingFlags(config)._overflowWeeks = true;
        } else if (weekdayOverflow != null) {
            getParsingFlags(config)._overflowWeekday = true;
        } else {
            temp = dayOfYearFromWeeks(weekYear, week, weekday, dow, doy);
            config._a[YEAR] = temp.year;
            config._dayOfYear = temp.dayOfYear;
        }
    }

    // iso 8601 regex
    // 0000-00-00 0000-W00 or 0000-W00-0 + T + 00 or 00:00 or 00:00:00 or 00:00:00.000 + +00:00 or +0000 or +00)
    var extendedIsoRegex = /^\s*((?:[+-]\d{6}|\d{4})-(?:\d\d-\d\d|W\d\d-\d|W\d\d|\d\d\d|\d\d))(?:(T| )(\d\d(?::\d\d(?::\d\d(?:[.,]\d+)?)?)?)([\+\-]\d\d(?::?\d\d)?|\s*Z)?)?$/;
    var basicIsoRegex = /^\s*((?:[+-]\d{6}|\d{4})(?:\d\d\d\d|W\d\d\d|W\d\d|\d\d\d|\d\d))(?:(T| )(\d\d(?:\d\d(?:\d\d(?:[.,]\d+)?)?)?)([\+\-]\d\d(?::?\d\d)?|\s*Z)?)?$/;

    var tzRegex = /Z|[+-]\d\d(?::?\d\d)?/;

    var isoDates = [
        ['YYYYYY-MM-DD', /[+-]\d{6}-\d\d-\d\d/],
        ['YYYY-MM-DD', /\d{4}-\d\d-\d\d/],
        ['GGGG-[W]WW-E', /\d{4}-W\d\d-\d/],
        ['GGGG-[W]WW', /\d{4}-W\d\d/, false],
        ['YYYY-DDD', /\d{4}-\d{3}/],
        ['YYYY-MM', /\d{4}-\d\d/, false],
        ['YYYYYYMMDD', /[+-]\d{10}/],
        ['YYYYMMDD', /\d{8}/],
        // YYYYMM is NOT allowed by the standard
        ['GGGG[W]WWE', /\d{4}W\d{3}/],
        ['GGGG[W]WW', /\d{4}W\d{2}/, false],
        ['YYYYDDD', /\d{7}/]
    ];

    // iso time formats and regexes
    var isoTimes = [
        ['HH:mm:ss.SSSS', /\d\d:\d\d:\d\d\.\d+/],
        ['HH:mm:ss,SSSS', /\d\d:\d\d:\d\d,\d+/],
        ['HH:mm:ss', /\d\d:\d\d:\d\d/],
        ['HH:mm', /\d\d:\d\d/],
        ['HHmmss.SSSS', /\d\d\d\d\d\d\.\d+/],
        ['HHmmss,SSSS', /\d\d\d\d\d\d,\d+/],
        ['HHmmss', /\d\d\d\d\d\d/],
        ['HHmm', /\d\d\d\d/],
        ['HH', /\d\d/]
    ];

    var aspNetJsonRegex = /^\/?Date\((\-?\d+)/i;

    // date from iso format
    function configFromISO(config) {
        var i, l,
            string = config._i,
            match = extendedIsoRegex.exec(string) || basicIsoRegex.exec(string),
            allowTime, dateFormat, timeFormat, tzFormat;

        if (match) {
            getParsingFlags(config).iso = true;

            for (i = 0, l = isoDates.length; i < l; i++) {
                if (isoDates[i][1].exec(match[1])) {
                    dateFormat = isoDates[i][0];
                    allowTime = isoDates[i][2] !== false;
                    break;
                }
            }
            if (dateFormat == null) {
                config._isValid = false;
                return;
            }
            if (match[3]) {
                for (i = 0, l = isoTimes.length; i < l; i++) {
                    if (isoTimes[i][1].exec(match[3])) {
                        // match[2] should be 'T' or space
                        timeFormat = (match[2] || ' ') + isoTimes[i][0];
                        break;
                    }
                }
                if (timeFormat == null) {
                    config._isValid = false;
                    return;
                }
            }
            if (!allowTime && timeFormat != null) {
                config._isValid = false;
                return;
            }
            if (match[4]) {
                if (tzRegex.exec(match[4])) {
                    tzFormat = 'Z';
                } else {
                    config._isValid = false;
                    return;
                }
            }
            config._f = dateFormat + (timeFormat || '') + (tzFormat || '');
            configFromStringAndFormat(config);
        } else {
            config._isValid = false;
        }
    }

    // RFC 2822 regex: For details see https://tools.ietf.org/html/rfc2822#section-3.3
    var rfc2822 = /^(?:(Mon|Tue|Wed|Thu|Fri|Sat|Sun),?\s)?(\d{1,2})\s(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s(\d{2,4})\s(\d\d):(\d\d)(?::(\d\d))?\s(?:(UT|GMT|[ECMP][SD]T)|([Zz])|([+-]\d{4}))$/;

    function extractFromRFC2822Strings(yearStr, monthStr, dayStr, hourStr, minuteStr, secondStr) {
        var result = [
            untruncateYear(yearStr),
            defaultLocaleMonthsShort.indexOf(monthStr),
            parseInt(dayStr, 10),
            parseInt(hourStr, 10),
            parseInt(minuteStr, 10)
        ];

        if (secondStr) {
            result.push(parseInt(secondStr, 10));
        }

        return result;
    }

    function untruncateYear(yearStr) {
        var year = parseInt(yearStr, 10);
        if (year <= 49) {
            return 2000 + year;
        } else if (year <= 999) {
            return 1900 + year;
        }
        return year;
    }

    function preprocessRFC2822(s) {
        // Remove comments and folding whitespace and replace multiple-spaces with a single space
        return s.replace(/\([^)]*\)|[\n\t]/g, ' ').replace(/(\s\s+)/g, ' ').replace(/^\s\s*/, '').replace(/\s\s*$/, '');
    }

    function checkWeekday(weekdayStr, parsedInput, config) {
        if (weekdayStr) {
            // TODO: Replace the vanilla JS Date object with an indepentent day-of-week check.
            var weekdayProvided = defaultLocaleWeekdaysShort.indexOf(weekdayStr),
                weekdayActual = new Date(parsedInput[0], parsedInput[1], parsedInput[2]).getDay();
            if (weekdayProvided !== weekdayActual) {
                getParsingFlags(config).weekdayMismatch = true;
                config._isValid = false;
                return false;
            }
        }
        return true;
    }

    var obsOffsets = {
        UT: 0,
        GMT: 0,
        EDT: -4 * 60,
        EST: -5 * 60,
        CDT: -5 * 60,
        CST: -6 * 60,
        MDT: -6 * 60,
        MST: -7 * 60,
        PDT: -7 * 60,
        PST: -8 * 60
    };

    function calculateOffset(obsOffset, militaryOffset, numOffset) {
        if (obsOffset) {
            return obsOffsets[obsOffset];
        } else if (militaryOffset) {
            // the only allowed military tz is Z
            return 0;
        } else {
            var hm = parseInt(numOffset, 10);
            var m = hm % 100, h = (hm - m) / 100;
            return h * 60 + m;
        }
    }

    // date and time from ref 2822 format
    function configFromRFC2822(config) {
        var match = rfc2822.exec(preprocessRFC2822(config._i));
        if (match) {
            var parsedArray = extractFromRFC2822Strings(match[4], match[3], match[2], match[5], match[6], match[7]);
            if (!checkWeekday(match[1], parsedArray, config)) {
                return;
            }

            config._a = parsedArray;
            config._tzm = calculateOffset(match[8], match[9], match[10]);

            config._d = createUTCDate.apply(null, config._a);
            config._d.setUTCMinutes(config._d.getUTCMinutes() - config._tzm);

            getParsingFlags(config).rfc2822 = true;
        } else {
            config._isValid = false;
        }
    }

    // date from iso format or fallback
    function configFromString(config) {
        var matched = aspNetJsonRegex.exec(config._i);

        if (matched !== null) {
            config._d = new Date(+matched[1]);
            return;
        }

        configFromISO(config);
        if (config._isValid === false) {
            delete config._isValid;
        } else {
            return;
        }

        configFromRFC2822(config);
        if (config._isValid === false) {
            delete config._isValid;
        } else {
            return;
        }

        // Final attempt, use Input Fallback
        hooks.createFromInputFallback(config);
    }

    hooks.createFromInputFallback = deprecate(
        'value provided is not in a recognized RFC2822 or ISO format. moment construction falls back to js Date(), ' +
        'which is not reliable across all browsers and versions. Non RFC2822/ISO date formats are ' +
        'discouraged and will be removed in an upcoming major release. Please refer to ' +
        'http://momentjs.com/guides/#/warnings/js-date/ for more info.',
        function (config) {
            config._d = new Date(config._i + (config._useUTC ? ' UTC' : ''));
        }
    );

    // constant that refers to the ISO standard
    hooks.ISO_8601 = function () {};

    // constant that refers to the RFC 2822 form
    hooks.RFC_2822 = function () {};

    // date from string and format string
    function configFromStringAndFormat(config) {
        // TODO: Move this to another part of the creation flow to prevent circular deps
        if (config._f === hooks.ISO_8601) {
            configFromISO(config);
            return;
        }
        if (config._f === hooks.RFC_2822) {
            configFromRFC2822(config);
            return;
        }
        config._a = [];
        getParsingFlags(config).empty = true;

        // This array is used to make a Date, either with `new Date` or `Date.UTC`
        var string = '' + config._i,
            i, parsedInput, tokens, token, skipped,
            stringLength = string.length,
            totalParsedInputLength = 0;

        tokens = expandFormat(config._f, config._locale).match(formattingTokens) || [];

        for (i = 0; i < tokens.length; i++) {
            token = tokens[i];
            parsedInput = (string.match(getParseRegexForToken(token, config)) || [])[0];
            // console.log('token', token, 'parsedInput', parsedInput,
            //         'regex', getParseRegexForToken(token, config));
            if (parsedInput) {
                skipped = string.substr(0, string.indexOf(parsedInput));
                if (skipped.length > 0) {
                    getParsingFlags(config).unusedInput.push(skipped);
                }
                string = string.slice(string.indexOf(parsedInput) + parsedInput.length);
                totalParsedInputLength += parsedInput.length;
            }
            // don't parse if it's not a known token
            if (formatTokenFunctions[token]) {
                if (parsedInput) {
                    getParsingFlags(config).empty = false;
                }
                else {
                    getParsingFlags(config).unusedTokens.push(token);
                }
                addTimeToArrayFromToken(token, parsedInput, config);
            }
            else if (config._strict && !parsedInput) {
                getParsingFlags(config).unusedTokens.push(token);
            }
        }

        // add remaining unparsed input length to the string
        getParsingFlags(config).charsLeftOver = stringLength - totalParsedInputLength;
        if (string.length > 0) {
            getParsingFlags(config).unusedInput.push(string);
        }

        // clear _12h flag if hour is <= 12
        if (config._a[HOUR] <= 12 &&
            getParsingFlags(config).bigHour === true &&
            config._a[HOUR] > 0) {
            getParsingFlags(config).bigHour = undefined;
        }

        getParsingFlags(config).parsedDateParts = config._a.slice(0);
        getParsingFlags(config).meridiem = config._meridiem;
        // handle meridiem
        config._a[HOUR] = meridiemFixWrap(config._locale, config._a[HOUR], config._meridiem);

        configFromArray(config);
        checkOverflow(config);
    }


    function meridiemFixWrap (locale, hour, meridiem) {
        var isPm;

        if (meridiem == null) {
            // nothing to do
            return hour;
        }
        if (locale.meridiemHour != null) {
            return locale.meridiemHour(hour, meridiem);
        } else if (locale.isPM != null) {
            // Fallback
            isPm = locale.isPM(meridiem);
            if (isPm && hour < 12) {
                hour += 12;
            }
            if (!isPm && hour === 12) {
                hour = 0;
            }
            return hour;
        } else {
            // this is not supposed to happen
            return hour;
        }
    }

    // date from string and array of format strings
    function configFromStringAndArray(config) {
        var tempConfig,
            bestMoment,

            scoreToBeat,
            i,
            currentScore;

        if (config._f.length === 0) {
            getParsingFlags(config).invalidFormat = true;
            config._d = new Date(NaN);
            return;
        }

        for (i = 0; i < config._f.length; i++) {
            currentScore = 0;
            tempConfig = copyConfig({}, config);
            if (config._useUTC != null) {
                tempConfig._useUTC = config._useUTC;
            }
            tempConfig._f = config._f[i];
            configFromStringAndFormat(tempConfig);

            if (!isValid(tempConfig)) {
                continue;
            }

            // if there is any input that was not parsed add a penalty for that format
            currentScore += getParsingFlags(tempConfig).charsLeftOver;

            //or tokens
            currentScore += getParsingFlags(tempConfig).unusedTokens.length * 10;

            getParsingFlags(tempConfig).score = currentScore;

            if (scoreToBeat == null || currentScore < scoreToBeat) {
                scoreToBeat = currentScore;
                bestMoment = tempConfig;
            }
        }

        extend(config, bestMoment || tempConfig);
    }

    function configFromObject(config) {
        if (config._d) {
            return;
        }

        var i = normalizeObjectUnits(config._i);
        config._a = map([i.year, i.month, i.day || i.date, i.hour, i.minute, i.second, i.millisecond], function (obj) {
            return obj && parseInt(obj, 10);
        });

        configFromArray(config);
    }

    function createFromConfig (config) {
        var res = new Moment(checkOverflow(prepareConfig(config)));
        if (res._nextDay) {
            // Adding is smart enough around DST
            res.add(1, 'd');
            res._nextDay = undefined;
        }

        return res;
    }

    function prepareConfig (config) {
        var input = config._i,
            format = config._f;

        config._locale = config._locale || getLocale(config._l);

        if (input === null || (format === undefined && input === '')) {
            return createInvalid({nullInput: true});
        }

        if (typeof input === 'string') {
            config._i = input = config._locale.preparse(input);
        }

        if (isMoment(input)) {
            return new Moment(checkOverflow(input));
        } else if (isDate(input)) {
            config._d = input;
        } else if (isArray(format)) {
            configFromStringAndArray(config);
        } else if (format) {
            configFromStringAndFormat(config);
        }  else {
            configFromInput(config);
        }

        if (!isValid(config)) {
            config._d = null;
        }

        return config;
    }

    function configFromInput(config) {
        var input = config._i;
        if (isUndefined(input)) {
            config._d = new Date(hooks.now());
        } else if (isDate(input)) {
            config._d = new Date(input.valueOf());
        } else if (typeof input === 'string') {
            configFromString(config);
        } else if (isArray(input)) {
            config._a = map(input.slice(0), function (obj) {
                return parseInt(obj, 10);
            });
            configFromArray(config);
        } else if (isObject(input)) {
            configFromObject(config);
        } else if (isNumber(input)) {
            // from milliseconds
            config._d = new Date(input);
        } else {
            hooks.createFromInputFallback(config);
        }
    }

    function createLocalOrUTC (input, format, locale, strict, isUTC) {
        var c = {};

        if (locale === true || locale === false) {
            strict = locale;
            locale = undefined;
        }

        if ((isObject(input) && isObjectEmpty(input)) ||
                (isArray(input) && input.length === 0)) {
            input = undefined;
        }
        // object construction must be done this way.
        // https://github.com/moment/moment/issues/1423
        c._isAMomentObject = true;
        c._useUTC = c._isUTC = isUTC;
        c._l = locale;
        c._i = input;
        c._f = format;
        c._strict = strict;

        return createFromConfig(c);
    }

    function createLocal (input, format, locale, strict) {
        return createLocalOrUTC(input, format, locale, strict, false);
    }

    var prototypeMin = deprecate(
        'moment().min is deprecated, use moment.max instead. http://momentjs.com/guides/#/warnings/min-max/',
        function () {
            var other = createLocal.apply(null, arguments);
            if (this.isValid() && other.isValid()) {
                return other < this ? this : other;
            } else {
                return createInvalid();
            }
        }
    );

    var prototypeMax = deprecate(
        'moment().max is deprecated, use moment.min instead. http://momentjs.com/guides/#/warnings/min-max/',
        function () {
            var other = createLocal.apply(null, arguments);
            if (this.isValid() && other.isValid()) {
                return other > this ? this : other;
            } else {
                return createInvalid();
            }
        }
    );

    // Pick a moment m from moments so that m[fn](other) is true for all
    // other. This relies on the function fn to be transitive.
    //
    // moments should either be an array of moment objects or an array, whose
    // first element is an array of moment objects.
    function pickBy(fn, moments) {
        var res, i;
        if (moments.length === 1 && isArray(moments[0])) {
            moments = moments[0];
        }
        if (!moments.length) {
            return createLocal();
        }
        res = moments[0];
        for (i = 1; i < moments.length; ++i) {
            if (!moments[i].isValid() || moments[i][fn](res)) {
                res = moments[i];
            }
        }
        return res;
    }

    // TODO: Use [].sort instead?
    function min () {
        var args = [].slice.call(arguments, 0);

        return pickBy('isBefore', args);
    }

    function max () {
        var args = [].slice.call(arguments, 0);

        return pickBy('isAfter', args);
    }

    var now = function () {
        return Date.now ? Date.now() : +(new Date());
    };

    var ordering = ['year', 'quarter', 'month', 'week', 'day', 'hour', 'minute', 'second', 'millisecond'];

    function isDurationValid(m) {
        for (var key in m) {
            if (!(indexOf.call(ordering, key) !== -1 && (m[key] == null || !isNaN(m[key])))) {
                return false;
            }
        }

        var unitHasDecimal = false;
        for (var i = 0; i < ordering.length; ++i) {
            if (m[ordering[i]]) {
                if (unitHasDecimal) {
                    return false; // only allow non-integers for smallest unit
                }
                if (parseFloat(m[ordering[i]]) !== toInt(m[ordering[i]])) {
                    unitHasDecimal = true;
                }
            }
        }

        return true;
    }

    function isValid$1() {
        return this._isValid;
    }

    function createInvalid$1() {
        return createDuration(NaN);
    }

    function Duration (duration) {
        var normalizedInput = normalizeObjectUnits(duration),
            years = normalizedInput.year || 0,
            quarters = normalizedInput.quarter || 0,
            months = normalizedInput.month || 0,
            weeks = normalizedInput.week || 0,
            days = normalizedInput.day || 0,
            hours = normalizedInput.hour || 0,
            minutes = normalizedInput.minute || 0,
            seconds = normalizedInput.second || 0,
            milliseconds = normalizedInput.millisecond || 0;

        this._isValid = isDurationValid(normalizedInput);

        // representation for dateAddRemove
        this._milliseconds = +milliseconds +
            seconds * 1e3 + // 1000
            minutes * 6e4 + // 1000 * 60
            hours * 1000 * 60 * 60; //using 1000 * 60 * 60 instead of 36e5 to avoid floating point rounding errors https://github.com/moment/moment/issues/2978
        // Because of dateAddRemove treats 24 hours as different from a
        // day when working around DST, we need to store them separately
        this._days = +days +
            weeks * 7;
        // It is impossible to translate months into days without knowing
        // which months you are are talking about, so we have to store
        // it separately.
        this._months = +months +
            quarters * 3 +
            years * 12;

        this._data = {};

        this._locale = getLocale();

        this._bubble();
    }

    function isDuration (obj) {
        return obj instanceof Duration;
    }

    function absRound (number) {
        if (number < 0) {
            return Math.round(-1 * number) * -1;
        } else {
            return Math.round(number);
        }
    }

    // FORMATTING

    function offset (token, separator) {
        addFormatToken(token, 0, 0, function () {
            var offset = this.utcOffset();
            var sign = '+';
            if (offset < 0) {
                offset = -offset;
                sign = '-';
            }
            return sign + zeroFill(~~(offset / 60), 2) + separator + zeroFill(~~(offset) % 60, 2);
        });
    }

    offset('Z', ':');
    offset('ZZ', '');

    // PARSING

    addRegexToken('Z',  matchShortOffset);
    addRegexToken('ZZ', matchShortOffset);
    addParseToken(['Z', 'ZZ'], function (input, array, config) {
        config._useUTC = true;
        config._tzm = offsetFromString(matchShortOffset, input);
    });

    // HELPERS

    // timezone chunker
    // '+10:00' > ['10',  '00']
    // '-1530'  > ['-15', '30']
    var chunkOffset = /([\+\-]|\d\d)/gi;

    function offsetFromString(matcher, string) {
        var matches = (string || '').match(matcher);

        if (matches === null) {
            return null;
        }

        var chunk   = matches[matches.length - 1] || [];
        var parts   = (chunk + '').match(chunkOffset) || ['-', 0, 0];
        var minutes = +(parts[1] * 60) + toInt(parts[2]);

        return minutes === 0 ?
          0 :
          parts[0] === '+' ? minutes : -minutes;
    }

    // Return a moment from input, that is local/utc/zone equivalent to model.
    function cloneWithOffset(input, model) {
        var res, diff;
        if (model._isUTC) {
            res = model.clone();
            diff = (isMoment(input) || isDate(input) ? input.valueOf() : createLocal(input).valueOf()) - res.valueOf();
            // Use low-level api, because this fn is low-level api.
            res._d.setTime(res._d.valueOf() + diff);
            hooks.updateOffset(res, false);
            return res;
        } else {
            return createLocal(input).local();
        }
    }

    function getDateOffset (m) {
        // On Firefox.24 Date#getTimezoneOffset returns a floating point.
        // https://github.com/moment/moment/pull/1871
        return -Math.round(m._d.getTimezoneOffset() / 15) * 15;
    }

    // HOOKS

    // This function will be called whenever a moment is mutated.
    // It is intended to keep the offset in sync with the timezone.
    hooks.updateOffset = function () {};

    // MOMENTS

    // keepLocalTime = true means only change the timezone, without
    // affecting the local hour. So 5:31:26 +0300 --[utcOffset(2, true)]-->
    // 5:31:26 +0200 It is possible that 5:31:26 doesn't exist with offset
    // +0200, so we adjust the time as needed, to be valid.
    //
    // Keeping the time actually adds/subtracts (one hour)
    // from the actual represented time. That is why we call updateOffset
    // a second time. In case it wants us to change the offset again
    // _changeInProgress == true case, then we have to adjust, because
    // there is no such time in the given timezone.
    function getSetOffset (input, keepLocalTime, keepMinutes) {
        var offset = this._offset || 0,
            localAdjust;
        if (!this.isValid()) {
            return input != null ? this : NaN;
        }
        if (input != null) {
            if (typeof input === 'string') {
                input = offsetFromString(matchShortOffset, input);
                if (input === null) {
                    return this;
                }
            } else if (Math.abs(input) < 16 && !keepMinutes) {
                input = input * 60;
            }
            if (!this._isUTC && keepLocalTime) {
                localAdjust = getDateOffset(this);
            }
            this._offset = input;
            this._isUTC = true;
            if (localAdjust != null) {
                this.add(localAdjust, 'm');
            }
            if (offset !== input) {
                if (!keepLocalTime || this._changeInProgress) {
                    addSubtract(this, createDuration(input - offset, 'm'), 1, false);
                } else if (!this._changeInProgress) {
                    this._changeInProgress = true;
                    hooks.updateOffset(this, true);
                    this._changeInProgress = null;
                }
            }
            return this;
        } else {
            return this._isUTC ? offset : getDateOffset(this);
        }
    }

    function getSetZone (input, keepLocalTime) {
        if (input != null) {
            if (typeof input !== 'string') {
                input = -input;
            }

            this.utcOffset(input, keepLocalTime);

            return this;
        } else {
            return -this.utcOffset();
        }
    }

    function setOffsetToUTC (keepLocalTime) {
        return this.utcOffset(0, keepLocalTime);
    }

    function setOffsetToLocal (keepLocalTime) {
        if (this._isUTC) {
            this.utcOffset(0, keepLocalTime);
            this._isUTC = false;

            if (keepLocalTime) {
                this.subtract(getDateOffset(this), 'm');
            }
        }
        return this;
    }

    function setOffsetToParsedOffset () {
        if (this._tzm != null) {
            this.utcOffset(this._tzm, false, true);
        } else if (typeof this._i === 'string') {
            var tZone = offsetFromString(matchOffset, this._i);
            if (tZone != null) {
                this.utcOffset(tZone);
            }
            else {
                this.utcOffset(0, true);
            }
        }
        return this;
    }

    function hasAlignedHourOffset (input) {
        if (!this.isValid()) {
            return false;
        }
        input = input ? createLocal(input).utcOffset() : 0;

        return (this.utcOffset() - input) % 60 === 0;
    }

    function isDaylightSavingTime () {
        return (
            this.utcOffset() > this.clone().month(0).utcOffset() ||
            this.utcOffset() > this.clone().month(5).utcOffset()
        );
    }

    function isDaylightSavingTimeShifted () {
        if (!isUndefined(this._isDSTShifted)) {
            return this._isDSTShifted;
        }

        var c = {};

        copyConfig(c, this);
        c = prepareConfig(c);

        if (c._a) {
            var other = c._isUTC ? createUTC(c._a) : createLocal(c._a);
            this._isDSTShifted = this.isValid() &&
                compareArrays(c._a, other.toArray()) > 0;
        } else {
            this._isDSTShifted = false;
        }

        return this._isDSTShifted;
    }

    function isLocal () {
        return this.isValid() ? !this._isUTC : false;
    }

    function isUtcOffset () {
        return this.isValid() ? this._isUTC : false;
    }

    function isUtc () {
        return this.isValid() ? this._isUTC && this._offset === 0 : false;
    }

    // ASP.NET json date format regex
    var aspNetRegex = /^(\-|\+)?(?:(\d*)[. ])?(\d+)\:(\d+)(?:\:(\d+)(\.\d*)?)?$/;

    // from http://docs.closure-library.googlecode.com/git/closure_goog_date_date.js.source.html
    // somewhat more in line with 4.4.3.2 2004 spec, but allows decimal anywhere
    // and further modified to allow for strings containing both week and day
    var isoRegex = /^(-|\+)?P(?:([-+]?[0-9,.]*)Y)?(?:([-+]?[0-9,.]*)M)?(?:([-+]?[0-9,.]*)W)?(?:([-+]?[0-9,.]*)D)?(?:T(?:([-+]?[0-9,.]*)H)?(?:([-+]?[0-9,.]*)M)?(?:([-+]?[0-9,.]*)S)?)?$/;

    function createDuration (input, key) {
        var duration = input,
            // matching against regexp is expensive, do it on demand
            match = null,
            sign,
            ret,
            diffRes;

        if (isDuration(input)) {
            duration = {
                ms : input._milliseconds,
                d  : input._days,
                M  : input._months
            };
        } else if (isNumber(input)) {
            duration = {};
            if (key) {
                duration[key] = input;
            } else {
                duration.milliseconds = input;
            }
        } else if (!!(match = aspNetRegex.exec(input))) {
            sign = (match[1] === '-') ? -1 : 1;
            duration = {
                y  : 0,
                d  : toInt(match[DATE])                         * sign,
                h  : toInt(match[HOUR])                         * sign,
                m  : toInt(match[MINUTE])                       * sign,
                s  : toInt(match[SECOND])                       * sign,
                ms : toInt(absRound(match[MILLISECOND] * 1000)) * sign // the millisecond decimal point is included in the match
            };
        } else if (!!(match = isoRegex.exec(input))) {
            sign = (match[1] === '-') ? -1 : (match[1] === '+') ? 1 : 1;
            duration = {
                y : parseIso(match[2], sign),
                M : parseIso(match[3], sign),
                w : parseIso(match[4], sign),
                d : parseIso(match[5], sign),
                h : parseIso(match[6], sign),
                m : parseIso(match[7], sign),
                s : parseIso(match[8], sign)
            };
        } else if (duration == null) {// checks for null or undefined
            duration = {};
        } else if (typeof duration === 'object' && ('from' in duration || 'to' in duration)) {
            diffRes = momentsDifference(createLocal(duration.from), createLocal(duration.to));

            duration = {};
            duration.ms = diffRes.milliseconds;
            duration.M = diffRes.months;
        }

        ret = new Duration(duration);

        if (isDuration(input) && hasOwnProp(input, '_locale')) {
            ret._locale = input._locale;
        }

        return ret;
    }

    createDuration.fn = Duration.prototype;
    createDuration.invalid = createInvalid$1;

    function parseIso (inp, sign) {
        // We'd normally use ~~inp for this, but unfortunately it also
        // converts floats to ints.
        // inp may be undefined, so careful calling replace on it.
        var res = inp && parseFloat(inp.replace(',', '.'));
        // apply sign while we're at it
        return (isNaN(res) ? 0 : res) * sign;
    }

    function positiveMomentsDifference(base, other) {
        var res = {milliseconds: 0, months: 0};

        res.months = other.month() - base.month() +
            (other.year() - base.year()) * 12;
        if (base.clone().add(res.months, 'M').isAfter(other)) {
            --res.months;
        }

        res.milliseconds = +other - +(base.clone().add(res.months, 'M'));

        return res;
    }

    function momentsDifference(base, other) {
        var res;
        if (!(base.isValid() && other.isValid())) {
            return {milliseconds: 0, months: 0};
        }

        other = cloneWithOffset(other, base);
        if (base.isBefore(other)) {
            res = positiveMomentsDifference(base, other);
        } else {
            res = positiveMomentsDifference(other, base);
            res.milliseconds = -res.milliseconds;
            res.months = -res.months;
        }

        return res;
    }

    // TODO: remove 'name' arg after deprecation is removed
    function createAdder(direction, name) {
        return function (val, period) {
            var dur, tmp;
            //invert the arguments, but complain about it
            if (period !== null && !isNaN(+period)) {
                deprecateSimple(name, 'moment().' + name  + '(period, number) is deprecated. Please use moment().' + name + '(number, period). ' +
                'See http://momentjs.com/guides/#/warnings/add-inverted-param/ for more info.');
                tmp = val; val = period; period = tmp;
            }

            val = typeof val === 'string' ? +val : val;
            dur = createDuration(val, period);
            addSubtract(this, dur, direction);
            return this;
        };
    }

    function addSubtract (mom, duration, isAdding, updateOffset) {
        var milliseconds = duration._milliseconds,
            days = absRound(duration._days),
            months = absRound(duration._months);

        if (!mom.isValid()) {
            // No op
            return;
        }

        updateOffset = updateOffset == null ? true : updateOffset;

        if (months) {
            setMonth(mom, get(mom, 'Month') + months * isAdding);
        }
        if (days) {
            set$1(mom, 'Date', get(mom, 'Date') + days * isAdding);
        }
        if (milliseconds) {
            mom._d.setTime(mom._d.valueOf() + milliseconds * isAdding);
        }
        if (updateOffset) {
            hooks.updateOffset(mom, days || months);
        }
    }

    var add      = createAdder(1, 'add');
    var subtract = createAdder(-1, 'subtract');

    function getCalendarFormat(myMoment, now) {
        var diff = myMoment.diff(now, 'days', true);
        return diff < -6 ? 'sameElse' :
                diff < -1 ? 'lastWeek' :
                diff < 0 ? 'lastDay' :
                diff < 1 ? 'sameDay' :
                diff < 2 ? 'nextDay' :
                diff < 7 ? 'nextWeek' : 'sameElse';
    }

    function calendar$1 (time, formats) {
        // We want to compare the start of today, vs this.
        // Getting start-of-today depends on whether we're local/utc/offset or not.
        var now = time || createLocal(),
            sod = cloneWithOffset(now, this).startOf('day'),
            format = hooks.calendarFormat(this, sod) || 'sameElse';

        var output = formats && (isFunction(formats[format]) ? formats[format].call(this, now) : formats[format]);

        return this.format(output || this.localeData().calendar(format, this, createLocal(now)));
    }

    function clone () {
        return new Moment(this);
    }

    function isAfter (input, units) {
        var localInput = isMoment(input) ? input : createLocal(input);
        if (!(this.isValid() && localInput.isValid())) {
            return false;
        }
        units = normalizeUnits(!isUndefined(units) ? units : 'millisecond');
        if (units === 'millisecond') {
            return this.valueOf() > localInput.valueOf();
        } else {
            return localInput.valueOf() < this.clone().startOf(units).valueOf();
        }
    }

    function isBefore (input, units) {
        var localInput = isMoment(input) ? input : createLocal(input);
        if (!(this.isValid() && localInput.isValid())) {
            return false;
        }
        units = normalizeUnits(!isUndefined(units) ? units : 'millisecond');
        if (units === 'millisecond') {
            return this.valueOf() < localInput.valueOf();
        } else {
            return this.clone().endOf(units).valueOf() < localInput.valueOf();
        }
    }

    function isBetween (from, to, units, inclusivity) {
        inclusivity = inclusivity || '()';
        return (inclusivity[0] === '(' ? this.isAfter(from, units) : !this.isBefore(from, units)) &&
            (inclusivity[1] === ')' ? this.isBefore(to, units) : !this.isAfter(to, units));
    }

    function isSame (input, units) {
        var localInput = isMoment(input) ? input : createLocal(input),
            inputMs;
        if (!(this.isValid() && localInput.isValid())) {
            return false;
        }
        units = normalizeUnits(units || 'millisecond');
        if (units === 'millisecond') {
            return this.valueOf() === localInput.valueOf();
        } else {
            inputMs = localInput.valueOf();
            return this.clone().startOf(units).valueOf() <= inputMs && inputMs <= this.clone().endOf(units).valueOf();
        }
    }

    function isSameOrAfter (input, units) {
        return this.isSame(input, units) || this.isAfter(input,units);
    }

    function isSameOrBefore (input, units) {
        return this.isSame(input, units) || this.isBefore(input,units);
    }

    function diff (input, units, asFloat) {
        var that,
            zoneDelta,
            output;

        if (!this.isValid()) {
            return NaN;
        }

        that = cloneWithOffset(input, this);

        if (!that.isValid()) {
            return NaN;
        }

        zoneDelta = (that.utcOffset() - this.utcOffset()) * 6e4;

        units = normalizeUnits(units);

        switch (units) {
            case 'year': output = monthDiff(this, that) / 12; break;
            case 'month': output = monthDiff(this, that); break;
            case 'quarter': output = monthDiff(this, that) / 3; break;
            case 'second': output = (this - that) / 1e3; break; // 1000
            case 'minute': output = (this - that) / 6e4; break; // 1000 * 60
            case 'hour': output = (this - that) / 36e5; break; // 1000 * 60 * 60
            case 'day': output = (this - that - zoneDelta) / 864e5; break; // 1000 * 60 * 60 * 24, negate dst
            case 'week': output = (this - that - zoneDelta) / 6048e5; break; // 1000 * 60 * 60 * 24 * 7, negate dst
            default: output = this - that;
        }

        return asFloat ? output : absFloor(output);
    }

    function monthDiff (a, b) {
        // difference in months
        var wholeMonthDiff = ((b.year() - a.year()) * 12) + (b.month() - a.month()),
            // b is in (anchor - 1 month, anchor + 1 month)
            anchor = a.clone().add(wholeMonthDiff, 'months'),
            anchor2, adjust;

        if (b - anchor < 0) {
            anchor2 = a.clone().add(wholeMonthDiff - 1, 'months');
            // linear across the month
            adjust = (b - anchor) / (anchor - anchor2);
        } else {
            anchor2 = a.clone().add(wholeMonthDiff + 1, 'months');
            // linear across the month
            adjust = (b - anchor) / (anchor2 - anchor);
        }

        //check for negative zero, return zero if negative zero
        return -(wholeMonthDiff + adjust) || 0;
    }

    hooks.defaultFormat = 'YYYY-MM-DDTHH:mm:ssZ';
    hooks.defaultFormatUtc = 'YYYY-MM-DDTHH:mm:ss[Z]';

    function toString () {
        return this.clone().locale('en').format('ddd MMM DD YYYY HH:mm:ss [GMT]ZZ');
    }

    function toISOString(keepOffset) {
        if (!this.isValid()) {
            return null;
        }
        var utc = keepOffset !== true;
        var m = utc ? this.clone().utc() : this;
        if (m.year() < 0 || m.year() > 9999) {
            return formatMoment(m, utc ? 'YYYYYY-MM-DD[T]HH:mm:ss.SSS[Z]' : 'YYYYYY-MM-DD[T]HH:mm:ss.SSSZ');
        }
        if (isFunction(Date.prototype.toISOString)) {
            // native implementation is ~50x faster, use it when we can
            if (utc) {
                return this.toDate().toISOString();
            } else {
                return new Date(this.valueOf() + this.utcOffset() * 60 * 1000).toISOString().replace('Z', formatMoment(m, 'Z'));
            }
        }
        return formatMoment(m, utc ? 'YYYY-MM-DD[T]HH:mm:ss.SSS[Z]' : 'YYYY-MM-DD[T]HH:mm:ss.SSSZ');
    }

    /**
     * Return a human readable representation of a moment that can
     * also be evaluated to get a new moment which is the same
     *
     * @link https://nodejs.org/dist/latest/docs/api/util.html#util_custom_inspect_function_on_objects
     */
    function inspect () {
        if (!this.isValid()) {
            return 'moment.invalid(/* ' + this._i + ' */)';
        }
        var func = 'moment';
        var zone = '';
        if (!this.isLocal()) {
            func = this.utcOffset() === 0 ? 'moment.utc' : 'moment.parseZone';
            zone = 'Z';
        }
        var prefix = '[' + func + '("]';
        var year = (0 <= this.year() && this.year() <= 9999) ? 'YYYY' : 'YYYYYY';
        var datetime = '-MM-DD[T]HH:mm:ss.SSS';
        var suffix = zone + '[")]';

        return this.format(prefix + year + datetime + suffix);
    }

    function format (inputString) {
        if (!inputString) {
            inputString = this.isUtc() ? hooks.defaultFormatUtc : hooks.defaultFormat;
        }
        var output = formatMoment(this, inputString);
        return this.localeData().postformat(output);
    }

    function from (time, withoutSuffix) {
        if (this.isValid() &&
                ((isMoment(time) && time.isValid()) ||
                 createLocal(time).isValid())) {
            return createDuration({to: this, from: time}).locale(this.locale()).humanize(!withoutSuffix);
        } else {
            return this.localeData().invalidDate();
        }
    }

    function fromNow (withoutSuffix) {
        return this.from(createLocal(), withoutSuffix);
    }

    function to (time, withoutSuffix) {
        if (this.isValid() &&
                ((isMoment(time) && time.isValid()) ||
                 createLocal(time).isValid())) {
            return createDuration({from: this, to: time}).locale(this.locale()).humanize(!withoutSuffix);
        } else {
            return this.localeData().invalidDate();
        }
    }

    function toNow (withoutSuffix) {
        return this.to(createLocal(), withoutSuffix);
    }

    // If passed a locale key, it will set the locale for this
    // instance.  Otherwise, it will return the locale configuration
    // variables for this instance.
    function locale (key) {
        var newLocaleData;

        if (key === undefined) {
            return this._locale._abbr;
        } else {
            newLocaleData = getLocale(key);
            if (newLocaleData != null) {
                this._locale = newLocaleData;
            }
            return this;
        }
    }

    var lang = deprecate(
        'moment().lang() is deprecated. Instead, use moment().localeData() to get the language configuration. Use moment().locale() to change languages.',
        function (key) {
            if (key === undefined) {
                return this.localeData();
            } else {
                return this.locale(key);
            }
        }
    );

    function localeData () {
        return this._locale;
    }

    function startOf (units) {
        units = normalizeUnits(units);
        // the following switch intentionally omits break keywords
        // to utilize falling through the cases.
        switch (units) {
            case 'year':
                this.month(0);
                /* falls through */
            case 'quarter':
            case 'month':
                this.date(1);
                /* falls through */
            case 'week':
            case 'isoWeek':
            case 'day':
            case 'date':
                this.hours(0);
                /* falls through */
            case 'hour':
                this.minutes(0);
                /* falls through */
            case 'minute':
                this.seconds(0);
                /* falls through */
            case 'second':
                this.milliseconds(0);
        }

        // weeks are a special case
        if (units === 'week') {
            this.weekday(0);
        }
        if (units === 'isoWeek') {
            this.isoWeekday(1);
        }

        // quarters are also special
        if (units === 'quarter') {
            this.month(Math.floor(this.month() / 3) * 3);
        }

        return this;
    }

    function endOf (units) {
        units = normalizeUnits(units);
        if (units === undefined || units === 'millisecond') {
            return this;
        }

        // 'date' is an alias for 'day', so it should be considered as such.
        if (units === 'date') {
            units = 'day';
        }

        return this.startOf(units).add(1, (units === 'isoWeek' ? 'week' : units)).subtract(1, 'ms');
    }

    function valueOf () {
        return this._d.valueOf() - ((this._offset || 0) * 60000);
    }

    function unix () {
        return Math.floor(this.valueOf() / 1000);
    }

    function toDate () {
        return new Date(this.valueOf());
    }

    function toArray () {
        var m = this;
        return [m.year(), m.month(), m.date(), m.hour(), m.minute(), m.second(), m.millisecond()];
    }

    function toObject () {
        var m = this;
        return {
            years: m.year(),
            months: m.month(),
            date: m.date(),
            hours: m.hours(),
            minutes: m.minutes(),
            seconds: m.seconds(),
            milliseconds: m.milliseconds()
        };
    }

    function toJSON () {
        // new Date(NaN).toJSON() === null
        return this.isValid() ? this.toISOString() : null;
    }

    function isValid$2 () {
        return isValid(this);
    }

    function parsingFlags () {
        return extend({}, getParsingFlags(this));
    }

    function invalidAt () {
        return getParsingFlags(this).overflow;
    }

    function creationData() {
        return {
            input: this._i,
            format: this._f,
            locale: this._locale,
            isUTC: this._isUTC,
            strict: this._strict
        };
    }

    // FORMATTING

    addFormatToken(0, ['gg', 2], 0, function () {
        return this.weekYear() % 100;
    });

    addFormatToken(0, ['GG', 2], 0, function () {
        return this.isoWeekYear() % 100;
    });

    function addWeekYearFormatToken (token, getter) {
        addFormatToken(0, [token, token.length], 0, getter);
    }

    addWeekYearFormatToken('gggg',     'weekYear');
    addWeekYearFormatToken('ggggg',    'weekYear');
    addWeekYearFormatToken('GGGG',  'isoWeekYear');
    addWeekYearFormatToken('GGGGG', 'isoWeekYear');

    // ALIASES

    addUnitAlias('weekYear', 'gg');
    addUnitAlias('isoWeekYear', 'GG');

    // PRIORITY

    addUnitPriority('weekYear', 1);
    addUnitPriority('isoWeekYear', 1);


    // PARSING

    addRegexToken('G',      matchSigned);
    addRegexToken('g',      matchSigned);
    addRegexToken('GG',     match1to2, match2);
    addRegexToken('gg',     match1to2, match2);
    addRegexToken('GGGG',   match1to4, match4);
    addRegexToken('gggg',   match1to4, match4);
    addRegexToken('GGGGG',  match1to6, match6);
    addRegexToken('ggggg',  match1to6, match6);

    addWeekParseToken(['gggg', 'ggggg', 'GGGG', 'GGGGG'], function (input, week, config, token) {
        week[token.substr(0, 2)] = toInt(input);
    });

    addWeekParseToken(['gg', 'GG'], function (input, week, config, token) {
        week[token] = hooks.parseTwoDigitYear(input);
    });

    // MOMENTS

    function getSetWeekYear (input) {
        return getSetWeekYearHelper.call(this,
                input,
                this.week(),
                this.weekday(),
                this.localeData()._week.dow,
                this.localeData()._week.doy);
    }

    function getSetISOWeekYear (input) {
        return getSetWeekYearHelper.call(this,
                input, this.isoWeek(), this.isoWeekday(), 1, 4);
    }

    function getISOWeeksInYear () {
        return weeksInYear(this.year(), 1, 4);
    }

    function getWeeksInYear () {
        var weekInfo = this.localeData()._week;
        return weeksInYear(this.year(), weekInfo.dow, weekInfo.doy);
    }

    function getSetWeekYearHelper(input, week, weekday, dow, doy) {
        var weeksTarget;
        if (input == null) {
            return weekOfYear(this, dow, doy).year;
        } else {
            weeksTarget = weeksInYear(input, dow, doy);
            if (week > weeksTarget) {
                week = weeksTarget;
            }
            return setWeekAll.call(this, input, week, weekday, dow, doy);
        }
    }

    function setWeekAll(weekYear, week, weekday, dow, doy) {
        var dayOfYearData = dayOfYearFromWeeks(weekYear, week, weekday, dow, doy),
            date = createUTCDate(dayOfYearData.year, 0, dayOfYearData.dayOfYear);

        this.year(date.getUTCFullYear());
        this.month(date.getUTCMonth());
        this.date(date.getUTCDate());
        return this;
    }

    // FORMATTING

    addFormatToken('Q', 0, 'Qo', 'quarter');

    // ALIASES

    addUnitAlias('quarter', 'Q');

    // PRIORITY

    addUnitPriority('quarter', 7);

    // PARSING

    addRegexToken('Q', match1);
    addParseToken('Q', function (input, array) {
        array[MONTH] = (toInt(input) - 1) * 3;
    });

    // MOMENTS

    function getSetQuarter (input) {
        return input == null ? Math.ceil((this.month() + 1) / 3) : this.month((input - 1) * 3 + this.month() % 3);
    }

    // FORMATTING

    addFormatToken('D', ['DD', 2], 'Do', 'date');

    // ALIASES

    addUnitAlias('date', 'D');

    // PRIORITY
    addUnitPriority('date', 9);

    // PARSING

    addRegexToken('D',  match1to2);
    addRegexToken('DD', match1to2, match2);
    addRegexToken('Do', function (isStrict, locale) {
        // TODO: Remove "ordinalParse" fallback in next major release.
        return isStrict ?
          (locale._dayOfMonthOrdinalParse || locale._ordinalParse) :
          locale._dayOfMonthOrdinalParseLenient;
    });

    addParseToken(['D', 'DD'], DATE);
    addParseToken('Do', function (input, array) {
        array[DATE] = toInt(input.match(match1to2)[0]);
    });

    // MOMENTS

    var getSetDayOfMonth = makeGetSet('Date', true);

    // FORMATTING

    addFormatToken('DDD', ['DDDD', 3], 'DDDo', 'dayOfYear');

    // ALIASES

    addUnitAlias('dayOfYear', 'DDD');

    // PRIORITY
    addUnitPriority('dayOfYear', 4);

    // PARSING

    addRegexToken('DDD',  match1to3);
    addRegexToken('DDDD', match3);
    addParseToken(['DDD', 'DDDD'], function (input, array, config) {
        config._dayOfYear = toInt(input);
    });

    // HELPERS

    // MOMENTS

    function getSetDayOfYear (input) {
        var dayOfYear = Math.round((this.clone().startOf('day') - this.clone().startOf('year')) / 864e5) + 1;
        return input == null ? dayOfYear : this.add((input - dayOfYear), 'd');
    }

    // FORMATTING

    addFormatToken('m', ['mm', 2], 0, 'minute');

    // ALIASES

    addUnitAlias('minute', 'm');

    // PRIORITY

    addUnitPriority('minute', 14);

    // PARSING

    addRegexToken('m',  match1to2);
    addRegexToken('mm', match1to2, match2);
    addParseToken(['m', 'mm'], MINUTE);

    // MOMENTS

    var getSetMinute = makeGetSet('Minutes', false);

    // FORMATTING

    addFormatToken('s', ['ss', 2], 0, 'second');

    // ALIASES

    addUnitAlias('second', 's');

    // PRIORITY

    addUnitPriority('second', 15);

    // PARSING

    addRegexToken('s',  match1to2);
    addRegexToken('ss', match1to2, match2);
    addParseToken(['s', 'ss'], SECOND);

    // MOMENTS

    var getSetSecond = makeGetSet('Seconds', false);

    // FORMATTING

    addFormatToken('S', 0, 0, function () {
        return ~~(this.millisecond() / 100);
    });

    addFormatToken(0, ['SS', 2], 0, function () {
        return ~~(this.millisecond() / 10);
    });

    addFormatToken(0, ['SSS', 3], 0, 'millisecond');
    addFormatToken(0, ['SSSS', 4], 0, function () {
        return this.millisecond() * 10;
    });
    addFormatToken(0, ['SSSSS', 5], 0, function () {
        return this.millisecond() * 100;
    });
    addFormatToken(0, ['SSSSSS', 6], 0, function () {
        return this.millisecond() * 1000;
    });
    addFormatToken(0, ['SSSSSSS', 7], 0, function () {
        return this.millisecond() * 10000;
    });
    addFormatToken(0, ['SSSSSSSS', 8], 0, function () {
        return this.millisecond() * 100000;
    });
    addFormatToken(0, ['SSSSSSSSS', 9], 0, function () {
        return this.millisecond() * 1000000;
    });


    // ALIASES

    addUnitAlias('millisecond', 'ms');

    // PRIORITY

    addUnitPriority('millisecond', 16);

    // PARSING

    addRegexToken('S',    match1to3, match1);
    addRegexToken('SS',   match1to3, match2);
    addRegexToken('SSS',  match1to3, match3);

    var token;
    for (token = 'SSSS'; token.length <= 9; token += 'S') {
        addRegexToken(token, matchUnsigned);
    }

    function parseMs(input, array) {
        array[MILLISECOND] = toInt(('0.' + input) * 1000);
    }

    for (token = 'S'; token.length <= 9; token += 'S') {
        addParseToken(token, parseMs);
    }
    // MOMENTS

    var getSetMillisecond = makeGetSet('Milliseconds', false);

    // FORMATTING

    addFormatToken('z',  0, 0, 'zoneAbbr');
    addFormatToken('zz', 0, 0, 'zoneName');

    // MOMENTS

    function getZoneAbbr () {
        return this._isUTC ? 'UTC' : '';
    }

    function getZoneName () {
        return this._isUTC ? 'Coordinated Universal Time' : '';
    }

    var proto = Moment.prototype;

    proto.add               = add;
    proto.calendar          = calendar$1;
    proto.clone             = clone;
    proto.diff              = diff;
    proto.endOf             = endOf;
    proto.format            = format;
    proto.from              = from;
    proto.fromNow           = fromNow;
    proto.to                = to;
    proto.toNow             = toNow;
    proto.get               = stringGet;
    proto.invalidAt         = invalidAt;
    proto.isAfter           = isAfter;
    proto.isBefore          = isBefore;
    proto.isBetween         = isBetween;
    proto.isSame            = isSame;
    proto.isSameOrAfter     = isSameOrAfter;
    proto.isSameOrBefore    = isSameOrBefore;
    proto.isValid           = isValid$2;
    proto.lang              = lang;
    proto.locale            = locale;
    proto.localeData        = localeData;
    proto.max               = prototypeMax;
    proto.min               = prototypeMin;
    proto.parsingFlags      = parsingFlags;
    proto.set               = stringSet;
    proto.startOf           = startOf;
    proto.subtract          = subtract;
    proto.toArray           = toArray;
    proto.toObject          = toObject;
    proto.toDate            = toDate;
    proto.toISOString       = toISOString;
    proto.inspect           = inspect;
    proto.toJSON            = toJSON;
    proto.toString          = toString;
    proto.unix              = unix;
    proto.valueOf           = valueOf;
    proto.creationData      = creationData;
    proto.year       = getSetYear;
    proto.isLeapYear = getIsLeapYear;
    proto.weekYear    = getSetWeekYear;
    proto.isoWeekYear = getSetISOWeekYear;
    proto.quarter = proto.quarters = getSetQuarter;
    proto.month       = getSetMonth;
    proto.daysInMonth = getDaysInMonth;
    proto.week           = proto.weeks        = getSetWeek;
    proto.isoWeek        = proto.isoWeeks     = getSetISOWeek;
    proto.weeksInYear    = getWeeksInYear;
    proto.isoWeeksInYear = getISOWeeksInYear;
    proto.date       = getSetDayOfMonth;
    proto.day        = proto.days             = getSetDayOfWeek;
    proto.weekday    = getSetLocaleDayOfWeek;
    proto.isoWeekday = getSetISODayOfWeek;
    proto.dayOfYear  = getSetDayOfYear;
    proto.hour = proto.hours = getSetHour;
    proto.minute = proto.minutes = getSetMinute;
    proto.second = proto.seconds = getSetSecond;
    proto.millisecond = proto.milliseconds = getSetMillisecond;
    proto.utcOffset            = getSetOffset;
    proto.utc                  = setOffsetToUTC;
    proto.local                = setOffsetToLocal;
    proto.parseZone            = setOffsetToParsedOffset;
    proto.hasAlignedHourOffset = hasAlignedHourOffset;
    proto.isDST                = isDaylightSavingTime;
    proto.isLocal              = isLocal;
    proto.isUtcOffset          = isUtcOffset;
    proto.isUtc                = isUtc;
    proto.isUTC                = isUtc;
    proto.zoneAbbr = getZoneAbbr;
    proto.zoneName = getZoneName;
    proto.dates  = deprecate('dates accessor is deprecated. Use date instead.', getSetDayOfMonth);
    proto.months = deprecate('months accessor is deprecated. Use month instead', getSetMonth);
    proto.years  = deprecate('years accessor is deprecated. Use year instead', getSetYear);
    proto.zone   = deprecate('moment().zone is deprecated, use moment().utcOffset instead. http://momentjs.com/guides/#/warnings/zone/', getSetZone);
    proto.isDSTShifted = deprecate('isDSTShifted is deprecated. See http://momentjs.com/guides/#/warnings/dst-shifted/ for more information', isDaylightSavingTimeShifted);

    function createUnix (input) {
        return createLocal(input * 1000);
    }

    function createInZone () {
        return createLocal.apply(null, arguments).parseZone();
    }

    function preParsePostFormat (string) {
        return string;
    }

    var proto$1 = Locale.prototype;

    proto$1.calendar        = calendar;
    proto$1.longDateFormat  = longDateFormat;
    proto$1.invalidDate     = invalidDate;
    proto$1.ordinal         = ordinal;
    proto$1.preparse        = preParsePostFormat;
    proto$1.postformat      = preParsePostFormat;
    proto$1.relativeTime    = relativeTime;
    proto$1.pastFuture      = pastFuture;
    proto$1.set             = set;

    proto$1.months            =        localeMonths;
    proto$1.monthsShort       =        localeMonthsShort;
    proto$1.monthsParse       =        localeMonthsParse;
    proto$1.monthsRegex       = monthsRegex;
    proto$1.monthsShortRegex  = monthsShortRegex;
    proto$1.week = localeWeek;
    proto$1.firstDayOfYear = localeFirstDayOfYear;
    proto$1.firstDayOfWeek = localeFirstDayOfWeek;

    proto$1.weekdays       =        localeWeekdays;
    proto$1.weekdaysMin    =        localeWeekdaysMin;
    proto$1.weekdaysShort  =        localeWeekdaysShort;
    proto$1.weekdaysParse  =        localeWeekdaysParse;

    proto$1.weekdaysRegex       =        weekdaysRegex;
    proto$1.weekdaysShortRegex  =        weekdaysShortRegex;
    proto$1.weekdaysMinRegex    =        weekdaysMinRegex;

    proto$1.isPM = localeIsPM;
    proto$1.meridiem = localeMeridiem;

    function get$1 (format, index, field, setter) {
        var locale = getLocale();
        var utc = createUTC().set(setter, index);
        return locale[field](utc, format);
    }

    function listMonthsImpl (format, index, field) {
        if (isNumber(format)) {
            index = format;
            format = undefined;
        }

        format = format || '';

        if (index != null) {
            return get$1(format, index, field, 'month');
        }

        var i;
        var out = [];
        for (i = 0; i < 12; i++) {
            out[i] = get$1(format, i, field, 'month');
        }
        return out;
    }

    // ()
    // (5)
    // (fmt, 5)
    // (fmt)
    // (true)
    // (true, 5)
    // (true, fmt, 5)
    // (true, fmt)
    function listWeekdaysImpl (localeSorted, format, index, field) {
        if (typeof localeSorted === 'boolean') {
            if (isNumber(format)) {
                index = format;
                format = undefined;
            }

            format = format || '';
        } else {
            format = localeSorted;
            index = format;
            localeSorted = false;

            if (isNumber(format)) {
                index = format;
                format = undefined;
            }

            format = format || '';
        }

        var locale = getLocale(),
            shift = localeSorted ? locale._week.dow : 0;

        if (index != null) {
            return get$1(format, (index + shift) % 7, field, 'day');
        }

        var i;
        var out = [];
        for (i = 0; i < 7; i++) {
            out[i] = get$1(format, (i + shift) % 7, field, 'day');
        }
        return out;
    }

    function listMonths (format, index) {
        return listMonthsImpl(format, index, 'months');
    }

    function listMonthsShort (format, index) {
        return listMonthsImpl(format, index, 'monthsShort');
    }

    function listWeekdays (localeSorted, format, index) {
        return listWeekdaysImpl(localeSorted, format, index, 'weekdays');
    }

    function listWeekdaysShort (localeSorted, format, index) {
        return listWeekdaysImpl(localeSorted, format, index, 'weekdaysShort');
    }

    function listWeekdaysMin (localeSorted, format, index) {
        return listWeekdaysImpl(localeSorted, format, index, 'weekdaysMin');
    }

    getSetGlobalLocale('en', {
        dayOfMonthOrdinalParse: /\d{1,2}(th|st|nd|rd)/,
        ordinal : function (number) {
            var b = number % 10,
                output = (toInt(number % 100 / 10) === 1) ? 'th' :
                (b === 1) ? 'st' :
                (b === 2) ? 'nd' :
                (b === 3) ? 'rd' : 'th';
            return number + output;
        }
    });

    // Side effect imports

    hooks.lang = deprecate('moment.lang is deprecated. Use moment.locale instead.', getSetGlobalLocale);
    hooks.langData = deprecate('moment.langData is deprecated. Use moment.localeData instead.', getLocale);

    var mathAbs = Math.abs;

    function abs () {
        var data           = this._data;

        this._milliseconds = mathAbs(this._milliseconds);
        this._days         = mathAbs(this._days);
        this._months       = mathAbs(this._months);

        data.milliseconds  = mathAbs(data.milliseconds);
        data.seconds       = mathAbs(data.seconds);
        data.minutes       = mathAbs(data.minutes);
        data.hours         = mathAbs(data.hours);
        data.months        = mathAbs(data.months);
        data.years         = mathAbs(data.years);

        return this;
    }

    function addSubtract$1 (duration, input, value, direction) {
        var other = createDuration(input, value);

        duration._milliseconds += direction * other._milliseconds;
        duration._days         += direction * other._days;
        duration._months       += direction * other._months;

        return duration._bubble();
    }

    // supports only 2.0-style add(1, 's') or add(duration)
    function add$1 (input, value) {
        return addSubtract$1(this, input, value, 1);
    }

    // supports only 2.0-style subtract(1, 's') or subtract(duration)
    function subtract$1 (input, value) {
        return addSubtract$1(this, input, value, -1);
    }

    function absCeil (number) {
        if (number < 0) {
            return Math.floor(number);
        } else {
            return Math.ceil(number);
        }
    }

    function bubble () {
        var milliseconds = this._milliseconds;
        var days         = this._days;
        var months       = this._months;
        var data         = this._data;
        var seconds, minutes, hours, years, monthsFromDays;

        // if we have a mix of positive and negative values, bubble down first
        // check: https://github.com/moment/moment/issues/2166
        if (!((milliseconds >= 0 && days >= 0 && months >= 0) ||
                (milliseconds <= 0 && days <= 0 && months <= 0))) {
            milliseconds += absCeil(monthsToDays(months) + days) * 864e5;
            days = 0;
            months = 0;
        }

        // The following code bubbles up values, see the tests for
        // examples of what that means.
        data.milliseconds = milliseconds % 1000;

        seconds           = absFloor(milliseconds / 1000);
        data.seconds      = seconds % 60;

        minutes           = absFloor(seconds / 60);
        data.minutes      = minutes % 60;

        hours             = absFloor(minutes / 60);
        data.hours        = hours % 24;

        days += absFloor(hours / 24);

        // convert days to months
        monthsFromDays = absFloor(daysToMonths(days));
        months += monthsFromDays;
        days -= absCeil(monthsToDays(monthsFromDays));

        // 12 months -> 1 year
        years = absFloor(months / 12);
        months %= 12;

        data.days   = days;
        data.months = months;
        data.years  = years;

        return this;
    }

    function daysToMonths (days) {
        // 400 years have 146097 days (taking into account leap year rules)
        // 400 years have 12 months === 4800
        return days * 4800 / 146097;
    }

    function monthsToDays (months) {
        // the reverse of daysToMonths
        return months * 146097 / 4800;
    }

    function as (units) {
        if (!this.isValid()) {
            return NaN;
        }
        var days;
        var months;
        var milliseconds = this._milliseconds;

        units = normalizeUnits(units);

        if (units === 'month' || units === 'year') {
            days   = this._days   + milliseconds / 864e5;
            months = this._months + daysToMonths(days);
            return units === 'month' ? months : months / 12;
        } else {
            // handle milliseconds separately because of floating point math errors (issue #1867)
            days = this._days + Math.round(monthsToDays(this._months));
            switch (units) {
                case 'week'   : return days / 7     + milliseconds / 6048e5;
                case 'day'    : return days         + milliseconds / 864e5;
                case 'hour'   : return days * 24    + milliseconds / 36e5;
                case 'minute' : return days * 1440  + milliseconds / 6e4;
                case 'second' : return days * 86400 + milliseconds / 1000;
                // Math.floor prevents floating point math errors here
                case 'millisecond': return Math.floor(days * 864e5) + milliseconds;
                default: throw new Error('Unknown unit ' + units);
            }
        }
    }

    // TODO: Use this.as('ms')?
    function valueOf$1 () {
        if (!this.isValid()) {
            return NaN;
        }
        return (
            this._milliseconds +
            this._days * 864e5 +
            (this._months % 12) * 2592e6 +
            toInt(this._months / 12) * 31536e6
        );
    }

    function makeAs (alias) {
        return function () {
            return this.as(alias);
        };
    }

    var asMilliseconds = makeAs('ms');
    var asSeconds      = makeAs('s');
    var asMinutes      = makeAs('m');
    var asHours        = makeAs('h');
    var asDays         = makeAs('d');
    var asWeeks        = makeAs('w');
    var asMonths       = makeAs('M');
    var asYears        = makeAs('y');

    function clone$1 () {
        return createDuration(this);
    }

    function get$2 (units) {
        units = normalizeUnits(units);
        return this.isValid() ? this[units + 's']() : NaN;
    }

    function makeGetter(name) {
        return function () {
            return this.isValid() ? this._data[name] : NaN;
        };
    }

    var milliseconds = makeGetter('milliseconds');
    var seconds      = makeGetter('seconds');
    var minutes      = makeGetter('minutes');
    var hours        = makeGetter('hours');
    var days         = makeGetter('days');
    var months       = makeGetter('months');
    var years        = makeGetter('years');

    function weeks () {
        return absFloor(this.days() / 7);
    }

    var round = Math.round;
    var thresholds = {
        ss: 44,         // a few seconds to seconds
        s : 45,         // seconds to minute
        m : 45,         // minutes to hour
        h : 22,         // hours to day
        d : 26,         // days to month
        M : 11          // months to year
    };

    // helper function for moment.fn.from, moment.fn.fromNow, and moment.duration.fn.humanize
    function substituteTimeAgo(string, number, withoutSuffix, isFuture, locale) {
        return locale.relativeTime(number || 1, !!withoutSuffix, string, isFuture);
    }

    function relativeTime$1 (posNegDuration, withoutSuffix, locale) {
        var duration = createDuration(posNegDuration).abs();
        var seconds  = round(duration.as('s'));
        var minutes  = round(duration.as('m'));
        var hours    = round(duration.as('h'));
        var days     = round(duration.as('d'));
        var months   = round(duration.as('M'));
        var years    = round(duration.as('y'));

        var a = seconds <= thresholds.ss && ['s', seconds]  ||
                seconds < thresholds.s   && ['ss', seconds] ||
                minutes <= 1             && ['m']           ||
                minutes < thresholds.m   && ['mm', minutes] ||
                hours   <= 1             && ['h']           ||
                hours   < thresholds.h   && ['hh', hours]   ||
                days    <= 1             && ['d']           ||
                days    < thresholds.d   && ['dd', days]    ||
                months  <= 1             && ['M']           ||
                months  < thresholds.M   && ['MM', months]  ||
                years   <= 1             && ['y']           || ['yy', years];

        a[2] = withoutSuffix;
        a[3] = +posNegDuration > 0;
        a[4] = locale;
        return substituteTimeAgo.apply(null, a);
    }

    // This function allows you to set the rounding function for relative time strings
    function getSetRelativeTimeRounding (roundingFunction) {
        if (roundingFunction === undefined) {
            return round;
        }
        if (typeof(roundingFunction) === 'function') {
            round = roundingFunction;
            return true;
        }
        return false;
    }

    // This function allows you to set a threshold for relative time strings
    function getSetRelativeTimeThreshold (threshold, limit) {
        if (thresholds[threshold] === undefined) {
            return false;
        }
        if (limit === undefined) {
            return thresholds[threshold];
        }
        thresholds[threshold] = limit;
        if (threshold === 's') {
            thresholds.ss = limit - 1;
        }
        return true;
    }

    function humanize (withSuffix) {
        if (!this.isValid()) {
            return this.localeData().invalidDate();
        }

        var locale = this.localeData();
        var output = relativeTime$1(this, !withSuffix, locale);

        if (withSuffix) {
            output = locale.pastFuture(+this, output);
        }

        return locale.postformat(output);
    }

    var abs$1 = Math.abs;

    function sign(x) {
        return ((x > 0) - (x < 0)) || +x;
    }

    function toISOString$1() {
        // for ISO strings we do not use the normal bubbling rules:
        //  * milliseconds bubble up until they become hours
        //  * days do not bubble at all
        //  * months bubble up until they become years
        // This is because there is no context-free conversion between hours and days
        // (think of clock changes)
        // and also not between days and months (28-31 days per month)
        if (!this.isValid()) {
            return this.localeData().invalidDate();
        }

        var seconds = abs$1(this._milliseconds) / 1000;
        var days         = abs$1(this._days);
        var months       = abs$1(this._months);
        var minutes, hours, years;

        // 3600 seconds -> 60 minutes -> 1 hour
        minutes           = absFloor(seconds / 60);
        hours             = absFloor(minutes / 60);
        seconds %= 60;
        minutes %= 60;

        // 12 months -> 1 year
        years  = absFloor(months / 12);
        months %= 12;


        // inspired by https://github.com/dordille/moment-isoduration/blob/master/moment.isoduration.js
        var Y = years;
        var M = months;
        var D = days;
        var h = hours;
        var m = minutes;
        var s = seconds ? seconds.toFixed(3).replace(/\.?0+$/, '') : '';
        var total = this.asSeconds();

        if (!total) {
            // this is the same as C#'s (Noda) and python (isodate)...
            // but not other JS (goog.date)
            return 'P0D';
        }

        var totalSign = total < 0 ? '-' : '';
        var ymSign = sign(this._months) !== sign(total) ? '-' : '';
        var daysSign = sign(this._days) !== sign(total) ? '-' : '';
        var hmsSign = sign(this._milliseconds) !== sign(total) ? '-' : '';

        return totalSign + 'P' +
            (Y ? ymSign + Y + 'Y' : '') +
            (M ? ymSign + M + 'M' : '') +
            (D ? daysSign + D + 'D' : '') +
            ((h || m || s) ? 'T' : '') +
            (h ? hmsSign + h + 'H' : '') +
            (m ? hmsSign + m + 'M' : '') +
            (s ? hmsSign + s + 'S' : '');
    }

    var proto$2 = Duration.prototype;

    proto$2.isValid        = isValid$1;
    proto$2.abs            = abs;
    proto$2.add            = add$1;
    proto$2.subtract       = subtract$1;
    proto$2.as             = as;
    proto$2.asMilliseconds = asMilliseconds;
    proto$2.asSeconds      = asSeconds;
    proto$2.asMinutes      = asMinutes;
    proto$2.asHours        = asHours;
    proto$2.asDays         = asDays;
    proto$2.asWeeks        = asWeeks;
    proto$2.asMonths       = asMonths;
    proto$2.asYears        = asYears;
    proto$2.valueOf        = valueOf$1;
    proto$2._bubble        = bubble;
    proto$2.clone          = clone$1;
    proto$2.get            = get$2;
    proto$2.milliseconds   = milliseconds;
    proto$2.seconds        = seconds;
    proto$2.minutes        = minutes;
    proto$2.hours          = hours;
    proto$2.days           = days;
    proto$2.weeks          = weeks;
    proto$2.months         = months;
    proto$2.years          = years;
    proto$2.humanize       = humanize;
    proto$2.toISOString    = toISOString$1;
    proto$2.toString       = toISOString$1;
    proto$2.toJSON         = toISOString$1;
    proto$2.locale         = locale;
    proto$2.localeData     = localeData;

    proto$2.toIsoString = deprecate('toIsoString() is deprecated. Please use toISOString() instead (notice the capitals)', toISOString$1);
    proto$2.lang = lang;

    // Side effect imports

    // FORMATTING

    addFormatToken('X', 0, 0, 'unix');
    addFormatToken('x', 0, 0, 'valueOf');

    // PARSING

    addRegexToken('x', matchSigned);
    addRegexToken('X', matchTimestamp);
    addParseToken('X', function (input, array, config) {
        config._d = new Date(parseFloat(input, 10) * 1000);
    });
    addParseToken('x', function (input, array, config) {
        config._d = new Date(toInt(input));
    });

    // Side effect imports


    hooks.version = '2.22.2';

    setHookCallback(createLocal);

    hooks.fn                    = proto;
    hooks.min                   = min;
    hooks.max                   = max;
    hooks.now                   = now;
    hooks.utc                   = createUTC;
    hooks.unix                  = createUnix;
    hooks.months                = listMonths;
    hooks.isDate                = isDate;
    hooks.locale                = getSetGlobalLocale;
    hooks.invalid               = createInvalid;
    hooks.duration              = createDuration;
    hooks.isMoment              = isMoment;
    hooks.weekdays              = listWeekdays;
    hooks.parseZone             = createInZone;
    hooks.localeData            = getLocale;
    hooks.isDuration            = isDuration;
    hooks.monthsShort           = listMonthsShort;
    hooks.weekdaysMin           = listWeekdaysMin;
    hooks.defineLocale          = defineLocale;
    hooks.updateLocale          = updateLocale;
    hooks.locales               = listLocales;
    hooks.weekdaysShort         = listWeekdaysShort;
    hooks.normalizeUnits        = normalizeUnits;
    hooks.relativeTimeRounding  = getSetRelativeTimeRounding;
    hooks.relativeTimeThreshold = getSetRelativeTimeThreshold;
    hooks.calendarFormat        = getCalendarFormat;
    hooks.prototype             = proto;

    // currently HTML5 input type only supports 24-hour formats
    hooks.HTML5_FMT = {
        DATETIME_LOCAL: 'YYYY-MM-DDTHH:mm',             // <input type="datetime-local" />
        DATETIME_LOCAL_SECONDS: 'YYYY-MM-DDTHH:mm:ss',  // <input type="datetime-local" step="1" />
        DATETIME_LOCAL_MS: 'YYYY-MM-DDTHH:mm:ss.SSS',   // <input type="datetime-local" step="0.001" />
        DATE: 'YYYY-MM-DD',                             // <input type="date" />
        TIME: 'HH:mm',                                  // <input type="time" />
        TIME_SECONDS: 'HH:mm:ss',                       // <input type="time" step="1" />
        TIME_MS: 'HH:mm:ss.SSS',                        // <input type="time" step="0.001" />
        WEEK: 'YYYY-[W]WW',                             // <input type="week" />
        MONTH: 'YYYY-MM'                                // <input type="month" />
    };

    return hooks;

})));

},{}],31:[function(require,module,exports){
'use strict';

var range; // Create a range object for efficently rendering strings to elements.
var NS_XHTML = 'http://www.w3.org/1999/xhtml';

var doc = typeof document === 'undefined' ? undefined : document;

var testEl = doc ?
    doc.body || doc.createElement('div') :
    {};

// Fixes <https://github.com/patrick-steele-idem/morphdom/issues/32>
// (IE7+ support) <=IE7 does not support el.hasAttribute(name)
var actualHasAttributeNS;

if (testEl.hasAttributeNS) {
    actualHasAttributeNS = function(el, namespaceURI, name) {
        return el.hasAttributeNS(namespaceURI, name);
    };
} else if (testEl.hasAttribute) {
    actualHasAttributeNS = function(el, namespaceURI, name) {
        return el.hasAttribute(name);
    };
} else {
    actualHasAttributeNS = function(el, namespaceURI, name) {
        return el.getAttributeNode(namespaceURI, name) != null;
    };
}

var hasAttributeNS = actualHasAttributeNS;


function toElement(str) {
    if (!range && doc.createRange) {
        range = doc.createRange();
        range.selectNode(doc.body);
    }

    var fragment;
    if (range && range.createContextualFragment) {
        fragment = range.createContextualFragment(str);
    } else {
        fragment = doc.createElement('body');
        fragment.innerHTML = str;
    }
    return fragment.childNodes[0];
}

/**
 * Returns true if two node's names are the same.
 *
 * NOTE: We don't bother checking `namespaceURI` because you will never find two HTML elements with the same
 *       nodeName and different namespace URIs.
 *
 * @param {Element} a
 * @param {Element} b The target element
 * @return {boolean}
 */
function compareNodeNames(fromEl, toEl) {
    var fromNodeName = fromEl.nodeName;
    var toNodeName = toEl.nodeName;

    if (fromNodeName === toNodeName) {
        return true;
    }

    if (toEl.actualize &&
        fromNodeName.charCodeAt(0) < 91 && /* from tag name is upper case */
        toNodeName.charCodeAt(0) > 90 /* target tag name is lower case */) {
        // If the target element is a virtual DOM node then we may need to normalize the tag name
        // before comparing. Normal HTML elements that are in the "http://www.w3.org/1999/xhtml"
        // are converted to upper case
        return fromNodeName === toNodeName.toUpperCase();
    } else {
        return false;
    }
}

/**
 * Create an element, optionally with a known namespace URI.
 *
 * @param {string} name the element name, e.g. 'div' or 'svg'
 * @param {string} [namespaceURI] the element's namespace URI, i.e. the value of
 * its `xmlns` attribute or its inferred namespace.
 *
 * @return {Element}
 */
function createElementNS(name, namespaceURI) {
    return !namespaceURI || namespaceURI === NS_XHTML ?
        doc.createElement(name) :
        doc.createElementNS(namespaceURI, name);
}

/**
 * Copies the children of one DOM element to another DOM element
 */
function moveChildren(fromEl, toEl) {
    var curChild = fromEl.firstChild;
    while (curChild) {
        var nextChild = curChild.nextSibling;
        toEl.appendChild(curChild);
        curChild = nextChild;
    }
    return toEl;
}

function morphAttrs(fromNode, toNode) {
    var attrs = toNode.attributes;
    var i;
    var attr;
    var attrName;
    var attrNamespaceURI;
    var attrValue;
    var fromValue;

    for (i = attrs.length - 1; i >= 0; --i) {
        attr = attrs[i];
        attrName = attr.name;
        attrNamespaceURI = attr.namespaceURI;
        attrValue = attr.value;

        if (attrNamespaceURI) {
            attrName = attr.localName || attrName;
            fromValue = fromNode.getAttributeNS(attrNamespaceURI, attrName);

            if (fromValue !== attrValue) {
                fromNode.setAttributeNS(attrNamespaceURI, attrName, attrValue);
            }
        } else {
            fromValue = fromNode.getAttribute(attrName);

            if (fromValue !== attrValue) {
                fromNode.setAttribute(attrName, attrValue);
            }
        }
    }

    // Remove any extra attributes found on the original DOM element that
    // weren't found on the target element.
    attrs = fromNode.attributes;

    for (i = attrs.length - 1; i >= 0; --i) {
        attr = attrs[i];
        if (attr.specified !== false) {
            attrName = attr.name;
            attrNamespaceURI = attr.namespaceURI;

            if (attrNamespaceURI) {
                attrName = attr.localName || attrName;

                if (!hasAttributeNS(toNode, attrNamespaceURI, attrName)) {
                    fromNode.removeAttributeNS(attrNamespaceURI, attrName);
                }
            } else {
                if (!hasAttributeNS(toNode, null, attrName)) {
                    fromNode.removeAttribute(attrName);
                }
            }
        }
    }
}

function syncBooleanAttrProp(fromEl, toEl, name) {
    if (fromEl[name] !== toEl[name]) {
        fromEl[name] = toEl[name];
        if (fromEl[name]) {
            fromEl.setAttribute(name, '');
        } else {
            fromEl.removeAttribute(name, '');
        }
    }
}

var specialElHandlers = {
    /**
     * Needed for IE. Apparently IE doesn't think that "selected" is an
     * attribute when reading over the attributes using selectEl.attributes
     */
    OPTION: function(fromEl, toEl) {
        syncBooleanAttrProp(fromEl, toEl, 'selected');
    },
    /**
     * The "value" attribute is special for the <input> element since it sets
     * the initial value. Changing the "value" attribute without changing the
     * "value" property will have no effect since it is only used to the set the
     * initial value.  Similar for the "checked" attribute, and "disabled".
     */
    INPUT: function(fromEl, toEl) {
        syncBooleanAttrProp(fromEl, toEl, 'checked');
        syncBooleanAttrProp(fromEl, toEl, 'disabled');

        if (fromEl.value !== toEl.value) {
            fromEl.value = toEl.value;
        }

        if (!hasAttributeNS(toEl, null, 'value')) {
            fromEl.removeAttribute('value');
        }
    },

    TEXTAREA: function(fromEl, toEl) {
        var newValue = toEl.value;
        if (fromEl.value !== newValue) {
            fromEl.value = newValue;
        }

        var firstChild = fromEl.firstChild;
        if (firstChild) {
            // Needed for IE. Apparently IE sets the placeholder as the
            // node value and vise versa. This ignores an empty update.
            var oldValue = firstChild.nodeValue;

            if (oldValue == newValue || (!newValue && oldValue == fromEl.placeholder)) {
                return;
            }

            firstChild.nodeValue = newValue;
        }
    },
    SELECT: function(fromEl, toEl) {
        if (!hasAttributeNS(toEl, null, 'multiple')) {
            var selectedIndex = -1;
            var i = 0;
            var curChild = toEl.firstChild;
            while(curChild) {
                var nodeName = curChild.nodeName;
                if (nodeName && nodeName.toUpperCase() === 'OPTION') {
                    if (hasAttributeNS(curChild, null, 'selected')) {
                        selectedIndex = i;
                        break;
                    }
                    i++;
                }
                curChild = curChild.nextSibling;
            }

            fromEl.selectedIndex = i;
        }
    }
};

var ELEMENT_NODE = 1;
var TEXT_NODE = 3;
var COMMENT_NODE = 8;

function noop() {}

function defaultGetNodeKey(node) {
    return node.id;
}

function morphdomFactory(morphAttrs) {

    return function morphdom(fromNode, toNode, options) {
        if (!options) {
            options = {};
        }

        if (typeof toNode === 'string') {
            if (fromNode.nodeName === '#document' || fromNode.nodeName === 'HTML') {
                var toNodeHtml = toNode;
                toNode = doc.createElement('html');
                toNode.innerHTML = toNodeHtml;
            } else {
                toNode = toElement(toNode);
            }
        }

        var getNodeKey = options.getNodeKey || defaultGetNodeKey;
        var onBeforeNodeAdded = options.onBeforeNodeAdded || noop;
        var onNodeAdded = options.onNodeAdded || noop;
        var onBeforeElUpdated = options.onBeforeElUpdated || noop;
        var onElUpdated = options.onElUpdated || noop;
        var onBeforeNodeDiscarded = options.onBeforeNodeDiscarded || noop;
        var onNodeDiscarded = options.onNodeDiscarded || noop;
        var onBeforeElChildrenUpdated = options.onBeforeElChildrenUpdated || noop;
        var childrenOnly = options.childrenOnly === true;

        // This object is used as a lookup to quickly find all keyed elements in the original DOM tree.
        var fromNodesLookup = {};
        var keyedRemovalList;

        function addKeyedRemoval(key) {
            if (keyedRemovalList) {
                keyedRemovalList.push(key);
            } else {
                keyedRemovalList = [key];
            }
        }

        function walkDiscardedChildNodes(node, skipKeyedNodes) {
            if (node.nodeType === ELEMENT_NODE) {
                var curChild = node.firstChild;
                while (curChild) {

                    var key = undefined;

                    if (skipKeyedNodes && (key = getNodeKey(curChild))) {
                        // If we are skipping keyed nodes then we add the key
                        // to a list so that it can be handled at the very end.
                        addKeyedRemoval(key);
                    } else {
                        // Only report the node as discarded if it is not keyed. We do this because
                        // at the end we loop through all keyed elements that were unmatched
                        // and then discard them in one final pass.
                        onNodeDiscarded(curChild);
                        if (curChild.firstChild) {
                            walkDiscardedChildNodes(curChild, skipKeyedNodes);
                        }
                    }

                    curChild = curChild.nextSibling;
                }
            }
        }

        /**
         * Removes a DOM node out of the original DOM
         *
         * @param  {Node} node The node to remove
         * @param  {Node} parentNode The nodes parent
         * @param  {Boolean} skipKeyedNodes If true then elements with keys will be skipped and not discarded.
         * @return {undefined}
         */
        function removeNode(node, parentNode, skipKeyedNodes) {
            if (onBeforeNodeDiscarded(node) === false) {
                return;
            }

            if (parentNode) {
                parentNode.removeChild(node);
            }

            onNodeDiscarded(node);
            walkDiscardedChildNodes(node, skipKeyedNodes);
        }

        // // TreeWalker implementation is no faster, but keeping this around in case this changes in the future
        // function indexTree(root) {
        //     var treeWalker = document.createTreeWalker(
        //         root,
        //         NodeFilter.SHOW_ELEMENT);
        //
        //     var el;
        //     while((el = treeWalker.nextNode())) {
        //         var key = getNodeKey(el);
        //         if (key) {
        //             fromNodesLookup[key] = el;
        //         }
        //     }
        // }

        // // NodeIterator implementation is no faster, but keeping this around in case this changes in the future
        //
        // function indexTree(node) {
        //     var nodeIterator = document.createNodeIterator(node, NodeFilter.SHOW_ELEMENT);
        //     var el;
        //     while((el = nodeIterator.nextNode())) {
        //         var key = getNodeKey(el);
        //         if (key) {
        //             fromNodesLookup[key] = el;
        //         }
        //     }
        // }

        function indexTree(node) {
            if (node.nodeType === ELEMENT_NODE) {
                var curChild = node.firstChild;
                while (curChild) {
                    var key = getNodeKey(curChild);
                    if (key) {
                        fromNodesLookup[key] = curChild;
                    }

                    // Walk recursively
                    indexTree(curChild);

                    curChild = curChild.nextSibling;
                }
            }
        }

        indexTree(fromNode);

        function handleNodeAdded(el) {
            onNodeAdded(el);

            var curChild = el.firstChild;
            while (curChild) {
                var nextSibling = curChild.nextSibling;

                var key = getNodeKey(curChild);
                if (key) {
                    var unmatchedFromEl = fromNodesLookup[key];
                    if (unmatchedFromEl && compareNodeNames(curChild, unmatchedFromEl)) {
                        curChild.parentNode.replaceChild(unmatchedFromEl, curChild);
                        morphEl(unmatchedFromEl, curChild);
                    }
                }

                handleNodeAdded(curChild);
                curChild = nextSibling;
            }
        }

        function morphEl(fromEl, toEl, childrenOnly) {
            var toElKey = getNodeKey(toEl);
            var curFromNodeKey;

            if (toElKey) {
                // If an element with an ID is being morphed then it is will be in the final
                // DOM so clear it out of the saved elements collection
                delete fromNodesLookup[toElKey];
            }

            if (toNode.isSameNode && toNode.isSameNode(fromNode)) {
                return;
            }

            if (!childrenOnly) {
                if (onBeforeElUpdated(fromEl, toEl) === false) {
                    return;
                }

                morphAttrs(fromEl, toEl);
                onElUpdated(fromEl);

                if (onBeforeElChildrenUpdated(fromEl, toEl) === false) {
                    return;
                }
            }

            if (fromEl.nodeName !== 'TEXTAREA') {
                var curToNodeChild = toEl.firstChild;
                var curFromNodeChild = fromEl.firstChild;
                var curToNodeKey;

                var fromNextSibling;
                var toNextSibling;
                var matchingFromEl;

                outer: while (curToNodeChild) {
                    toNextSibling = curToNodeChild.nextSibling;
                    curToNodeKey = getNodeKey(curToNodeChild);

                    while (curFromNodeChild) {
                        fromNextSibling = curFromNodeChild.nextSibling;

                        if (curToNodeChild.isSameNode && curToNodeChild.isSameNode(curFromNodeChild)) {
                            curToNodeChild = toNextSibling;
                            curFromNodeChild = fromNextSibling;
                            continue outer;
                        }

                        curFromNodeKey = getNodeKey(curFromNodeChild);

                        var curFromNodeType = curFromNodeChild.nodeType;

                        var isCompatible = undefined;

                        if (curFromNodeType === curToNodeChild.nodeType) {
                            if (curFromNodeType === ELEMENT_NODE) {
                                // Both nodes being compared are Element nodes

                                if (curToNodeKey) {
                                    // The target node has a key so we want to match it up with the correct element
                                    // in the original DOM tree
                                    if (curToNodeKey !== curFromNodeKey) {
                                        // The current element in the original DOM tree does not have a matching key so
                                        // let's check our lookup to see if there is a matching element in the original
                                        // DOM tree
                                        if ((matchingFromEl = fromNodesLookup[curToNodeKey])) {
                                            if (curFromNodeChild.nextSibling === matchingFromEl) {
                                                // Special case for single element removals. To avoid removing the original
                                                // DOM node out of the tree (since that can break CSS transitions, etc.),
                                                // we will instead discard the current node and wait until the next
                                                // iteration to properly match up the keyed target element with its matching
                                                // element in the original tree
                                                isCompatible = false;
                                            } else {
                                                // We found a matching keyed element somewhere in the original DOM tree.
                                                // Let's moving the original DOM node into the current position and morph
                                                // it.

                                                // NOTE: We use insertBefore instead of replaceChild because we want to go through
                                                // the `removeNode()` function for the node that is being discarded so that
                                                // all lifecycle hooks are correctly invoked
                                                fromEl.insertBefore(matchingFromEl, curFromNodeChild);

                                                fromNextSibling = curFromNodeChild.nextSibling;

                                                if (curFromNodeKey) {
                                                    // Since the node is keyed it might be matched up later so we defer
                                                    // the actual removal to later
                                                    addKeyedRemoval(curFromNodeKey);
                                                } else {
                                                    // NOTE: we skip nested keyed nodes from being removed since there is
                                                    //       still a chance they will be matched up later
                                                    removeNode(curFromNodeChild, fromEl, true /* skip keyed nodes */);
                                                }

                                                curFromNodeChild = matchingFromEl;
                                            }
                                        } else {
                                            // The nodes are not compatible since the "to" node has a key and there
                                            // is no matching keyed node in the source tree
                                            isCompatible = false;
                                        }
                                    }
                                } else if (curFromNodeKey) {
                                    // The original has a key
                                    isCompatible = false;
                                }

                                isCompatible = isCompatible !== false && compareNodeNames(curFromNodeChild, curToNodeChild);
                                if (isCompatible) {
                                    // We found compatible DOM elements so transform
                                    // the current "from" node to match the current
                                    // target DOM node.
                                    morphEl(curFromNodeChild, curToNodeChild);
                                }

                            } else if (curFromNodeType === TEXT_NODE || curFromNodeType == COMMENT_NODE) {
                                // Both nodes being compared are Text or Comment nodes
                                isCompatible = true;
                                // Simply update nodeValue on the original node to
                                // change the text value
                                if (curFromNodeChild.nodeValue !== curToNodeChild.nodeValue) {
                                    curFromNodeChild.nodeValue = curToNodeChild.nodeValue;
                                }

                            }
                        }

                        if (isCompatible) {
                            // Advance both the "to" child and the "from" child since we found a match
                            curToNodeChild = toNextSibling;
                            curFromNodeChild = fromNextSibling;
                            continue outer;
                        }

                        // No compatible match so remove the old node from the DOM and continue trying to find a
                        // match in the original DOM. However, we only do this if the from node is not keyed
                        // since it is possible that a keyed node might match up with a node somewhere else in the
                        // target tree and we don't want to discard it just yet since it still might find a
                        // home in the final DOM tree. After everything is done we will remove any keyed nodes
                        // that didn't find a home
                        if (curFromNodeKey) {
                            // Since the node is keyed it might be matched up later so we defer
                            // the actual removal to later
                            addKeyedRemoval(curFromNodeKey);
                        } else {
                            // NOTE: we skip nested keyed nodes from being removed since there is
                            //       still a chance they will be matched up later
                            removeNode(curFromNodeChild, fromEl, true /* skip keyed nodes */);
                        }

                        curFromNodeChild = fromNextSibling;
                    }

                    // If we got this far then we did not find a candidate match for
                    // our "to node" and we exhausted all of the children "from"
                    // nodes. Therefore, we will just append the current "to" node
                    // to the end
                    if (curToNodeKey && (matchingFromEl = fromNodesLookup[curToNodeKey]) && compareNodeNames(matchingFromEl, curToNodeChild)) {
                        fromEl.appendChild(matchingFromEl);
                        morphEl(matchingFromEl, curToNodeChild);
                    } else {
                        var onBeforeNodeAddedResult = onBeforeNodeAdded(curToNodeChild);
                        if (onBeforeNodeAddedResult !== false) {
                            if (onBeforeNodeAddedResult) {
                                curToNodeChild = onBeforeNodeAddedResult;
                            }

                            if (curToNodeChild.actualize) {
                                curToNodeChild = curToNodeChild.actualize(fromEl.ownerDocument || doc);
                            }
                            fromEl.appendChild(curToNodeChild);
                            handleNodeAdded(curToNodeChild);
                        }
                    }

                    curToNodeChild = toNextSibling;
                    curFromNodeChild = fromNextSibling;
                }

                // We have processed all of the "to nodes". If curFromNodeChild is
                // non-null then we still have some from nodes left over that need
                // to be removed
                while (curFromNodeChild) {
                    fromNextSibling = curFromNodeChild.nextSibling;
                    if ((curFromNodeKey = getNodeKey(curFromNodeChild))) {
                        // Since the node is keyed it might be matched up later so we defer
                        // the actual removal to later
                        addKeyedRemoval(curFromNodeKey);
                    } else {
                        // NOTE: we skip nested keyed nodes from being removed since there is
                        //       still a chance they will be matched up later
                        removeNode(curFromNodeChild, fromEl, true /* skip keyed nodes */);
                    }
                    curFromNodeChild = fromNextSibling;
                }
            }

            var specialElHandler = specialElHandlers[fromEl.nodeName];
            if (specialElHandler) {
                specialElHandler(fromEl, toEl);
            }
        } // END: morphEl(...)

        var morphedNode = fromNode;
        var morphedNodeType = morphedNode.nodeType;
        var toNodeType = toNode.nodeType;

        if (!childrenOnly) {
            // Handle the case where we are given two DOM nodes that are not
            // compatible (e.g. <div> --> <span> or <div> --> TEXT)
            if (morphedNodeType === ELEMENT_NODE) {
                if (toNodeType === ELEMENT_NODE) {
                    if (!compareNodeNames(fromNode, toNode)) {
                        onNodeDiscarded(fromNode);
                        morphedNode = moveChildren(fromNode, createElementNS(toNode.nodeName, toNode.namespaceURI));
                    }
                } else {
                    // Going from an element node to a text node
                    morphedNode = toNode;
                }
            } else if (morphedNodeType === TEXT_NODE || morphedNodeType === COMMENT_NODE) { // Text or comment node
                if (toNodeType === morphedNodeType) {
                    if (morphedNode.nodeValue !== toNode.nodeValue) {
                        morphedNode.nodeValue = toNode.nodeValue;
                    }

                    return morphedNode;
                } else {
                    // Text node to something else
                    morphedNode = toNode;
                }
            }
        }

        if (morphedNode === toNode) {
            // The "to node" was not compatible with the "from node" so we had to
            // toss out the "from node" and use the "to node"
            onNodeDiscarded(fromNode);
        } else {
            morphEl(morphedNode, toNode, childrenOnly);

            // We now need to loop over any keyed nodes that might need to be
            // removed. We only do the removal if we know that the keyed node
            // never found a match. When a keyed node is matched up we remove
            // it out of fromNodesLookup and we use fromNodesLookup to determine
            // if a keyed node has been matched up or not
            if (keyedRemovalList) {
                for (var i=0, len=keyedRemovalList.length; i<len; i++) {
                    var elToRemove = fromNodesLookup[keyedRemovalList[i]];
                    if (elToRemove) {
                        removeNode(elToRemove, elToRemove.parentNode, false);
                    }
                }
            }
        }

        if (!childrenOnly && morphedNode !== fromNode && fromNode.parentNode) {
            if (morphedNode.actualize) {
                morphedNode = morphedNode.actualize(fromNode.ownerDocument || doc);
            }
            // If we had to swap out the from node with a new node because the old
            // node was not compatible with the target node then we need to
            // replace the old DOM node in the original DOM tree. This is only
            // possible if the original DOM node was part of a DOM tree which
            // we know is the case if it has a parent node.
            fromNode.parentNode.replaceChild(morphedNode, fromNode);
        }

        return morphedNode;
    };
}

var morphdom = morphdomFactory(morphAttrs);

module.exports = morphdom;

},{}],32:[function(require,module,exports){
/* global MutationObserver */
var document = require('global/document')
var window = require('global/window')
var assert = require('assert')
var watch = Object.create(null)
var KEY_ID = 'onloadid' + (new Date() % 9e6).toString(36)
var KEY_ATTR = 'data-' + KEY_ID
var INDEX = 0

if (window && window.MutationObserver) {
  var observer = new MutationObserver(function (mutations) {
    if (Object.keys(watch).length < 1) return
    for (var i = 0; i < mutations.length; i++) {
      if (mutations[i].attributeName === KEY_ATTR) {
        eachAttr(mutations[i], turnon, turnoff)
        continue
      }
      eachMutation(mutations[i].removedNodes, turnoff)
      eachMutation(mutations[i].addedNodes, turnon)
    }
  })
  if (document.body) {
    beginObserve(observer)
  } else {
    document.addEventListener('DOMContentLoaded', function (event) {
      beginObserve(observer)
    })
  }
}

function beginObserve (observer) {
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeOldValue: true,
    attributeFilter: [KEY_ATTR]
  })
}

module.exports = function onload (el, on, off, caller) {
  assert(document.body, 'on-load: will not work prior to DOMContentLoaded')
  on = on || function () {}
  off = off || function () {}
  el.setAttribute(KEY_ATTR, 'o' + INDEX)
  watch['o' + INDEX] = [on, off, 0, caller || onload.caller]
  INDEX += 1
  return el
}

module.exports.KEY_ATTR = KEY_ATTR
module.exports.KEY_ID = KEY_ID

function turnon (index, el) {
  if (watch[index][0] && watch[index][2] === 0) {
    watch[index][0](el)
    watch[index][2] = 1
  }
}

function turnoff (index, el) {
  if (watch[index][1] && watch[index][2] === 1) {
    watch[index][1](el)
    watch[index][2] = 0
  }
}

function eachAttr (mutation, on, off) {
  var newValue = mutation.target.getAttribute(KEY_ATTR)
  if (sameOrigin(mutation.oldValue, newValue)) {
    watch[newValue] = watch[mutation.oldValue]
    return
  }
  if (watch[mutation.oldValue]) {
    off(mutation.oldValue, mutation.target)
  }
  if (watch[newValue]) {
    on(newValue, mutation.target)
  }
}

function sameOrigin (oldValue, newValue) {
  if (!oldValue || !newValue) return false
  return watch[oldValue][3] === watch[newValue][3]
}

function eachMutation (nodes, fn) {
  var keys = Object.keys(watch)
  for (var i = 0; i < nodes.length; i++) {
    if (nodes[i] && nodes[i].getAttribute && nodes[i].getAttribute(KEY_ATTR)) {
      var onloadid = nodes[i].getAttribute(KEY_ATTR)
      keys.forEach(function (k) {
        if (onloadid === k) {
          fn(k, nodes[i])
        }
      })
    }
    if (nodes[i].childNodes.length > 0) {
      eachMutation(nodes[i].childNodes, fn)
    }
  }
}

},{"assert":undefined,"global/document":23,"global/window":24}],33:[function(require,module,exports){
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
},{"url":undefined}],34:[function(require,module,exports){
module.exports.exportAPI = require('./lib/export-api')
module.exports.importAPI = require('./lib/import-api')
},{"./lib/export-api":35,"./lib/import-api":36}],35:[function(require,module,exports){
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
},{"../../../../node_modules/is-buffer/index.js":43,"./util":37,"electron":undefined,"events":undefined,"stream":undefined}],36:[function(require,module,exports){
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

},{"./util":37,"electron":undefined,"events":undefined,"stream":undefined}],37:[function(require,module,exports){
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
},{"buffer":undefined,"duplexer":22}],38:[function(require,module,exports){

const WORD_BOUNDARY_REGEX = /[^a-z0-9-]/i

exports.findWordBoundary = function findWordBoundary (str, index) {
  // corner cases
  if (index < 0 || index >= str.length) return {start: index, end: index}

  // find end
  // fairly simple: slice the string from our index and run search
  var end = str.slice(index).search(WORD_BOUNDARY_REGEX) + index
  if (end === index - 1) end = str.length

  // find start
  // slightly more complex: iterate our search, slicing along, until we pass the index
  var start = 0
  while (start < index) {
    let i = str.slice(start).search(WORD_BOUNDARY_REGEX) + start
    if (i > index || i === (start - 1)) break
    start = i + 1
  }

  return {start, end}
}
},{}],39:[function(require,module,exports){
(function (Buffer){

module.exports = function prettyHash (buf) {
  if (Buffer.isBuffer(buf)) buf = buf.toString('hex')
  if (typeof buf === 'string' && buf.length > 8) {
    return buf.slice(0, 6) + '..' + buf.slice(-2)
  }
  return buf
}
}).call(this,{"isBuffer":require("../../../node_modules/is-buffer/index.js")})
},{"../../../node_modules/is-buffer/index.js":43}],40:[function(require,module,exports){
var bel = require('bel') // turns template tag into DOM elements
var morphdom = require('morphdom') // efficiently diffs + morphs two DOM elements
var defaultEvents = require('./update-events.js') // default events to be copied when dom elements update

module.exports = bel

// TODO move this + defaultEvents to a new module once we receive more feedback
module.exports.update = function (fromNode, toNode, opts) {
  if (!opts) opts = {}
  if (opts.events !== false) {
    if (!opts.onBeforeElUpdated) opts.onBeforeElUpdated = copier
  }

  return morphdom(fromNode, toNode, opts)

  // morphdom only copies attributes. we decided we also wanted to copy events
  // that can be set via attributes
  function copier (f, t) {
    // copy events:
    var events = opts.events || defaultEvents
    for (var i = 0; i < events.length; i++) {
      var ev = events[i]
      if (t[ev]) { // if new element has a whitelisted attribute
        f[ev] = t[ev] // update existing element
      } else if (f[ev]) { // if existing element has it and new one doesnt
        f[ev] = undefined // remove it from existing element
      }
    }
    var oldValue = f.value
    var newValue = t.value
    // copy values for form elements
    if ((f.nodeName === 'INPUT' && f.type !== 'file') || f.nodeName === 'SELECT') {
      if (!newValue && !t.hasAttribute('value')) {
        t.value = f.value
      } else if (newValue !== oldValue) {
        f.value = newValue
      }
    } else if (f.nodeName === 'TEXTAREA') {
      if (t.getAttribute('value') === null) f.value = t.value
    }
  }
}

},{"./update-events.js":41,"bel":20,"morphdom":31}],41:[function(require,module,exports){
module.exports = [
  // attribute events (can be set with attributes)
  'onclick',
  'ondblclick',
  'onmousedown',
  'onmouseup',
  'onmouseover',
  'onmousemove',
  'onmouseout',
  'ondragstart',
  'ondrag',
  'ondragenter',
  'ondragleave',
  'ondragover',
  'ondrop',
  'ondragend',
  'onkeydown',
  'onkeypress',
  'onkeyup',
  'onunload',
  'onabort',
  'onerror',
  'onresize',
  'onscroll',
  'onselect',
  'onchange',
  'onsubmit',
  'onreset',
  'onfocus',
  'onblur',
  'oninput',
  // other common events
  'oncontextmenu',
  'onfocusin',
  'onfocusout'
]

},{}],42:[function(require,module,exports){

},{}],43:[function(require,module,exports){
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
