(function () {'use strict';

function _interopDefault (ex) { return (ex && (typeof ex === 'object') && 'default' in ex) ? ex['default'] : ex; }

var beakerCore = require('@beaker/core');
var electron = require('electron');
var debug = _interopDefault(require('debug'));
var fs = _interopDefault(require('fs'));
var concat = _interopDefault(require('concat-stream'));
var path = require('path');
var path__default = _interopDefault(path);
var util = require('util');
var rpc = require('pauls-electron-rpc');
var electronUpdater = require('electron-updater');
var os = _interopDefault(require('os'));
var slugify = _interopDefault(require('slugify'));
var jetpack = _interopDefault(require('fs-jetpack'));
var emitStream = _interopDefault(require('emit-stream'));
var EventEmitter = _interopDefault(require('events'));
var electronLocalshortcut = require('electron-localshortcut');
var debounce = _interopDefault(require('lodash.debounce'));
var _flattenDeep = _interopDefault(require('lodash.flattendeep'));
var mime = _interopDefault(require('mime'));
var unusedFilename = _interopDefault(require('unused-filename'));
var speedometer = _interopDefault(require('speedometer'));
var parseDataURL = _interopDefault(require('data-urls'));
var _get = _interopDefault(require('lodash.get'));
var pda = _interopDefault(require('pauls-dat-api'));
var prettyHash = _interopDefault(require('pretty-hash'));
var _beaker_core_lib_strings = require('@beaker/core/lib/strings');
var beakerErrorConstants = require('beaker-error-constants');
var _beaker_core_lib_const = require('@beaker/core/lib/const');
var crypto = _interopDefault(require('crypto'));
var https = _interopDefault(require('https'));
var querystring = _interopDefault(require('querystring'));
var ms = _interopDefault(require('ms'));
var osName = _interopDefault(require('os-name'));
var errorPage = _interopDefault(require('@beaker/core/lib/error-page'));
var url = _interopDefault(require('url'));
var once = _interopDefault(require('once'));
var intoStream = _interopDefault(require('into-stream'));
var ICO = _interopDefault(require('icojs'));

var logFilePath;
var logFileWriteStream;

function setup$1 () {
  if (beakerCore.getEnvVar('DEBUG')) {
    return // abort, user is capturing debug to the console
  }

  let folderPath = beakerCore.getEnvVar('BEAKER_USER_DATA_PATH') || electron.app.getPath('userData');
  logFilePath = path.join(folderPath, 'debug.log');
  console.log('Logfile:', logFilePath);
  debug.enable('dat,datgc,dat-dns,dat-serve,dns-discovery,discovery-channel,discovery-swarm,beaker,beaker-sqlite,beaker-analytics');
  debug.overrideUseColors();

  logFileWriteStream = fs.createWriteStream(logFilePath);
  logFileWriteStream.write(util.format('Log started at %s\n', new Date()));
  debug.useColors = () => false;
  debug.log = (...args) => logFileWriteStream.write(util.format(...args) + '\n');
  logFileWriteStream.on('error', e => {
    console.log('Failed to open debug.log', e);
  });
}



function getLogFileContent (start, end) {
  start = start || 0;
  end = end || 10e5;
  return new Promise(resolve => fs.createReadStream(logFilePath, {start, end}).pipe(concat({encoding: 'string'}, resolve)))
}

function defaultBrowsingSessionState () {
  return {
    windows: [ defaultWindowState() ],
    cleanExit: true
  }
}

function defaultWindowState () {
  // HACK
  // for some reason, electron.screen comes back null sometimes
  // not sure why, shouldn't be happening
  // check for existence for now, see #690
  // -prf
  const screen$$1 = require('electron').screen;
  var bounds = screen$$1 ? screen$$1.getPrimaryDisplay().bounds : {width: 800, height: 600};
  var width = Math.max(800, Math.min(1800, bounds.width - 50));
  var height = Math.max(600, Math.min(1200, bounds.height - 50));
  var minWidth = 400;
  var minHeight = 300;
  return {
    x: (bounds.width - width) / 2,
    y: (bounds.height - height) / 2,
    width,
    height,
    minWidth,
    minHeight,
    pages: defaultPageState()
  }
}

function defaultPageState () {
  return [ 'beaker://start' ]
}

const SNAPSHOT_PATH = 'shell-window-state.json';

// exported api
// =

class SessionWatcher {
  static get emptySnapshot () {
    return {
      windows: [],
      // We set this to false by default and clean this up when the session
      // exits. If we ever open up a snapshot and this isn't cleaned up assume
      // there was a crash
      cleanExit: false
    }
  }

  constructor (userDataDir) {
    this.userDataDir = userDataDir;
    this.snapshot = SessionWatcher.emptySnapshot;
    this.recording = true;
  }

  startRecording () { this.recording = true; }
  stopRecording () { this.recording = false; }

  watchWindow (win, initialState) {
    let state = initialState;
    this.snapshot.windows.push(state);
    let watcher = new WindowWatcher(win, initialState);

    watcher.on('change', (nextState) => {
      if (this.recording) {
        let { windows } = this.snapshot;
        let i = windows.indexOf(state);
        state = windows[i] = nextState;
        this.writeSnapshot();
      }
    });

    watcher.on('remove', () => {
      if (this.recording) {
        let { windows } = this.snapshot;
        let i = windows.indexOf(state);
        this.snapshot.windows = windows.splice(1, i);
        this.writeSnapshot();
      }
      watcher.removeAllListeners();
    });
  }

  exit () {
    this.snapshot.cleanExit = true;
    this.writeSnapshot();
  }

  writeSnapshot () {
    this.userDataDir.write(SNAPSHOT_PATH, this.snapshot, { atomic: true });
  }
}

// internal methods
// =

class WindowWatcher extends EventEmitter {
  constructor (win, initialState) {
    super();
    this.handleClosed = this.handleClosed.bind(this);
    this.handlePagesUpdated = this.handlePagesUpdated.bind(this);
    this.handlePositionChange = this.handlePositionChange.bind(this);

    // right now this class trusts that the initial state is correctly formed by this point
    this.snapshot = initialState;
    this.winId = win.id;
    win.on('closed', this.handleClosed);
    win.on('resize', debounce(this.handlePositionChange, 1000));
    win.on('moved', this.handlePositionChange);
    electron.ipcMain.on('shell-window:pages-updated', this.handlePagesUpdated);
  }

  getWindow () {
    return electron.BrowserWindow.fromId(this.winId)
  }

  // handlers

  handleClosed () {
    electron.ipcMain.removeListener('shell-window:pages-updated', this.handlePagesUpdated);
    this.emit('remove');
  }

  handlePagesUpdated ({ sender }, pages) {
    if (sender === this.getWindow().webContents) {
      this.snapshot.pages = (pages && pages.length) ? pages : defaultPageState();
      this.emit('change', this.snapshot);
    }
  }

  handlePositionChange () {
    Object.assign(this.snapshot, getCurrentPosition(this.getWindow()));
    this.emit('change', this.snapshot);
  }
}

function getCurrentPosition (win) {
  var position = win.getPosition();
  var size = win.getSize();
  return {
    x: position[0],
    y: position[1],
    width: size[0],
    height: size[1]
  }
}

// exported APIs
// =

function setup$5 () {
  setApplicationMenu();

  // watch for changes to the window's
  electron.ipcMain.on('shell-window:set-current-location', (e, url$$1) => {
    // check if this is the currently focused window
    const fwin = electron.BrowserWindow.getFocusedWindow();
    if (!url$$1 || !fwin || e.sender !== fwin.webContents) {
      return
    }

    // rebuild as needed
    if (requiresRebuild(url$$1)) {
      setApplicationMenu({url: url$$1});
    }
  });

  // watch for changes to the currently active window
  electron.app.on('browser-window-focus', async (e, win) => {
    try {
      // fetch the current url
      const url$$1 = await win.webContents.executeJavaScript(`pages.getActive().getIntendedURL()`);

      // rebuild as needed
      if (requiresRebuild(url$$1)) {
        setApplicationMenu({url: url$$1});
      }
    } catch (e) {
      // `pages` not set yet
    }
  });
}

function setApplicationMenu (opts = {}) {
  electron.Menu.setApplicationMenu(electron.Menu.buildFromTemplate(buildWindowMenu(opts)));
}

function buildWindowMenu (opts = {}) {
  const isDat = opts.url && opts.url.startsWith('dat://');

  var darwinMenu = {
    label: 'Beaker',
    submenu: [
      {
        label: 'Preferences',
        accelerator: 'Command+,',
        click (item, win) {
          if (win) win.webContents.send('command', 'file:new-tab', 'beaker://settings');
        }
      },
      { type: 'separator' },
      { label: 'Services', role: 'services', submenu: [] },
      { type: 'separator' },
      { label: 'Hide Beaker', accelerator: 'Command+H', role: 'hide' },
      { label: 'Hide Others', accelerator: 'Command+Alt+H', role: 'hideothers' },
      { label: 'Show All', role: 'unhide' },
      { type: 'separator' },
      { label: 'Quit', accelerator: 'Command+Q', click () { electron.app.quit(); }, reserved: true }
    ]
  };

  var fileMenu = {
    label: 'File',
    submenu: [
      {
        label: 'New Tab',
        accelerator: 'CmdOrCtrl+T',
        click: function (item, win) {
          if (win) win.webContents.send('command', 'file:new-tab');
          else createShellWindow();
        },
        reserved: true
      },
      {
        label: 'New Window',
        accelerator: 'CmdOrCtrl+N',
        click: function () { createShellWindow(); },
        reserved: true
      },
      {
        label: 'Reopen Closed Tab',
        accelerator: 'CmdOrCtrl+Shift+T',
        click: function (item, win) {
          if (win) win.webContents.send('command', 'file:reopen-closed-tab');
        },
        reserved: true
      },
      {
        label: 'Open File',
        accelerator: 'CmdOrCtrl+O',
        click: function (item, win) {
          if (win) {
            electron.dialog.showOpenDialog({ title: 'Open file...', properties: ['openFile', 'createDirectory'] }, files => {
              if (files && files[0]) { win.webContents.send('command', 'file:new-tab', 'file://' + files[0]); }
            });
          }
        }
      },
      {
        label: 'Open Location',
        accelerator: 'CmdOrCtrl+L',
        click: function (item, win) {
          if (win) win.webContents.send('command', 'file:open-location');
        }
      },
      {
        label: 'Save Page As...',
        accelerator: 'CmdOrCtrl+S',
        click: async (item, win) => {
          const url$$1 = await win.webContents.executeJavaScript(`pages.getActive().getIntendedURL()`);
          win.webContents.downloadURL(url$$1, true);
        }
      },
      { type: 'separator' },
      {
        label: 'Close Window',
        accelerator: 'CmdOrCtrl+Shift+W',
        click: function (item, win) {
          if (win) win.close();
        },
        reserved: true
      },
      {
        label: 'Close Tab',
        accelerator: 'CmdOrCtrl+W',
        click: function (item, win) {
          if (win) {
            // a regular browser window
            win.webContents.send('command', 'file:close-tab');
          } else {
            // devtools
            let wc = getFocusedDevToolsHost();
            if (wc) {
              wc.closeDevTools();
            }
          }
        },
        reserved: true
      }
    ]
  };

  var editMenu = {
    label: 'Edit',
    submenu: [
      { label: 'Undo', accelerator: 'CmdOrCtrl+Z', selector: 'undo:', reserved: true },
      { label: 'Redo', accelerator: 'Shift+CmdOrCtrl+Z', selector: 'redo:', reserved: true },
      { type: 'separator' },
      { label: 'Cut', accelerator: 'CmdOrCtrl+X', selector: 'cut:', reserved: true },
      { label: 'Copy', accelerator: 'CmdOrCtrl+C', selector: 'copy:', reserved: true },
      { label: 'Paste', accelerator: 'CmdOrCtrl+V', selector: 'paste:', reserved: true },
      { label: 'Select All', accelerator: 'CmdOrCtrl+A', selector: 'selectAll:' },
      {
        label: 'Find in Page',
        accelerator: 'CmdOrCtrl+F',
        click: function (item, win) {
          if (win) win.webContents.send('command', 'edit:find');
        }
      },
      {
        label: 'Find Next',
        accelerator: 'CmdOrCtrl+G',
        click: function (item, win) {
          if (win) win.webContents.send('command', 'edit:find-next');
        }
      },
      {
        label: 'Find Previous',
        accelerator: 'Shift+CmdOrCtrl+G',
        click: function (item, win) {
          if (win) win.webContents.send('command', 'edit:find-previous');
        }
      }
    ]
  };

  var viewMenu = {
    label: 'View',
    submenu: [{
      label: 'Reload',
      accelerator: 'CmdOrCtrl+R',
      click: function (item, win) {
        if (win) win.webContents.send('command', 'view:reload');
      },
      reserved: true
    },
      {
        label: 'Hard Reload (Clear Cache)',
        accelerator: 'CmdOrCtrl+Shift+R',
        click: function (item, win) {
          // HACK
          // this is *super* lazy but it works
          // clear all dat-dns cache on hard reload, to make sure the next
          // load is fresh
          // -prf
          beakerCore.dat.dns.flushCache();

          if (win) win.webContents.send('command', 'view:hard-reload');
        },
        reserved: true
      },
    { type: 'separator' },
      {
        label: 'Zoom In',
        accelerator: 'CmdOrCtrl+Plus',
        click: function (item, win) {
          if (win) win.webContents.send('command', 'view:zoom-in');
        }
      },
      {
        label: 'Zoom Out',
        accelerator: 'CmdOrCtrl+-',
        click: function (item, win) {
          if (win) win.webContents.send('command', 'view:zoom-out');
        }
      },
      {
        label: 'Actual Size',
        accelerator: 'CmdOrCtrl+0',
        click: function (item, win) {
          if (win) win.webContents.send('command', 'view:zoom-reset');
        }
      },
    { type: 'separator' },
      {
        type: 'submenu',
        label: 'Advanced Tools',
        submenu: [{
          label: 'Reload Shell-Window',
          accelerator: 'CmdOrCtrl+alt+shift+R',
          click: function () {
            electron.BrowserWindow.getFocusedWindow().webContents.reloadIgnoringCache();
          }
        }, {
          label: 'Toggle Shell-Window DevTools',
          accelerator: 'CmdOrCtrl+alt+shift+I',
          click: function () {
            electron.BrowserWindow.getFocusedWindow().toggleDevTools();
          }
        },
      { type: 'separator' },
          {
            label: 'Open Archives Debug Page',
            click: function (item, win) {
              if (win) win.webContents.send('command', 'file:new-tab', 'beaker://internal-archives/');
            }
          }, {
            label: 'Open Dat-DNS Cache Page',
            click: function (item, win) {
              if (win) win.webContents.send('command', 'file:new-tab', 'beaker://dat-dns-cache/');
            }
          }, {
            label: 'Open Debug Log Page',
            click: function (item, win) {
              if (win) win.webContents.send('command', 'file:new-tab', 'beaker://debug-log/');
            }
          }]
      },
      {
        label: 'Toggle DevTools',
        accelerator: (process.platform === 'darwin') ? 'Alt+CmdOrCtrl+I' : 'Shift+CmdOrCtrl+I',
        click: function (item, win) {
          if (win) win.webContents.send('command', 'view:toggle-dev-tools');
        },
        reserved: true
      },
      {
        label: 'Toggle Javascript Console',
        accelerator: (process.platform === 'darwin') ? 'Alt+CmdOrCtrl+J' : 'Shift+CmdOrCtrl+J',
        click: function (item, win) {
          if (win) win.webContents.send('command', 'view:toggle-javascript-console');
        },
        reserved: true
      },
      {
        label: 'Toggle Live Reloading',
        enabled: !!isDat,
        click: function (item, win) {
          if (win) win.webContents.send('command', 'view:toggle-live-reloading');
        }
      }]
  };

  var showHistoryAccelerator = 'Ctrl+h';

  if (process.platform === 'darwin') {
    showHistoryAccelerator = 'Cmd+y';
  }

  var historyMenu = {
    label: 'History',
    role: 'history',
    submenu: [
      {
        label: 'Back',
        accelerator: 'CmdOrCtrl+Left',
        click: function (item, win) {
          if (win) win.webContents.send('command', 'history:back');
        }
      },
      {
        label: 'Forward',
        accelerator: 'CmdOrCtrl+Right',
        click: function (item, win) {
          if (win) win.webContents.send('command', 'history:forward');
        }
      },
      {
        label: 'Show Full History',
        accelerator: showHistoryAccelerator,
        click: function (item, win) {
          if (win) win.webContents.send('command', 'file:new-tab', 'beaker://history');
        }
      },
      { type: 'separator' },
      {
        label: 'Bookmark this Page',
        accelerator: 'CmdOrCtrl+D',
        click: function (item, win) {
          if (win) win.webContents.send('command', 'bookmark:create');
        }
      }
    ]
  };

  var windowMenu = {
    label: 'Window',
    role: 'window',
    submenu: [
      {
        label: 'Minimize',
        accelerator: 'CmdOrCtrl+M',
        role: 'minimize'
      },
      {
        label: 'Next Tab',
        accelerator: 'CmdOrCtrl+}',
        click: function (item, win) {
          if (win) win.webContents.send('command', 'window:next-tab');
        }
      },
      {
        label: 'Previous Tab',
        accelerator: 'CmdOrCtrl+{',
        click: function (item, win) {
          if (win) win.webContents.send('command', 'window:prev-tab');
        }
      }
    ]
  };
  if (process.platform == 'darwin') {
    windowMenu.submenu.push({
      type: 'separator'
    });
    windowMenu.submenu.push({
      label: 'Bring All to Front',
      role: 'front'
    });
  }

  var helpMenu = {
    label: 'Help',
    role: 'help',
    submenu: [
      {
        label: 'Help',
        accelerator: 'F1',
        click: function (item, win) {
          if (win) win.webContents.send('command', 'file:new-tab', 'https://beakerbrowser.com/docs/');
        }
      },
      {
        label: 'Report Bug',
        click: function (item, win) {
          if (win) win.webContents.send('command', 'file:new-tab', 'https://github.com/beakerbrowser/beaker/issues');
        }
      },
      {
        label: 'Mailing List',
        click: function (item, win) {
          if (win) win.webContents.send('command', 'file:new-tab', 'https://groups.google.com/forum/#!forum/beaker-browser');
        }
      }
    ]
  };
  if (process.platform !== 'darwin') {
    helpMenu.submenu.push({ type: 'separator' });
    helpMenu.submenu.push({
      label: 'About',
      role: 'about',
      click: function (item, win) {
        if (win) win.webContents.send('command', 'file:new-tab', 'beaker://settings');
      }
    });
  }

  // assemble final menu
  var menus = [fileMenu, editMenu, viewMenu, historyMenu, windowMenu, helpMenu];
  if (process.platform === 'darwin') menus.unshift(darwinMenu);
  return menus
}

// internal helpers
// =

var lastURLProtocol = false;
function requiresRebuild (url$$1) {
  const urlProtocol = url$$1 ? url$$1.split(':')[0] : false;
  // check if this is a change of protocol
  const b = (lastURLProtocol !== urlProtocol);
  lastURLProtocol = urlProtocol;
  return b
}

/*
The webviews that run untrusted content, by default, will handle all key press events.
The webview handlers take precedence over the browser keybindings (which are done in the window-menu).
To avoid that, we listen to the window webContents' 'before-input-event' and handle the commands manually.
*/

const KEYBINDINGS = extractKeybindings(buildWindowMenu());

// recurse the window menu and extract all 'accelerator' values with reserved=true
function extractKeybindings (menuNode) {
  if (menuNode.accelerator && menuNode.click && menuNode.reserved) {
    return {
      binding: convertAcceleratorToBinding(menuNode.accelerator),
      cmd: menuNode.click
    }
  } else if (menuNode.submenu) {
    return menuNode.submenu.map(extractKeybindings).filter(Boolean)
  } else if (Array.isArray(menuNode)) {
    return _flattenDeep(menuNode.map(extractKeybindings).filter(Boolean))
  }
  return null
}

// convert accelerator values into objects that are easy to match against input events
// eg 'CmdOrCtrl+Shift+T' -> {cmdOrCtrl: true, shift: true, key: 't'}
function convertAcceleratorToBinding (accel) {
  var binding = {};
  accel.split('+').forEach(part => {
    switch (part.toLowerCase()) {
      case 'command':
      case 'cmd':
      case 'cmdorctrl':
      case 'ctrl':
        binding.cmdOrCtrl = true;
        break
      case 'alt':
        binding.alt = true;
        break
      case 'shift':
        binding.shift = true;
        break
      default:
        binding.key = part.toLowerCase();
    }
  });
  return binding
}

// event handler, manually run any events that match our keybindings
function createBeforeInputEventHandler (win) {
  return (e, input) => {
    const key = input.key === 'Dead' ? 'i' : input.key; // not... really sure what 'Dead' is about -prf
    for (var kb of KEYBINDINGS) {
      if (key === kb.binding.key) {
        if (kb.binding.cmdOrCtrl && !(input.ctrl || input.meta)) {
          continue
        }
        if (kb.binding.shift && !input.shift) {
          continue
        }
        if (kb.binding.alt && !input.alt) {
          continue
        }

        // match, run
        e.preventDefault();
        kb.cmd(null, win);
        return
      }
    }
  }
}

// globals
// =

// downloads list
// - shared across all windows
var downloads = [];

// used for rpc
var downloadsEvents = new EventEmitter();

// exported api
// =

function setup$6 () {
}

const WEBAPI$1 = { createEventsStream: createEventsStream$1, getDownloads, pause, resume, cancel, remove, open: open$1, showInFolder };

function registerListener (win, opts = {}) {
  const listener = (e, item, webContents$$1) => {
    // dont touch if already being handled
    // - if `opts.saveAs` is being used, there may be multiple active event handlers
    if (item.isHandled) { return }

    // build a path to an unused name in the downloads folder
    let filePath = opts.saveAs ? opts.saveAs : unusedFilename.sync(path__default.join(electron.app.getPath('downloads'), item.getFilename()));

    // track as an active download
    item.id = ('' + Date.now()) + ('' + Math.random()); // pretty sure this is collision proof but replace if not -prf
    item.name = path__default.basename(filePath);
    if (item.name.split('.').length < 2 && item.getMimeType()) {
      const ext = `.${mime.extension(item.getMimeType())}`;
      if (ext !== '.bin') {
        item.name += ext;
        filePath += ext;
      }
    }
    item.setSavePath(filePath);
    item.isHandled = true;
    item.downloadSpeed = speedometer();
    downloads.push(item);
    downloadsEvents.emit('new-download', toJSON(item));

    // update dock-icon progress bar
    var lastBytes = 0;
    item.on('updated', () => {
      var sumProgress = {
        receivedBytes: getSumReceivedBytes(),
        totalBytes: getSumTotalBytes()
      };

      // track rate of download
      item.downloadSpeed(item.getReceivedBytes() - lastBytes);
      lastBytes = item.getReceivedBytes();

      // emit
      downloadsEvents.emit('updated', toJSON(item));
      downloadsEvents.emit('sum-progress', sumProgress);
      win.setProgressBar(sumProgress.receivedBytes / sumProgress.totalBytes);
    });

    item.on('done', (e, state) => {
      // inform users of error conditions
      var overrides = false;
      if (state === 'interrupted') {
        // this can sometimes happen because the link is a data: URI
        // in that case, we can manually parse and save it
        if (item.getURL().startsWith('data:')) {
          let parsed = parseDataURL(item.getURL());
          if (parsed) {
            fs.writeFileSync(filePath, parsed.body);
            overrides = {
              state: 'completed',
              receivedBytes: parsed.body.length,
              totalBytes: parsed.body.length
            };
          }
        }
        if (!overrides) {
          electron.dialog.showErrorBox('Download error', `The download of ${item.getFilename()} was interrupted`);
        }
      }

      downloadsEvents.emit('done', toJSON(item, overrides));

      // replace entry with a clone that captures the final state
      downloads.splice(downloads.indexOf(item), 1, capture(item, overrides));

      // reset progress bar when done
      if (isNoActiveDownloads() && !win.isDestroyed()) {
        win.setProgressBar(-1);
      }

      if (state === 'completed') {
        // flash the dock on osx
        if (process.platform === 'darwin') {
          electron.app.dock.downloadFinished(filePath);
        }
      }

      // optional, for one-time downloads
      if (opts.unregisterWhenDone) {
        webContents$$1.session.removeListener('will-download', listener);
      }
    });
  };

  win.webContents.session.prependListener('will-download', listener);
  win.on('close', () => win.webContents.session.removeListener('will-download', listener));
}

function download (win, url$$1, opts) {
  // register for onetime use of the download system
  opts = Object.assign({}, opts, {unregisterWhenDone: true});
  registerListener(win, opts);
  win.webContents.downloadURL(url$$1);
}

// rpc api
// =

function createEventsStream$1 () {
  return emitStream(downloadsEvents)
}

function getDownloads () {
  return Promise.resolve(downloads.map(toJSON))
}

function pause (id) {
  var download = downloads.find(d => d.id == id);
  if (download) { download.pause(); }
  return Promise.resolve()
}

function resume (id) {
  var download = downloads.find(d => d.id == id);
  if (download) { download.resume(); }
  return Promise.resolve()
}

function cancel (id) {
  var download = downloads.find(d => d.id == id);
  if (download) { download.cancel(); }
  return Promise.resolve()
}

function remove (id) {
  var download = downloads.find(d => d.id == id);
  if (download && download.getState() != 'progressing') { downloads.splice(downloads.indexOf(download), 1); }
  return Promise.resolve()
}

function open$1 (id) {
  return new Promise((resolve, reject) => {
    // find the download
    var download = downloads.find(d => d.id == id);
    if (!download || download.state != 'completed') { return reject() }

    // make sure the file is still there
    fs.stat(download.getSavePath(), err => {
      if (err) { return reject() }

      // open
      electron.shell.openItem(download.getSavePath());
      resolve();
    });
  })
}

function showInFolder (id) {
  return new Promise((resolve, reject) => {
    // find the download
    var download = downloads.find(d => d.id == id);
    if (!download || download.state != 'completed') { return reject() }

    // make sure the file is still there
    fs.stat(download.getSavePath(), err => {
      if (err) { return reject() }

      // open
      electron.shell.showItemInFolder(download.getSavePath());
      resolve();
    });
  })
}

// internal helpers
// =

// reduce down to attributes
function toJSON (item, overrides) {
  return {
    id: item.id,
    name: item.name,
    url: item.getURL(),
    state: overrides ? overrides.state : item.getState(),
    isPaused: item.isPaused(),
    receivedBytes: overrides ? overrides.receivedBytes : item.getReceivedBytes(),
    totalBytes: overrides ? overrides.totalBytes : item.getTotalBytes(),
    downloadSpeed: item.downloadSpeed()
  }
}

// create a capture of the final state of an item
function capture (item, overrides) {
  var savePath = item.getSavePath();
  var dlspeed = item.download;
  item = toJSON(item, overrides);
  item.getURL = () => item.url;
  item.getState = () => overrides === true ? 'completed' : item.state;
  item.isPaused = () => false;
  item.getReceivedBytes = () => overrides ? overrides.receivedBytes : item.receivedBytes;
  item.getTotalBytes = () => overrides ? overrides.totalBytes : item.totalBytes;
  item.getSavePath = () => savePath;
  item.downloadSpeed = () => dlspeed;
  return item
}

// sum of received bytes
function getSumReceivedBytes () {
  return getActiveDownloads().reduce((acc, item) => acc + item.getReceivedBytes(), 0)
}

// sum of total bytes
function getSumTotalBytes () {
  return getActiveDownloads().reduce((acc, item) => acc + item.getTotalBytes(), 0)
}

function getActiveDownloads () {
  return downloads.filter(d => d.getState() == 'progressing')
}

// all downloads done?
function isNoActiveDownloads () {
  return getActiveDownloads().length === 0
}

/* globals DatArchive */

// front-end only:
var yo;
if (typeof document !== 'undefined') {
  yo = require('yo-yo');
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
  var el = yo`<span class="link">${prettyHash(archiveKey)}</span>`;
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
      return yo`<span>${firstWord} files to <a onclick=${viewArchive}>${title}</a></span>`
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
      return yo`<span>${firstWord} the archive <a onclick=${viewArchive}>${title}</a></span>`
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
      return yo`<span>Seed <a onclick=${viewArchive}>${title}</a></span>`
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
      return yo`<span>Stop seeding <a onclick=${viewArchive}>${title}</a></span>`
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
      return yo`<span>Fetch data from <a onclick=${viewPage}>${param}</a></span>`
    },
    icon: 'download',
    persist: true,
    alwaysDisallow: false,
    requiresRefresh: false,
    experimental: true
  }
};

const dat$1 = beakerCore.dat;
const sitedata = beakerCore.dbs.sitedata;
// globals
// =

var idCounter = 0;
var activeRequests = [];

// exported api
// =

function setup$7 () {
  // wire up handlers
  electron.session.defaultSession.setPermissionRequestHandler(onPermissionRequestHandler);
  electron.ipcMain.on('permission-response', onPermissionResponseHandler);
}

function requestPermission (permission, webContents$$1, opts) {
  return new Promise((resolve, reject) => onPermissionRequestHandler(webContents$$1, permission, resolve, opts))
}

function grantPermission (permission, webContents$$1) {
  var siteURL = (typeof webContents$$1 === 'string') ? webContents$$1 : webContents$$1.getURL();

  // update the DB
  const PERM = PERMS[_beaker_core_lib_strings.getPermId(permission)];
  if (PERM && PERM.persist) {
    sitedata.setPermission(siteURL, permission, 1);
  }
  return Promise.resolve()
}

function revokePermission (permission, webContents$$1) {
  var siteURL = (typeof webContents$$1 === 'string') ? webContents$$1 : webContents$$1.getURL();

  // update the DB
  const PERM = PERMS[_beaker_core_lib_strings.getPermId(permission)];
  if (PERM && PERM.persist) {
    sitedata.clearPermission(siteURL, permission);
  }
  return Promise.resolve()
}

function queryPermission (permission, webContents$$1) {
  return sitedata.getPermission(webContents$$1.getURL(), permission)
}

function denyAllRequests (win) {
  // remove all requests in the window, denying as we go
  activeRequests = activeRequests.filter(req => {
    if (req.win === win) {
      req.cb(false);
      return false
    }
    return true
  });
}

async function checkLabsPerm ({perm, labApi, apiDocsUrl, sender}) {
  var url$$1 = sender.getURL();
  if (url$$1.startsWith('beaker:')) return true
  if (url$$1.startsWith('dat:')) {
    // check dat.json for opt-in
    let isOptedIn = false;
    let archive = dat$1.library.getArchive(url$$1);
    if (archive) {
      let manifest = await pda.readManifest(archive).catch(_ => {});
      let apis = _get(manifest, 'experimental.apis');
      if (apis && Array.isArray(apis)) {
        isOptedIn = apis.includes(labApi);
      }
    }
    if (!isOptedIn) {
      throw new beakerErrorConstants.PermissionsError(`You must include "${labApi}" in your dat.json experimental.apis list. See ${apiDocsUrl} for more information.`)
    }

    // ask user
    let allowed = await requestPermission(perm, sender);
    if (!allowed) throw new beakerErrorConstants.UserDeniedError()
    return true
  }
  throw new beakerErrorConstants.PermissionsError()
}

// event handlers
// =

function onPermissionRequestHandler (webContents$$1, permission, cb, opts) {
  // look up the containing window
  var win = getContainingWindow(webContents$$1);
  if (!win) {
    console.error('Warning: failed to find containing window of permission request, ' + permission);
    return cb(false)
  }
  const url$$1 = webContents$$1.getURL();

  // check if the perm is auto-allowed or auto-disallowed
  const PERM = PERMS[_beaker_core_lib_strings.getPermId(permission)];
  if (PERM && PERM.alwaysAllow) return cb(true)
  if (PERM && PERM.alwaysDisallow) return cb(false)

  // check the sitedatadb
  sitedata.getPermission(url$$1, permission).catch(err => undefined).then(res => {
    if (res === 1) return cb(true)
    if (res === 0) return cb(false)

    // if we're already tracking this kind of permission request, then bundle them
    var req = activeRequests.find(req => req.win === win && req.permission === permission);
    if (req) {
      if (PERM.alwaysAsk) {
        // deny now
        return cb(false)
      }
      var oldCb = req.cb;
      req.cb = decision => { oldCb(decision); cb(decision); };
    } else {
      // track the new cb
      req = { id: ++idCounter, win, url: url$$1, permission, cb };
      activeRequests.push(req);
    }

    // send message to create the UI
    win.webContents.send('command', 'perms:prompt', req.id, webContents$$1.id, permission, opts);
  });
}

async function onPermissionResponseHandler (e, reqId, decision) {
  // lookup the cb
  var req = activeRequests.find(req => req.id == reqId);
  if (!req) { return console.error('Warning: failed to find permission request for response #' + reqId) }

  // persist decisions
  const PERM = PERMS[_beaker_core_lib_strings.getPermId(req.permission)];
  if (PERM && PERM.persist) {
    if (PERM.persist === 'allow' && !decision) {
      // only persist allows
      await sitedata.clearPermission(req.url, req.permission);
    } else {
      // persist all decisions
      await sitedata.setPermission(req.url, req.permission, decision);
    }
  }

  // untrack
  activeRequests.splice(activeRequests.indexOf(req), 1);

  // hand down the decision
  var cb = req.cb;
  cb(decision);
}

function getContainingWindow (webContents$$1) {
  return electron.BrowserWindow.fromWebContents(webContents$$1.hostWebContents)
}


var permissions = Object.freeze({
	setup: setup$7,
	requestPermission: requestPermission,
	grantPermission: grantPermission,
	revokePermission: revokePermission,
	queryPermission: queryPermission,
	denyAllRequests: denyAllRequests,
	checkLabsPerm: checkLabsPerm
});

const settingsDb$1 = beakerCore.dbs.settings;

const IS_WIN = process.platform === 'win32';

// globals
// =
let userDataDir;
let numActiveWindows = 0;
let firstWindow = null;
let sessionWatcher = null;
let focusedDevtoolsHost;
const BROWSING_SESSION_PATH = './shell-window-state.json';
const ICON_PATH = path__default.join(__dirname, (process.platform === 'win32') ? './assets/img/logo.ico' : './assets/img/logo.png');

// exported methods
// =

async function setup$4 () {
  // config
  userDataDir = jetpack.cwd(electron.app.getPath('userData'));

  // set up app events
  electron.app.on('activate', () => {
    // wait for ready (not waiting can trigger errors)
    if (electron.app.isReady()) ensureOneWindowExists();
    else electron.app.on('ready', ensureOneWindowExists);
  });
  electron.ipcMain.on('new-window', () => createShellWindow());
  electron.app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') electron.app.quit();
  });

  setup$3();

  electron.app.on('before-quit', async e => {
    sessionWatcher.exit();
    sessionWatcher.stopRecording();
  });

  electron.app.on('web-contents-created', (e, wc) => {
    if (wc.hostWebContents) {
      // attach keybinding protections
      const parentWindow = electron.BrowserWindow.fromWebContents(wc.hostWebContents);
      wc.on('before-input-event', createBeforeInputEventHandler(parentWindow));

      // HACK
      // add link-click handling to page devtools
      // (it would be much better to update Electron to support this, rather than overriding like this)
      // -prf
      wc.on('devtools-opened', () => {
        if (wc.devToolsWebContents) {
          wc.devToolsWebContents.executeJavaScript('InspectorFrontendHost.openInNewTab = (url) => window.open(url)');
          wc.devToolsWebContents.on('new-window', (e, url$$1) => {
            wc.hostWebContents.send('command', 'file:new-tab', url$$1);
          });
        }
      });

      // track focused devtools host
      wc.on('devtools-focused', () => { focusedDevtoolsHost = wc; });
      wc.on('devtools-closed', unfocusDevtoolsHost);
      wc.on('destroyed', unfocusDevtoolsHost);
      function unfocusDevtoolsHost () {
        if (focusedDevtoolsHost === wc) {
          focusedDevtoolsHost = undefined;
        }
      }
    }
  });

  electron.ipcMain.on('shell-window:ready', ({ sender }) => {
    if (sender.id === firstWindow) {
      // if this is the first window opened (since app start or since all windows closing)
      sender.send('command', 'load-pinned-tabs');
      try { electron.BrowserWindow.fromId(sender.id).focus(); } catch (e) {}
    }
  });

  let previousSessionState = getPreviousBrowsingSession();
  sessionWatcher = new SessionWatcher(userDataDir);
  let customStartPage = await settingsDb$1.get('custom_start_page');
  let isTestDriverActive = !!beakerCore.getEnvVar('BEAKER_TEST_DRIVER');
  let isOpenUrlEnvVar = !!beakerCore.getEnvVar('BEAKER_OPEN_URL');

  if (!isTestDriverActive && !isOpenUrlEnvVar && (customStartPage === 'previous' || !previousSessionState.cleanExit && userWantsToRestoreSession())) {
    // restore old window
    restoreBrowsingSession(previousSessionState);
  } else {
    let opts = {};
    if (previousSessionState.windows[0]) {
      // use the last session's window position
      let {x, y, width, height} = previousSessionState.windows[0];
      opts.x = x;
      opts.y = y;
      opts.width = width;
      opts.height = height;
    }
    if (isOpenUrlEnvVar) {
      // use the env var if specified
      opts.pages = [beakerCore.getEnvVar('BEAKER_OPEN_URL')];
    }
    // create new window
    createShellWindow(opts);
  }
}

function createShellWindow (windowState) {
  // create window
  let state = ensureVisibleOnSomeDisplay(Object.assign({}, defaultWindowState(), windowState));
  var { x, y, width, height, minWidth, minHeight } = state;
  var win = new electron.BrowserWindow({
    titleBarStyle: 'hiddenInset',
    autoHideMenuBar: true,
    fullscreenable: true,
    fullscreenWindowTitle: true,
    frame: !IS_WIN,
    x,
    y,
    width,
    height,
    minWidth,
    minHeight,
    defaultEncoding: 'UTF-8',
    webPreferences: {
      webSecurity: false, // disable same-origin-policy in the shell window, webviews have it restored
      allowRunningInsecureContent: false,
      nativeWindowOpen: true
    },
    icon: ICON_PATH
  });
  registerListener(win);
  win.loadURL('beaker://shell-window');
  sessionWatcher.watchWindow(win, state);

  function handlePagesReady ({ sender }) {
    if (win && !win.isDestroyed() && sender === win.webContents) {
      win.webContents.send('command', 'initialize', state.pages);
    }
  }

  numActiveWindows++;

  if (numActiveWindows === 1) {
    firstWindow = win.webContents.id;
  }

  electron.ipcMain.on('shell-window:pages-ready', handlePagesReady);
  win.on('closed', () => {
    electron.ipcMain.removeListener('shell-window:pages-ready', handlePagesReady);
  });

  // register shortcuts
  for (var i = 1; i <= 8; i++) { electronLocalshortcut.register(win, 'CmdOrCtrl+' + i, onTabSelect(win, i - 1)); }
  electronLocalshortcut.register(win, 'CmdOrCtrl+9', onLastTab(win));
  electronLocalshortcut.register(win, 'Ctrl+Tab', onNextTab(win));
  electronLocalshortcut.register(win, 'Ctrl+Shift+Tab', onPrevTab(win));
  electronLocalshortcut.register(win, 'Ctrl+PageUp', onPrevTab(win));
  electronLocalshortcut.register(win, 'Ctrl+PageDown', onNextTab(win));
  electronLocalshortcut.register(win, 'CmdOrCtrl+[', onGoBack(win));
  electronLocalshortcut.register(win, 'CmdOrCtrl+]', onGoForward(win));
  electronLocalshortcut.register(win, 'alt+d', onFocusLocation(win));

  // register event handlers
  win.on('browser-backward', onGoBack(win));
  win.on('browser-forward', onGoForward(win));
  win.on('scroll-touch-begin', sendScrollTouchBegin);
  win.on('scroll-touch-end', sendToWebContents('scroll-touch-end'));
  win.on('focus', sendToWebContents('focus'));
  win.on('blur', sendToWebContents('blur'));
  win.on('app-command', (e, cmd) => { onAppCommand(win, e, cmd); });
  win.on('enter-full-screen', e => {
    electronLocalshortcut.register(win, 'Esc', onEscape(win));
    sendToWebContents('enter-full-screen')(e);
  });
  win.on('leave-full-screen', e => {
    electronLocalshortcut.unregister(win, 'Esc');
    sendToWebContents('leave-full-screen')(e);
  });
  win.on('closed', onClosed(win));

  return win
}

function getActiveWindow () {
  // try to pull the focused window; if there isnt one, fallback to the last created
  var win = electron.BrowserWindow.getFocusedWindow();
  if (!win) {
    win = electron.BrowserWindow.getAllWindows().pop();
  }
  return win
}

function getFocusedDevToolsHost () {
  // check first if it's the shell window's devtools
  let win = electron.BrowserWindow.getAllWindows().find(w => w.webContents.isDevToolsFocused());
  if (win) return win.webContents
  // fallback to our manually tracked devtools host
  return focusedDevtoolsHost
}



function ensureOneWindowExists () {
  if (numActiveWindows === 0) {
    createShellWindow();
  }
}

// internal methods
// =

function windowWithinBounds (windowState, bounds) {
  return windowState.x >= bounds.x &&
    windowState.y >= bounds.y &&
    windowState.x + windowState.width <= bounds.x + bounds.width &&
    windowState.y + windowState.height <= bounds.y + bounds.height
}

function userWantsToRestoreSession () {
  let answer = electron.dialog.showMessageBox({
    type: 'question',
    message: 'Sorry! It looks like Beaker crashed',
    detail: 'Would you like to restore your previous browsing session?',
    buttons: [ 'Restore Session', 'Cancel' ],
    defaultId: 0,
    icon: ICON_PATH
  });
  return answer === 0
}

function restoreBrowsingSession (previousSessionState) {
  let { windows } = previousSessionState;
  if (windows.length) {
    for (let windowState of windows) {
      if (windowState) createShellWindow(windowState);
    }
  } else {
    createShellWindow();
  }
}

function getPreviousBrowsingSession () {
  var restoredState = {};
  try {
    restoredState = userDataDir.read(BROWSING_SESSION_PATH, 'json');
  } catch (err) {
    // For some reason json can't be read (might be corrupted).
    // No worries, we have defaults.
  }
  return Object.assign({}, defaultBrowsingSessionState(), restoredState)
}

function ensureVisibleOnSomeDisplay (windowState) {
  // HACK
  // for some reason, electron.screen comes back null sometimes
  // not sure why, shouldn't be happening
  // check for existence for now, see #690
  // -prf
  const screen$$1 = getScreenAPI();
  var visible = screen$$1 && screen$$1.getAllDisplays().some(display => windowWithinBounds(windowState, display.bounds));
  if (!visible) {
    // Window is partially or fully not visible now.
    // Reset it to safe defaults.
    return defaultWindowState(windowState)
  }
  return windowState
}

// shortcut event handlers
// =

function onClosed (win) {
  return e => {
    numActiveWindows--;

    // deny any outstanding permission requests
    denyAllRequests(win);

    // unregister shortcuts
    electronLocalshortcut.unregisterAll(win);
  }
}

function onTabSelect (win, tabIndex) {
  return () => win.webContents.send('command', 'set-tab', tabIndex)
}

function onLastTab (win) {
  return () => win.webContents.send('command', 'window:last-tab')
}

function onNextTab (win) {
  return () => win.webContents.send('command', 'window:next-tab')
}

function onPrevTab (win) {
  return () => win.webContents.send('command', 'window:prev-tab')
}

function onGoBack (win) {
  return () => win.webContents.send('command', 'history:back')
}

function onGoForward (win) {
  return () => win.webContents.send('command', 'history:forward')
}

function onFocusLocation (win) {
  return () => win.webContents.send('command', 'file:open-location')
}

function onAppCommand (win, e, cmd) {
  // handles App Command events (Windows)
  // see https://electronjs.org/docs/all#event-app-command-windows
  switch (cmd) {
    case 'browser-backward':
      win.webContents.send('command', 'history:back');
      break
    case 'browser-forward':
      win.webContents.send('command', 'history:forward');
      break
    default:
      break
  }
}

function onEscape (win) {
  return () => win.webContents.send('window-event', 'leave-page-full-screen')
}

// window event handlers
// =

function sendToWebContents (event) {
  return e => e.sender.webContents.send('window-event', event)
}

function sendScrollTouchBegin (e) {
  // get the cursor x/y within the window
  const screen$$1 = getScreenAPI();
  if (!screen$$1) return
  var cursorPos = screen$$1.getCursorScreenPoint();
  var winPos = e.sender.getBounds();
  cursorPos.x -= winPos.x; cursorPos.y -= winPos.y;
  e.sender.webContents.send('window-event', 'scroll-touch-begin', {
    cursorX: cursorPos.x,
    cursorY: cursorPos.y
  });
}

// helpers
// =

function getScreenAPI () {
  return require('electron').screen
}

// handle OSX open-url event
var queue = [];
var isLoaded = false;
var isSetup = false;

function setup$3 () {
  if (isSetup) return
  isSetup = true;
  electron.ipcMain.on('shell-window:ready', function (e) {
    queue.forEach(url$$1 => e.sender.send('command', 'file:new-tab', url$$1));
    queue.length = 0;
    isLoaded = true;
  });
}

function open (url$$1) {
  setup$3();
  var win = getActiveWindow();
  if (isLoaded && win) {
    // send command now
    win.webContents.send('command', 'file:new-tab', url$$1);
    win.show();
  } else {
    // queue for later
    queue.push(url$$1);

    // no longer loaded?
    if (isLoaded) {
      isLoaded = false;
      // spawn a new window
      createShellWindow();
    }
  }
  return win && win.webContents
}

const SIZES = {
  'basic-auth': {width: 500, height: 320},
  prompt: {width: 500, height: 170},
  install: {width: 500, height: 250}
};

// globals
// =

var modalWindow;
var reqIdCounter = 0;
var activeRequests$1 = [];

// exported apis
// =

function setup$8 () {
  // wire up handlers
  electron.ipcMain.on('modal-response', onModalResponse);
}

function showModal (parentWindow, modalName, opts = {}) {
  if (modalWindow) {
    return Promise.reject(new beakerErrorConstants.ModalActiveError())
  }

  // create the modal window
  parentWindow = parentWindow || electron.BrowserWindow.getFocusedWindow();
  let x, y, width, height;
  width = SIZES[modalName].width;
  height = SIZES[modalName].height;
  if (parentWindow) {
    let b = parentWindow.getBounds();
    x = (b.x + (b.width / 2) - (width / 2));
    y = b.y + 40;
  }
  modalWindow = new electron.BrowserWindow({
    x,
    y,
    width,
    height,
    parent: parentWindow,
    autoHideMenuBar: true,
    modal: true,
    show: false,
    webPreferences: {
      preload: path__default.join(electron.app.getAppPath(), 'webview-preload.build.js')
    }
  });
  modalWindow.loadURL('beaker://' + modalName + '-modal');
  modalWindow.once('ready-to-show', () => {
    // inject config
    modalWindow.webContents.executeJavaScript(`
      setup(${JSON.stringify(opts)})
    `);
    modalWindow.show();
  });

  // register behaviors
  modalWindow.on('close', closeModal);

  // create and return the end-state promise
  modalWindow.promise = new Promise((resolve, reject) => {
    modalWindow.resolve = resolve;
    modalWindow.reject = reject;
  });
  return modalWindow.promise
}

function closeModal (err, res) {
  if (!modalWindow) return true
  var w = modalWindow;
  modalWindow = null;

  // resolve/reject the promise
  if (err) w.reject(err);
  else w.resolve(res);
  w.promise = null;

  // destroy
  w.close();
  return true
}

function showShellModal (webContents$$1, modalName, opts = {}) {
  return new Promise(async (resolve, reject) => {
    // sanity check
    if (!webContents$$1.hostWebContents) {
      // get the active tab's webcontents
      try {
        let wcID = await webContents$$1.executeJavaScript(`pages.getActive().wcID`);
        webContents$$1 = electron.webContents.fromId(wcID);
        if (!webContents$$1) throw new Error('Web Contents not found')
      } catch (e) {
        console.error('Warning: showShellModal() was passed the webContents of a non page, and failed to fetch the current page', e);
        return reject('Invalid shell modal target')
      }
    }

    // modal already active?
    if (activeRequests$1.find(r => r.webContents === webContents$$1)) {
      return reject(new beakerErrorConstants.ModalActiveError())
    }

    // track the new request
    var req = {id: ++reqIdCounter, resolve, reject, webContents: webContents$$1};
    activeRequests$1.push(req);

    // send message to create the UI
    webContents$$1.hostWebContents.send('command', 'show-modal', req.id, webContents$$1.id, modalName, opts);
  })
}

// internal methods
// =

async function onModalResponse (e, reqId, err, res) {
  // lookup the request
  var req = activeRequests$1.find(req => req.id == reqId);
  if (!req) { return console.error('Warning: failed to find modal request for response #' + reqId) }

  // untrack
  activeRequests$1.splice(activeRequests$1.indexOf(req), 1);

  // finish
  if (err) req.reject(new Error(err));
  else req.resolve(res);
}

const exec = require('util').promisify(require('child_process').exec);
var debug$1 = require('debug')('beaker');
const settingsDb = beakerCore.dbs.settings;
// constants
// =

const IS_FROM_SOURCE = (process.defaultApp || /node_modules[\\/]electron[\\/]/.test(process.execPath));
const IS_LINUX = !(/^win/.test(process.platform)) && process.platform !== 'darwin';
const DOT_DESKTOP_FILENAME = 'appimagekit-beaker-browser.desktop';
const isBrowserUpdatesSupported = !(IS_LINUX || IS_FROM_SOURCE); // linux is temporarily not supported

// how long between scheduled auto updates?
const SCHEDULED_AUTO_UPDATE_DELAY = 24 * 60 * 60 * 1e3; // once a day

// possible updater states
const UPDATER_STATUS_IDLE = 'idle';
const UPDATER_STATUS_CHECKING = 'checking';
const UPDATER_STATUS_DOWNLOADING = 'downloading';
const UPDATER_STATUS_DOWNLOADED = 'downloaded';

// globals
// =

// dont automatically check for updates (need to respect user preference)
electronUpdater.autoUpdater.autoDownload = false;

// what's the updater doing?
var updaterState = UPDATER_STATUS_IDLE;
var updaterError = false; // has there been an error?

// where is the user in the setup flow?
var userSetupStatus = false;
var userSetupStatusLookupPromise;

// events emitted to rpc clients
var browserEvents = new EventEmitter();

process.on('unhandledRejection', (reason, p) => {
  debug$1('Unhandled Rejection at: Promise', p, 'reason:', reason);
});
process.on('uncaughtException', (err) => {
  debug$1('Uncaught exception:', err);
});

// exported methods
// =

function setup$2 () {
  // setup auto-updater
  if (isBrowserUpdatesSupported) {
    try {
      electronUpdater.autoUpdater.setFeedURL(getAutoUpdaterFeedSettings());
      electronUpdater.autoUpdater.on('update-available', onUpdateAvailable);
      electronUpdater.autoUpdater.on('update-not-available', onUpdateNotAvailable);
      electronUpdater.autoUpdater.on('update-downloaded', onUpdateDownloaded);
      electronUpdater.autoUpdater.on('error', onUpdateError);
    } catch (e) {
      debug$1('[AUTO-UPDATE] error', e.toString());
    }
    setTimeout(scheduledAutoUpdate, 15e3); // wait 15s for first run
  }

  // fetch user setup status
  userSetupStatusLookupPromise = settingsDb.get('user-setup-status');

  // wire up events
  electron.app.on('web-contents-created', onWebContentsCreated);

  // window.prompt handling
  //  - we have use ipc directly instead of using rpc, because we need custom
  //    response-lifecycle management in the main thread
  electron.ipcMain.on('page-prompt-dialog', async (e, message, def) => {
    var win = electron.BrowserWindow.fromWebContents(e.sender.hostWebContents);
    try {
      var res = await showModal(win, 'prompt', {message, default: def});
      e.returnValue = res && res.value ? res.value : false;
    } catch (e) {
      e.returnValue = false;
    }
  });
}

const WEBAPI = {
  createEventsStream,
  getInfo,
  checkForUpdates,
  restartBrowser,

  getSetting,
  getSettings,
  setSetting,
  getUserSetupStatus,
  setUserSetupStatus,
  getDefaultLocalPath,
  setStartPageBackgroundImage,
  getDefaultProtocolSettings,
  setAsDefaultProtocolClient,
  removeAsDefaultProtocolClient,

  fetchBody,
  downloadURL,

  listBuiltinFavicons,
  getBuiltinFavicon,

  setWindowDimensions,
  showOpenDialog,
  showContextMenu,
  openUrl: url$$1 => { open(url$$1); }, // dont return anything
  openFolder,
  doWebcontentsCmd,
  doTest,
  closeModal
};

function fetchBody (url$$1) {
  return new Promise((resolve) => {
    var http = url$$1.startsWith('https') ? require('https') : require('http');

    http.get(url$$1, (res) => {
      var body = '';
      res.setEncoding('utf8');
      res.on('data', (data) => { body += data; });
      res.on('end', () => resolve(body));
    });
  })
}

async function downloadURL (url$$1) {
  this.sender.downloadURL(url$$1);
}

async function listBuiltinFavicons ({filter, offset, limit} = {}) {
  if (filter) {
    filter = new RegExp(filter, 'i');
  }

  // list files in assets/favicons and filter on the name
  var dir = jetpack.cwd(__dirname).cwd('assets/favicons');
  var items = (await dir.listAsync())
    .filter(filename => {
      if (filter && !filter.test(filename)) {
        return false
      }
      return filename.endsWith('.ico')
    });
  return items.slice(offset || 0, limit || Number.POSITIVE_INFINITY)
}

async function getBuiltinFavicon (name) {
  var dir = jetpack.cwd(__dirname).cwd('assets/favicons');
  return dir.readAsync(name, 'buffer')
}

async function setWindowDimensions ({width, height} = {}) {
  var wc = this.sender;
  while (wc.hostWebContents) wc = wc.hostWebContents;
  var win = electron.BrowserWindow.fromWebContents(wc);
  var [currentWidth, currentHeight] = win.getSize();
  width = width || currentWidth;
  height = height || currentHeight;
  win.setSize(width, height);
}

function setStartPageBackgroundImage (srcPath, appendCurrentDir) {
  if (appendCurrentDir) {
    srcPath = path__default.join(__dirname, `/${srcPath}`);
  }

  var destPath = path__default.join(electron.app.getPath('userData'), 'start-background-image');

  return new Promise((resolve) => {
    if (srcPath) {
      fs.readFile(srcPath, (_, data) => {
        fs.writeFile(destPath, data, () => resolve());
      });
    } else {
      fs.unlink(destPath, () => resolve());
    }
  })
}

async function getDefaultProtocolSettings () {
  if (IS_LINUX) {
    // HACK
    // xdb-settings doesnt currently handle apps that you can't `which`
    // we can just use xdg-mime directly instead
    // see https://github.com/beakerbrowser/beaker/issues/915
    // -prf
    let [httpHandler, datHandler] = await Promise.all([
      exec('xdg-mime query default "x-scheme-handler/http"'),
      exec('xdg-mime query default "x-scheme-handler/dat"')
    ]);
    return {
      http: (httpHandler || '').trim() === DOT_DESKTOP_FILENAME,
      dat: (datHandler || '').trim() === DOT_DESKTOP_FILENAME
    }
  }

  return Promise.resolve(['http', 'dat'].reduce((res, x) => {
    res[x] = electron.app.isDefaultProtocolClient(x);
    return res
  }, {}))
}

async function setAsDefaultProtocolClient (protocol$$1) {
  if (IS_LINUX) {
    // HACK
    // xdb-settings doesnt currently handle apps that you can't `which`
    // we can just use xdg-mime directly instead
    // see https://github.com/beakerbrowser/beaker/issues/915
    // -prf
    await exec(`xdg-mime default ${DOT_DESKTOP_FILENAME} "x-scheme-handler/${protocol$$1}"`);
    return true
  }
  return Promise.resolve(electron.app.setAsDefaultProtocolClient(protocol$$1))
}

function removeAsDefaultProtocolClient (protocol$$1) {
  return Promise.resolve(electron.app.removeAsDefaultProtocolClient(protocol$$1))
}

function getInfo () {
  return Promise.resolve({
    version: electron.app.getVersion(),
    electronVersion: process.versions.electron,
    chromiumVersion: process.versions.chrome,
    nodeVersion: process.versions.node,
    platform: os.platform(),
    updater: {
      isBrowserUpdatesSupported,
      error: updaterError,
      state: updaterState
    },
    paths: {
      userData: electron.app.getPath('userData')
    }
  })
}

function checkForUpdates (opts = {}) {
  // dont overlap
  if (updaterState != UPDATER_STATUS_IDLE) { return }

  // update global state
  debug$1('[AUTO-UPDATE] Checking for a new version.');
  updaterError = false;
  setUpdaterState(UPDATER_STATUS_CHECKING);
  if (opts.prerelease) {
    debug$1('[AUTO-UPDATE] Jumping to pre-releases.');
    electronUpdater.autoUpdater.allowPrerelease = true;
  }
  electronUpdater.autoUpdater.checkForUpdates();

  // just return a resolve; results will be emitted
  return Promise.resolve()
}

function restartBrowser () {
  if (updaterState == UPDATER_STATUS_DOWNLOADED) {
    // run the update installer
    electronUpdater.autoUpdater.quitAndInstall();
    debug$1('[AUTO-UPDATE] Quitting and installing.');
  } else {
    debug$1('Restarting Beaker by restartBrowser()');
    // do a simple restart
    electron.app.relaunch();
    setTimeout(() => electron.app.exit(0), 1e3);
  }
}

function getSetting (key) {
  return settingsDb.get(key)
}

function getSettings () {
  return settingsDb.getAll()
}

function setSetting (key, value) {
  return settingsDb.set(key, value)
}

async function getUserSetupStatus () {
  // if not cached, defer to the lookup promise
  return (userSetupStatus) || userSetupStatusLookupPromise
}

function setUserSetupStatus (status) {
  userSetupStatus = status; // cache
  return settingsDb.set('user-setup-status', status)
}

// rpc methods
// =

function createEventsStream () {
  return emitStream(browserEvents)
}

function showOpenDialog (opts = {}) {
  var wc = this.sender.webContents;
  if (wc.hostWebContents) {
    wc = wc.hostWebContents;
  }
  return new Promise((resolve) => {
    electron.dialog.showOpenDialog({
      title: opts.title,
      buttonLabel: opts.buttonLabel,
      filters: opts.filters,
      properties: opts.properties,
      defaultPath: opts.defaultPath
    }, filenames => {
      // return focus back to the the webview
      wc.executeJavaScript(`
        var wv = document.querySelector('webview:not(.hidden)')
        if (wv) wv.focus()
      `);
      resolve(filenames);
    });
  })
}

function showContextMenu (menuDefinition) {
  return new Promise(resolve => {
    var cursorPos = electron.screen.getCursorScreenPoint();

    // add a click item to all menu items
    addClickHandler(menuDefinition);
    function addClickHandler (items) {
      items.forEach(item => {
        if (item.type === 'submenu' && Array.isArray(item.submenu)) {
          addClickHandler(item.submenu);
        } else if (item.type !== 'separator' && item.id) {
          item.click = clickHandler;
        }
      });
    }

    // add 'inspect element' in development
    if (beakerCore.getEnvVar('NODE_ENV') === 'develop' || beakerCore.getEnvVar('NODE_ENV') === 'test') {
      menuDefinition.push({type: 'separator'});
      menuDefinition.push({
        label: 'Inspect Element',
        click: () => {
          this.sender.inspectElement(cursorPos.x, cursorPos.y);
          if (this.sender.isDevToolsOpened()) { this.sender.devToolsWebContents.focus(); }
        }
      });
    }

    // track the selection
    var selection;
    function clickHandler (item) {
      selection = item.id;
    }

    // show the menu
    var win = electron.BrowserWindow.fromWebContents(this.sender.hostWebContents);
    var menu = electron.Menu.buildFromTemplate(menuDefinition);
    menu.popup(win);
    resolve(selection);
  })
}

function openFolder (folderPath) {
  electron.shell.openExternal('file://' + folderPath);
}

async function getDefaultLocalPath (dir, title) {
  // massage the title
  title = typeof title === 'string' ? title : '';
  title = title.replace(_beaker_core_lib_const.INVALID_SAVE_FOLDER_CHAR_REGEX, '');
  if (!title.trim()) {
    title = 'Untitled';
  }
  title = slugify(title).toLowerCase();

  // find an available variant of title
  let tryNum = 1;
  let titleVariant = title;
  while (await jetpack.existsAsync(path__default.join(dir, titleVariant))) {
    titleVariant = `${title}-${++tryNum}`;
  }
  return path__default.join(dir, titleVariant)
}

async function doWebcontentsCmd (method, wcId, ...args) {
  var wc = electron.webContents.fromId(+wcId);
  if (!wc) throw new Error(`WebContents not found (${wcId})`)
  return wc[method](...args)
}

async function doTest (test) {
  if (test === 'modal') {
    return showShellModal(this.sender, 'example', {i: 5})
  }
}

// internal methods
// =

function setUpdaterState (state) {
  updaterState = state;
  browserEvents.emit('updater-state-changed', {state});
}

function getAutoUpdaterFeedSettings () {
  return {
    provider: 'github',
    repo: 'beaker',
    owner: 'beakerbrowser',
    vPrefixedTagName: false
  }
}

// run a daily check for new updates
function scheduledAutoUpdate () {
  settingsDb.get('auto_update_enabled').then(v => {
    // if auto updates are enabled, run the check
    if (+v === 1) { checkForUpdates(); }

    // schedule next check
    setTimeout(scheduledAutoUpdate, SCHEDULED_AUTO_UPDATE_DELAY);
  });
}

// event handlers
// =

function onUpdateAvailable () {
  debug$1('[AUTO-UPDATE] New version available. Downloading...');
  electronUpdater.autoUpdater.downloadUpdate();
  setUpdaterState(UPDATER_STATUS_DOWNLOADING);
}

function onUpdateNotAvailable () {
  debug$1('[AUTO-UPDATE] No browser update available.');
  setUpdaterState(UPDATER_STATUS_IDLE);
}

function onUpdateDownloaded () {
  debug$1('[AUTO-UPDATE] New browser version downloaded. Ready to install.');
  setUpdaterState(UPDATER_STATUS_DOWNLOADED);
}

function onUpdateError (e) {
  console.error(e);
  debug$1('[AUTO-UPDATE] error', e.toString(), e);
  setUpdaterState(UPDATER_STATUS_IDLE);
  updaterError = {message: (e.toString() || '').split('\n')[0]};
  browserEvents.emit('updater-error', updaterError);
}

function onWebContentsCreated (e, webContents$$1) {
  webContents$$1.on('will-prevent-unload', onWillPreventUnload);
}

function onWillPreventUnload (e) {
  var choice = electron.dialog.showMessageBox({
    type: 'question',
    buttons: ['Leave', 'Stay'],
    title: 'Do you want to leave this site?',
    message: 'Changes you made may not be saved.',
    defaultId: 0,
    cancelId: 1
  });
  var leave = (choice === 0);
  if (leave) {
    e.preventDefault();
  }
}

// import { initialize, containsAds } from 'contains-ads'

// exported API

function setup$9 () {
  /*
  temporarily disabled due to https://github.com/bbondy/bloom-filter-cpp/issues/7
    "contains-ads": "^0.2.5",

  initialize() // contains-ads

  const beakerUrls = /^(beaker|blob)/
  session.defaultSession.webRequest.onBeforeRequest(['*://*./*'], (details, callback) => {
    const shouldBeBlocked = !details.url.match(beakerUrls) && containsAds(details.url)

    if (shouldBeBlocked) {
      callback({cancel: true})
    } else {
      callback({cancel: false})
    }
  })
  */
}

const settingsDb$2 = beakerCore.dbs.settings;
const debug$2 = require('debug')('beaker-analytics');

// exported methods
// =

function setup$10 () {
  setTimeout(checkin, ms('3s'));
}

// internal methods
// =

async function checkin () {
  // enabled?
  var isEnabled = await settingsDb$2.get('analytics_enabled');
  if (isEnabled == 1) {
    try {
      var pingData = await readPingData();
      if ((Date.now() - (pingData.lastPingTime || 0)) > _beaker_core_lib_const.ANALYTICS_CHECKIN_INTERVAL) {
        await sendPing(pingData);
      }
      pingData.lastPingTime = Date.now();
      await writePingData(pingData);
    } catch (e) {
      // failed, we'll reschedule another ping in 24 hours
    }
  }

  // schedule another ping check in 24 hours
  var to = setTimeout(checkin, ms('1d'));
  to.unref();
}

function sendPing (pingData) {
  return new Promise((resolve, reject) => {
    var qs = querystring.stringify({userId: pingData.id, os: osName(), beakerVersion: electron.app.getVersion()});
    debug$2('Sending ping to %s: %s', _beaker_core_lib_const.ANALYTICS_SERVER, qs);

    var req = https.request({
      method: 'POST',
      hostname: _beaker_core_lib_const.ANALYTICS_SERVER,
      path: '/ping?' + qs
    }, (res) => {
      if (res.statusCode === 204) {
        debug$2('Ping succeeded');
        resolve();
      } else {
        res.setEncoding('utf8');
        res.pipe(concat(body => debug$2('Ping failed', res.statusCode, body)));
        reject();
      }
    });
    req.on('error', err => {
      debug$2('Ping failed', err);
      reject();
    });
    req.end();
  })
}

async function readPingData () {
  var data = await jetpack.readAsync(path__default.join(electron.app.getPath('userData'), _beaker_core_lib_const.ANALYTICS_DATA_FILE), 'json');
  return data || {lastPingTime: 0, id: crypto.randomBytes(32).toString('hex')}
}

async function writePingData (data) {
  return jetpack.writeAsync(path__default.join(electron.app.getPath('userData'), _beaker_core_lib_const.ANALYTICS_DATA_FILE), data)
}

function registerContextMenu () {
  // register the context menu on every created webContents
  electron.app.on('web-contents-created', (e, webContents$$1) => {
    webContents$$1.on('context-menu', async (e, props) => {
      var menuItems = [];
      const { mediaFlags, editFlags } = props;
      const hasText = props.selectionText.trim().length > 0;
      const can = type => editFlags[`can${type}`] && hasText;
      const isDat = props.pageURL.startsWith('dat://');

      // get the focused window, ignore if not available (not in focus)
      // - fromWebContents(webContents) doesnt seem to work, maybe because webContents is often a webview?
      var targetWindow = electron.BrowserWindow.getFocusedWindow();
      if (!targetWindow) { return }

      // ignore clicks on the shell window
      if (props.pageURL == 'beaker://shell-window/') { return }

      // helper to call code on the element under the cursor
      const callOnElement = js => webContents$$1.executeJavaScript(`
        var el = document.elementFromPoint(${props.x}, ${props.y})
        new Promise(resolve => { ${js} })
      `);

      // fetch custom menu information
      try {
        var customMenu = await callOnElement(`
          if (!el) {
            return resolve(null)
          }

          // check for a context menu setting
          var contextMenuId
          while (el && el.getAttribute) {
            contextMenuId = el.getAttribute('contextmenu')
            if (contextMenuId) break
            el = el.parentNode
          }
          if (!contextMenuId) {
            return resolve(null)
          }

          // lookup the context menu el
          var contextMenuEl = document.querySelector('menu#' + contextMenuId)
          if (!contextMenuEl) {
            return resolve(null)
          }

          // extract the menu items that are commands
          var menuItemEls = contextMenuEl.querySelectorAll('menuitem, hr')
          resolve(Array.from(menuItemEls)
            .filter(el => {
              if (el.tagName === 'HR') return true
              var type = el.getAttribute('type')
              return !type || type.toLowerCase() === 'command'
            })
            .map(el => {
              if (el.tagName === 'HR') return { type: 'separator' }
              return {
                menuId: contextMenuId,
                type: 'command',
                disabled: el.getAttribute('disabled'),
                label: el.getAttribute('label')
              }
            })
          )
        `);
      } catch (e) {
        console.error('Error checking for a custom context menu', e);
      }
      if (customMenu && customMenu.length) {
        // add to the menu, with a 10 item limit
        customMenu.slice(0, 10).forEach(customItem => {
          if (customItem.type === 'separator') {
            menuItems.push({ type: 'separator' });
          } else if (customItem.label.trim()) {
            menuItems.push({
              label: customItem.label,
              click: () => webContents$$1.executeJavaScript(`
                var el = document.querySelector('#${customItem.menuId} menuitem[label="${customItem.label}"]')
                var evt = new MouseEvent('click', {bubbles: true, cancelable: true, view: window})
                el.dispatchEvent(evt)
              `),
              enabled: customItem.disabled === null
            });
          }
        });
        menuItems.push({ type: 'separator' });
      }

      // helper to run a download prompt for media
      const downloadPrompt = (item, win) => {
        var defaultPath = path__default.join(electron.app.getPath('downloads'), path__default.basename(props.srcURL));
        electron.dialog.showSaveDialog({ title: `Save ${props.mediaType} as...`, defaultPath }, filepath => {
          if (filepath) { download(win, props.srcURL, { saveAs: filepath }); }
        });
      };

      // links
      if (props.linkURL && props.mediaType === 'none') {
        menuItems.push({ label: 'Open Link in New Tab', click: (item, win) => win.webContents.send('command', 'file:new-tab', props.linkURL) });
        menuItems.push({ label: 'Copy Link Address', click: () => electron.clipboard.writeText(props.linkURL) });
        menuItems.push({ type: 'separator' });
      }

      // images
      if (props.mediaType == 'image') {
        menuItems.push({ label: 'Save Image As...', click: downloadPrompt });
        menuItems.push({ label: 'Copy Image', click: () => webContents$$1.copyImageAt(props.x, props.y) });
        menuItems.push({ label: 'Copy Image URL', click: () => electron.clipboard.writeText(props.srcURL) });
        menuItems.push({ label: 'Open Image in New Tab', click: (item, win) => win.webContents.send('command', 'file:new-tab', props.srcURL) });
        menuItems.push({ type: 'separator' });
      }

      // videos and audios
      if (props.mediaType == 'video' || props.mediaType == 'audio') {
        menuItems.push({ label: 'Loop', type: 'checkbox', checked: mediaFlags.isLooping, click: () => callOnElement('el.loop = !el.loop') });
        if (mediaFlags.hasAudio) { menuItems.push({ label: 'Muted', type: 'checkbox', checked: mediaFlags.isMuted, click: () => callOnElement('el.muted = !el.muted') }); }
        if (mediaFlags.canToggleControls) { menuItems.push({ label: 'Show Controls', type: 'checkbox', checked: mediaFlags.isControlsVisible, click: () => callOnElement('el.controls = !el.controls') }); }
        menuItems.push({ type: 'separator' });
      }

      // videos
      if (props.mediaType == 'video') {
        menuItems.push({ label: 'Save Video As...', click: downloadPrompt });
        menuItems.push({ label: 'Copy Video URL', click: () => electron.clipboard.writeText(props.srcURL) });
        menuItems.push({ label: 'Open Video in New Tab', click: (item, win) => win.webContents.send('command', 'file:new-tab', props.srcURL) });
        menuItems.push({ type: 'separator' });
      }

      // audios
      if (props.mediaType == 'audio') {
        menuItems.push({ label: 'Save Audio As...', click: downloadPrompt });
        menuItems.push({ label: 'Copy Audio URL', click: () => electron.clipboard.writeText(props.srcURL) });
        menuItems.push({ label: 'Open Audio in New Tab', click: (item, win) => win.webContents.send('command', 'file:new-tab', props.srcURL) });
        menuItems.push({ type: 'separator' });
      }

      // clipboard
      if (props.isEditable) {
        menuItems.push({ label: 'Cut', role: 'cut', enabled: can('Cut') });
        menuItems.push({ label: 'Copy', role: 'copy', enabled: can('Copy') });
        menuItems.push({ label: 'Paste', role: 'paste', enabled: editFlags.canPaste });
        menuItems.push({ type: 'separator' });
      } else if (hasText) {
        menuItems.push({ label: 'Copy', role: 'copy', enabled: can('Copy') });
        menuItems.push({ type: 'separator' });
      }

      // web search
      if (hasText) {
        var searchPreviewStr = props.selectionText.substr(0, 30); // Trim search preview to keep it reasonably sized
        searchPreviewStr = searchPreviewStr.replace(/\s/gi, ' '); // Replace whitespace chars with space
        searchPreviewStr = searchPreviewStr.replace(/[\u061c\u200E\u200f\u202A-\u202E]+/g, ''); // Remove directional text control chars
        if (searchPreviewStr.length < props.selectionText.length) { // Add ellipsis if search preview was trimmed
          searchPreviewStr += '...\"';
        } else {
          searchPreviewStr += '\"';
        }
        var query = 'https://duckduckgo.com/?q=' + encodeURIComponent(props.selectionText.substr(0, 500)); // Limit query to prevent too long query error from DDG
        menuItems.push({ label: 'Search DuckDuckGo for \"' + searchPreviewStr, click: (item, win) => win.webContents.send('command', 'file:new-tab', query) });
        menuItems.push({ type: 'separator' });
      }

      if (!props.linkURL && props.mediaType === 'none' && !hasText) {
        menuItems.push({
          label: 'Back',
          enabled: webContents$$1.canGoBack(),
          click: () => webContents$$1.goBack()
        });
        menuItems.push({
          label: 'Forward',
          enabled: webContents$$1.canGoForward(),
          click: () => webContents$$1.goForward()
        });
        menuItems.push({
          label: 'Reload',
          click: () => webContents$$1.reload()
        });
        menuItems.push({ type: 'separator' });
        if (!props.pageURL.startsWith('beaker://')) {
          menuItems.push({
            label: 'Save Page As...',
            click: () => webContents$$1.downloadURL(props.pageURL, true)
          });
          menuItems.push({ type: 'separator' });
        }
        if (isDat) {
          menuItems.push({
            label: 'View Files',
            click: (item, win) => {
              win.webContents.send('command', 'file:new-tab', 'beaker://library/' + props.pageURL);
            }
          });
          menuItems.push({
            label: 'Network Debugger',
            click: (item, win) => {
              win.webContents.send('command', 'file:new-tab', 'beaker://swarm-debugger/' + props.pageURL);
            }
          });
          menuItems.push({ type: 'separator' });
        }
      }

      // inspector
      menuItems.push({
        label: 'Inspect Element',
        click: item => {
          webContents$$1.inspectElement(props.x, props.y);
          if (webContents$$1.isDevToolsOpened()) { webContents$$1.devToolsWebContents.focus(); }
        }
      });

      // show menu
      var menu = electron.Menu.buildFromTemplate(menuItems);
      menu.popup({window: targetWindow});
    });
  });
}

function getWebContentsWindow (wc) {
  while (wc && wc.hostWebContents) {
    wc = wc.hostWebContents;
  }
  return electron.BrowserWindow.fromWebContents(wc)
}

function setup$11 () {
  electron.app.on('login', async function (e, webContents$$1, request, authInfo, cb) {
    e.preventDefault(); // default is to cancel the auth; prevent that
    var res = await showModal(getWebContentsWindow(webContents$$1), 'basic-auth', authInfo);
    cb(res.username, res.password);
  });
}

const {templates} = beakerCore.dbs;
const {archivesDebugPage, datDnsCachePage, datDnsCacheJS} = beakerCore.dat.debug;
// constants
// =

// content security policies
const BEAKER_CSP = `
  default-src 'self' beaker:;
  img-src beaker-favicon: beaker: data: dat: http: https;
  script-src 'self' beaker:;
  media-src 'self' beaker: dat:;
  style-src 'self' 'unsafe-inline' beaker:;
  child-src 'self';
`.replace(/\n/g, '');

// exported api
// =

function setup$12 () {
  // setup the protocol handler
  electron.protocol.registerStreamProtocol('beaker', beakerProtocol, err => {
    if (err) throw new Error('Failed to create protocol: beaker. ' + err)
  });
}

// internal methods
// =

async function beakerProtocol (request, respond) {
  var cb = once((statusCode, status, contentType, path$$1) => {
    const headers = {
      'Content-Type': (contentType || 'text/html; charset=utf-8'),
      'Content-Security-Policy': BEAKER_CSP,
      'Access-Control-Allow-Origin': '*'
    };
    if (typeof path$$1 === 'string') {
      respond({statusCode, headers, data: fs.createReadStream(path$$1)});
    } else if (typeof path$$1 === 'function') {
      respond({statusCode, headers, data: intoStream(path$$1())});
    } else {
      respond({statusCode, headers, data: intoStream(errorPage(statusCode + ' ' + status))});
    }
  });
  async function serveICO (path$$1, size = 16) {
    // read the file
    const data = await jetpack.readAsync(path$$1, 'buffer');

    // parse the ICO to get the 16x16
    const images = await ICO.parse(data, 'image/png');
    let image = images[0];
    for (let i = 1; i < images.length; i++) {
      if (Math.abs(images[i].width - size) < Math.abs(image.width - size)) {
        image = images[i];
      }
    }

    // serve
    cb(200, 'OK', 'image/png', () => Buffer.from(image.buffer));
  }

  var requestUrl = request.url;
  var queryParams;
  {
    // strip off the hash
    let i = requestUrl.indexOf('#');
    if (i !== -1) requestUrl = requestUrl.slice(0, i);
  }
  {
    // get the query params
    queryParams = url.parse(requestUrl, true).query;

    // strip off the query
    let i = requestUrl.indexOf('?');
    if (i !== -1) requestUrl = requestUrl.slice(0, i);
  }

  // browser ui
  if (requestUrl === 'beaker://shell-window/') {
    return cb(200, 'OK', 'text/html; charset=utf-8', path__default.join(__dirname, 'shell-window.html'))
  }
  if (requestUrl === 'beaker://shell-window/main.js') {
    return cb(200, 'OK', 'application/javascript; charset=utf-8', path__default.join(__dirname, 'shell-window.build.js'))
  }
  if (requestUrl === 'beaker://shell-window/main.css') {
    return cb(200, 'OK', 'text/css; charset=utf-8', path__default.join(__dirname, 'stylesheets/shell-window.css'))
  }
  if (requestUrl === 'beaker://assets/syntax-highlight.js') {
    return cb(200, 'OK', 'application/javascript; charset=utf-8', path__default.join(__dirname, 'assets/js/syntax-highlight.js'))
  }
  if (requestUrl === 'beaker://assets/syntax-highlight.css') {
    return cb(200, 'OK', 'text/css; charset=utf-8', path__default.join(__dirname, 'assets/css/syntax-highlight.css'))
  }
  if (requestUrl === 'beaker://assets/icons.css') {
    return cb(200, 'OK', 'text/css; charset=utf-8', path__default.join(__dirname, 'stylesheets/icons.css'))
  }
  if (requestUrl === 'beaker://assets/font-awesome.css') {
    return cb(200, 'OK', 'text/css; charset=utf-8', path__default.join(__dirname, 'stylesheets/fonts/font-awesome/css/font-awesome.min.css'))
  }
  if (requestUrl === 'beaker://assets/fontawesome-webfont.woff2') {
    return cb(200, 'OK', 'text/css; charset=utf-8', path__default.join(__dirname, 'assets/fonts/fontawesome-webfont.woff2'))
  }
  if (requestUrl === 'beaker://assets/fontawesome-webfont.woff') {
    return cb(200, 'OK', 'text/css; charset=utf-8', path__default.join(__dirname, 'assets/fonts/fontawesome-webfont.woff'))
  }
  if (requestUrl === 'beaker://assets/fontawesome-webfont.svg') {
    return cb(200, 'OK', 'text/css; charset=utf-8', path__default.join(__dirname, 'assets/fonts/fontawesome-webfont.svg'))
  }
  if (requestUrl === 'beaker://assets/font-photon-entypo') {
    return cb(200, 'OK', 'application/font-woff', path__default.join(__dirname, 'assets/fonts/photon-entypo.woff'))
  }
  if (requestUrl === 'beaker://assets/font-source-sans-pro') {
    return cb(200, 'OK', 'application/font-woff2', path__default.join(__dirname, 'assets/fonts/source-sans-pro.woff2'))
  }
  if (requestUrl === 'beaker://assets/font-source-sans-pro-le') {
    return cb(200, 'OK', 'application/font-woff2', path__default.join(__dirname, 'assets/fonts/source-sans-pro-le.woff2'))
  }
  if (requestUrl.startsWith('beaker://assets/logo2')) {
    return cb(200, 'OK', 'image/png', path__default.join(__dirname, 'assets/img/logo2.png'))
  }
  if (requestUrl.startsWith('beaker://assets/logo')) {
    return cb(200, 'OK', 'image/png', path__default.join(__dirname, 'assets/img/logo.png'))
  }
  if (requestUrl.startsWith('beaker://assets/favicons/')) {
    return serveICO(path__default.join(__dirname, 'assets/favicons', requestUrl.slice('beaker://assets/favicons/'.length)))
  }

  // template screenshots
  if (requestUrl.startsWith('beaker://templates/screenshot/')) {
    let templateUrl = requestUrl.slice('beaker://templates/screenshot/'.length);
    templates.getScreenshot(0, templateUrl)
      .then(({screenshot}) => {
        screenshot = screenshot.split(',')[1];
        cb(200, 'OK', 'image/png', () => Buffer.from(screenshot, 'base64'));
      })
      .catch(err => {
        console.error('Failed to load template screenshot', templateUrl, err);
        return cb(404, 'Not Found')
      });
    return
  }

  // builtin pages
  if (requestUrl === 'beaker://assets/builtin-pages.css') {
    return cb(200, 'OK', 'text/css; charset=utf-8', path__default.join(__dirname, 'stylesheets/builtin-pages.css'))
  }
  if (requestUrl.startsWith('beaker://assets/img/onboarding/')) {
    let imgPath = requestUrl.slice('beaker://assets/img/onboarding/'.length);
    return cb(200, 'OK', 'image/svg+xml', path__default.join(__dirname, `assets/img/onboarding/${imgPath}`))
  }
  if (requestUrl.startsWith('beaker://assets/img/templates/')) {
    let imgPath = requestUrl.slice('beaker://assets/img/templates/'.length);
    return cb(200, 'OK', 'image/png', path__default.join(__dirname, `assets/img/templates/${imgPath}`))
  }
  if (requestUrl.startsWith('beaker://assets/ace/') && requestUrl.endsWith('.js')) {
    let filePath = requestUrl.slice('beaker://assets/ace/'.length);
    return cb(200, 'OK', 'application/javascript', path__default.join(__dirname, `assets/js/ace-1.3.3/${filePath}`))
  }
  if (requestUrl === 'beaker://assets/icon/photos.png') {
    return cb(200, 'OK', 'image/png', path__default.join(__dirname, 'assets/img/icon/photos.png'))
  }
  if (requestUrl === 'beaker://assets/icon/avatar.svg') {
    return cb(200, 'OK', 'image/svg+xml', path__default.join(__dirname, 'assets/img/icon/avatar.svg'))
  }
  if (requestUrl === 'beaker://assets/icon/folder-color.png') {
    return cb(200, 'OK', 'image/png', path__default.join(__dirname, 'assets/img/icon/folder-color.png'))
  }
  if (requestUrl === 'beaker://assets/icon/grid.svg') {
    return cb(200, 'OK', 'image/svg+xml', path__default.join(__dirname, 'assets/img/icon/grid.svg'))
  }
  if (requestUrl === 'beaker://assets/icon/star.svg') {
    return cb(200, 'OK', 'image/svg+xml', path__default.join(__dirname, 'assets/img/icon/star.svg'))
  }
  if (requestUrl === 'beaker://assets/icon/filesystem.svg') {
    return cb(200, 'OK', 'image/svg+xml', path__default.join(__dirname, 'assets/img/icon/filesystem.svg'))
  }
  if (requestUrl === 'beaker://assets/icon/history.svg') {
    return cb(200, 'OK', 'image/svg+xml', path__default.join(__dirname, 'assets/img/icon/history.svg'))
  }
  if (requestUrl === 'beaker://assets/icon/gear.svg') {
    return cb(200, 'OK', 'image/svg+xml', path__default.join(__dirname, 'assets/img/icon/gear.svg'))
  }
  if (requestUrl === 'beaker://start/') {
    return cb(200, 'OK', 'text/html; charset=utf-8', path__default.join(__dirname, 'builtin-pages/start.html'))
  }
  if (requestUrl.startsWith('beaker://start/background-image-default')) {
    let imgPath = requestUrl.slice('beaker://start/background-image-default'.length);
    return cb(200, 'OK', 'image/png', path__default.join(__dirname, `assets/img/start${imgPath}`))
  }
  if (requestUrl === 'beaker://start/background-image') {
    return cb(200, 'OK', 'image/png', path__default.join(electron.app.getPath('userData'), 'start-background-image'))
  }
  if (requestUrl === 'beaker://start/main.css') {
    return cb(200, 'OK', 'text/css; charset=utf-8', path__default.join(__dirname, 'stylesheets/builtin-pages/start.css'))
  }
  if (requestUrl === 'beaker://start/main.js') {
    return cb(200, 'OK', 'application/javascript; charset=utf-8', path__default.join(__dirname, 'builtin-pages/build/start.build.js'))
  }
  if (requestUrl === 'beaker://profile/main.js') {
    return cb(200, 'OK', 'application/javascript; charset=utf-8', path__default.join(__dirname, 'builtin-pages/build/profile.build.js'))
  }
  if (requestUrl === 'beaker://profile/' || requestUrl.startsWith('beaker://profile/')) {
    return cb(200, 'OK', 'text/html; charset=utf-8', path__default.join(__dirname, 'builtin-pages/profile.html'))
  }
  if (requestUrl === 'beaker://bookmarks/') {
    return cb(200, 'OK', 'text/html; charset=utf-8', path__default.join(__dirname, 'builtin-pages/bookmarks.html'))
  }
  if (requestUrl === 'beaker://bookmarks/main.js') {
    return cb(200, 'OK', 'application/javascript; charset=utf-8', path__default.join(__dirname, 'builtin-pages/build/bookmarks.build.js'))
  }
  if (requestUrl === 'beaker://history/') {
    return cb(200, 'OK', 'text/html; charset=utf-8', path__default.join(__dirname, 'builtin-pages/history.html'))
  }
  if (requestUrl === 'beaker://history/main.js') {
    return cb(200, 'OK', 'application/javascript; charset=utf-8', path__default.join(__dirname, 'builtin-pages/build/history.build.js'))
  }
  if (requestUrl === 'beaker://downloads/') {
    return cb(200, 'OK', 'text/html; charset=utf-8', path__default.join(__dirname, 'builtin-pages/downloads.html'))
  }
  if (requestUrl === 'beaker://downloads/main.js') {
    return cb(200, 'OK', 'application/javascript; charset=utf-8', path__default.join(__dirname, 'builtin-pages/build/downloads.build.js'))
  }
  if (requestUrl === 'beaker://filesystem/main.css') {
    return cb(200, 'OK', 'text/css; charset=utf-8', path__default.join(__dirname, 'stylesheets/builtin-pages/filesystem.css'))
  }
  if (requestUrl === 'beaker://filesystem/main.js') {
    return cb(200, 'OK', 'application/javascript; charset=utf-8', path__default.join(__dirname, 'builtin-pages/build/filesystem.build.js'))
  }
  if (requestUrl === 'beaker://filesystem/' || requestUrl.startsWith('beaker://filesystem/')) {
    return cb(200, 'OK', 'text/html; charset=utf-8', path__default.join(__dirname, 'builtin-pages/filesystem.html'))
  }
  if (requestUrl === 'beaker://library/main.css') {
    return cb(200, 'OK', 'text/css; charset=utf-8', path__default.join(__dirname, 'stylesheets/builtin-pages/library.css'))
  }
  if (requestUrl === 'beaker://library/main.js') {
    return cb(200, 'OK', 'application/javascript; charset=utf-8', path__default.join(__dirname, 'builtin-pages/build/library.build.js'))
  }
  if (requestUrl === 'beaker://library/view.js') {
    return cb(200, 'OK', 'application/javascript; charset=utf-8', path__default.join(__dirname, 'builtin-pages/build/library-view.build.js'))
  }
  if (requestUrl === 'beaker://library/') {
    return cb(200, 'OK', 'text/html; charset=utf-8', path__default.join(__dirname, 'builtin-pages/library.html'))
  }
  if (requestUrl.startsWith('beaker://library/')) {
    return cb(200, 'OK', 'text/html; charset=utf-8', path__default.join(__dirname, 'builtin-pages/library-view.html'))
  }
  if (requestUrl === 'beaker://install-modal/main.css') {
    return cb(200, 'OK', 'text/css; charset=utf-8', path__default.join(__dirname, 'stylesheets/builtin-pages/install-modal.css'))
  }
  if (requestUrl === 'beaker://install-modal/main.js') {
    return cb(200, 'OK', 'application/javascript; charset=utf-8', path__default.join(__dirname, 'builtin-pages/build/install-modal.build.js'))
  }
  if (requestUrl === 'beaker://install-modal/' || requestUrl.startsWith('beaker://install-modal/')) {
    return cb(200, 'OK', 'text/html; charset=utf-8', path__default.join(__dirname, 'builtin-pages/install-modal.html'))
  }
  if (requestUrl === 'beaker://view-source/main.css') {
    return cb(200, 'OK', 'text/css; charset=utf-8', path__default.join(__dirname, 'stylesheets/builtin-pages/view-source.css'))
  }
  if (requestUrl === 'beaker://view-source/main.js') {
    return cb(200, 'OK', 'application/javascript; charset=utf-8', path__default.join(__dirname, 'builtin-pages/build/view-source.build.js'))
  }
  if (requestUrl === 'beaker://view-source/' || requestUrl.startsWith('beaker://view-source/')) {
    return cb(200, 'OK', 'text/html; charset=utf-8', path__default.join(__dirname, 'builtin-pages/view-source.html'))
  }
  if (requestUrl === 'beaker://swarm-debugger/main.css') {
    return cb(200, 'OK', 'text/css; charset=utf-8', path__default.join(__dirname, 'stylesheets/builtin-pages/swarm-debugger.css'))
  }
  if (requestUrl === 'beaker://swarm-debugger/main.js') {
    return cb(200, 'OK', 'application/javascript; charset=utf-8', path__default.join(__dirname, 'builtin-pages/build/swarm-debugger.build.js'))
  }
  if (requestUrl === 'beaker://swarm-debugger/' || requestUrl.startsWith('beaker://swarm-debugger/')) {
    return cb(200, 'OK', 'text/html; charset=utf-8', path__default.join(__dirname, 'builtin-pages/swarm-debugger.html'))
  }
  if (requestUrl === 'beaker://settings/') {
    return cb(200, 'OK', 'text/html; charset=utf-8', path__default.join(__dirname, 'builtin-pages/settings.html'))
  }
  if (requestUrl === 'beaker://settings/main.js') {
    return cb(200, 'OK', 'application/javascript; charset=utf-8', path__default.join(__dirname, 'builtin-pages/build/settings.build.js'))
  }

  // modals
  if (requestUrl === 'beaker://basic-auth-modal/') {
    return cb(200, 'OK', 'text/html; charset=utf-8', path__default.join(__dirname, 'builtin-pages/basic-auth-modal.html'))
  }
  if (requestUrl === 'beaker://basic-auth-modal/main.css') {
    return cb(200, 'OK', 'text/css; charset=utf-8', path__default.join(__dirname, 'stylesheets/builtin-pages/basic-auth-modal.css'))
  }
  if (requestUrl === 'beaker://basic-auth-modal/main.js') {
    return cb(200, 'OK', 'application/javascript; charset=utf-8', path__default.join(__dirname, 'builtin-pages/build/basic-auth-modal.build.js'))
  }
  if (requestUrl === 'beaker://prompt-modal/') {
    return cb(200, 'OK', 'text/html; charset=utf-8', path__default.join(__dirname, 'builtin-pages/prompt-modal.html'))
  }
  if (requestUrl === 'beaker://prompt-modal/main.css') {
    return cb(200, 'OK', 'text/css; charset=utf-8', path__default.join(__dirname, 'stylesheets/builtin-pages/prompt-modal.css'))
  }
  if (requestUrl === 'beaker://prompt-modal/main.js') {
    return cb(200, 'OK', 'application/javascript; charset=utf-8', path__default.join(__dirname, 'builtin-pages/build/prompt-modal.build.js'))
  }

  // debugging
  if (requestUrl === 'beaker://internal-archives/') {
    return cb(200, 'OK', 'text/html; charset=utf-8', archivesDebugPage)
  }
  if (requestUrl === 'beaker://dat-dns-cache/') {
    return cb(200, 'OK', 'text/html; charset=utf-8', datDnsCachePage)
  }
  if (requestUrl === 'beaker://dat-dns-cache/main.js') {
    return cb(200, 'OK', 'application/javascript; charset=utf-8', datDnsCacheJS)
  }
  if (requestUrl.startsWith('beaker://debug-log/')) {
    const PAGE_SIZE = 1e6;
    var start = queryParams.start ? (+queryParams.start) : 0;
    let content = await getLogFileContent(start, start + PAGE_SIZE);
    var pagination = '';
    if (content.length === PAGE_SIZE + 1 || start !== 0) {
      pagination = `<h2>Showing bytes ${start} - ${start + PAGE_SIZE}. <a href="beaker://debug-log/?start=${start + PAGE_SIZE}">Next page</a></h2>`;
    }
    return respond({
      statusCode: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Security-Policy': BEAKER_CSP,
        'Access-Control-Allow-Origin': '*'
      },
      data: intoStream(`
        ${pagination}
        <pre>${content}</pre>
        ${pagination}
      `)
    })
  }

  return cb(404, 'Not Found')
}

/**
 * beaker-favicon:
 *
 * Helper protocol to serve site favicons from the sitedata db.
 **/

const {dat: dat$2} = beakerCore;
const {sitedata: sitedata$1} = beakerCore.dbs;
function setup$13 () {
  // load default favicon
  var defaultFaviconBuffer = -6; // not found, till we load it
  fs.readFile(path__default.join(__dirname, './assets/img/default-favicon.png'), (err, buf) => {
    if (err) { console.error('Failed to load default favicon', path__default.join(__dirname, './assets/img/default-favicon.png'), err); }
    if (buf) { defaultFaviconBuffer = buf; }
  });

  // detect if is retina
  let display = electron.screen.getPrimaryDisplay();
  const isRetina = display.scaleFactor >= 2;

  // register favicon protocol
  electron.protocol.registerBufferProtocol('beaker-favicon', async (request, cb) => {
    // parse the URL
    let {url: url$$1, faviconSize} = parseBeakerFaviconURL(request.url);
    if (isRetina) {
      faviconSize *= 2;
    }

    // if a dat, see if there's a favicon.ico or .png
    try {
      let data, fs$$1;
      // pick the filesystem
      let datResolvedUrl = url$$1;
      if (url$$1.startsWith('dat://')) {
        datResolvedUrl = await dat$2.dns.resolveName(url$$1);
        fs$$1 = dat$2.library.getArchive(datResolvedUrl); // (only try if the dat is loaded)
      }
      if (fs$$1) {
        // try .ico
        try {
          data = await pda.readFile(fs$$1, '/favicon.ico', 'binary');
          if (data) {
            // select the best-fitting size
            let images = await ICO.parse(data, 'image/png');
            let image = images[0];
            for (let i = 1; i < images.length; i++) {
              if (Math.abs(images[i].width - faviconSize) < Math.abs(image.width - faviconSize)) {
                image = images[i];
              }
            }
            let buf = Buffer.from(image.buffer);
            sitedata$1.set(url$$1, 'favicon', `data:image/png;base64,${buf.toString('base64')}`); // cache
            return cb({mimeType: 'image/png', data: buf})
          }
        } catch (e) {
          // .ico failed, ignore
          data = null;
        }

        // try .png
        data = await pda.readFile(fs$$1, '/favicon.png', 'binary');
        if (data) {
          sitedata$1.set(url$$1, 'favicon', `data:image/png;base64,${data.toString('base64')}`); // cache
          return cb({mimeType: 'image/png', data})
        }
      }
    } catch (e) {
      // ignore
    }

    try {
      // look up in db
      let data = await sitedata$1.get(url$$1, 'favicon');
      if (data) {
        // `data` is a data url ('data:image/png;base64,...')
        // so, skip the beginning and pull out the data
        data = data.split(',')[1];
        if (data) {
          return cb({ mimeType: 'image/png', data: Buffer.from(data, 'base64') })
        }
      }
    } catch (e) {
      // ignore
    }

    cb({ mimeType: 'image/png', data: defaultFaviconBuffer });
  }, e => {
    if (e) { console.error('Failed to register beaker-favicon protocol', e); }
  });
}

const BEAKER_FAVICON_URL_RE = /^beaker-favicon:(\d*),?(.*)/;
function parseBeakerFaviconURL (str) {
  const match = BEAKER_FAVICON_URL_RE.exec(str);
  let res = {
    faviconSize: (+match[1]) || 16,
    url: match[2]
  };
  // special case: in beaker://library, use the dat being viewed
  if (res.url.startsWith('beaker://library/dat://')) {
    res.url = res.url.slice('beaker://library/'.length);
  }
  return res
}

// exported api
// =

function setup$14 () {
  console.log('Test driver enabled, listening for messages');
  process.on('message', onMessage);
}

// internal methods
// =

async function onMessage ({msgId, cmd, args}) {
  var method = METHODS[cmd];
  if (!method) method = () => new Error('Invalid method: ' + cmd);
  try {
    var resolve = await method(...args);
    process.send({msgId, resolve});
  } catch (err) {
    var reject = {
      message: err.message,
      stack: err.stack,
      name: err.name
    };
    process.send({msgId, reject});
  }
}

const METHODS = {
  isReady () {
    return new Promise(resolve => electron.ipcMain.once('shell-window:ready', () => resolve()))
  },

  newTab () {
    return execute(`
      var index = pages.getAll().length
      page = pages.create()
      pages.setActive(page)
      index
    `)
  },

  navigateTo (page, url$$1) {
    return execute(`
      var page = pages.get(${page})
      page.navbarEl.querySelector('.nav-location-input').value = "${url$$1}"
      page.navbarEl.querySelector('.nav-location-input').blur()
      page.loadURL("${url$$1}")
    `)
  },

  getUrl (page) {
    return execute(`
      var page = pages.get(${page})
      page.getURL()
    `)
  },

  async executeJavascriptInShell (js) {
    var res = await execute(js);
    return res
  },

  async executeJavascriptOnPage (page, js) {
    var res = await execute(`
      var page = pages.get(${page})
      page.webviewEl.getWebContents().executeJavaScript(\`` + js + `\`)
    `);
    return res
  }
};

function execute (js) {
  var win = getActiveWindow();
  return win.webContents.executeJavaScript(js)
}

Error.stackTraceLimit = Infinity;
// This is main process of Electron, started as first thing when your
// app starts. This script is running through entire life of your application.
// It doesn't have any windows which you can see on screen, but we can open
// window from here.

const DISALLOWED_SAVE_PATH_NAMES = [
  'home',
  'desktop',
  'documents',
  'downloads',
  'music',
  'pictures',
  'videos'
];

// setup
// =

// read config from env vars
setup$1();
if (beakerCore.getEnvVar('BEAKER_USER_DATA_PATH')) {
  console.log('User data path set by environment variables');
  console.log('userData:', beakerCore.getEnvVar('BEAKER_USER_DATA_PATH'));
  electron.app.setPath('userData', beakerCore.getEnvVar('BEAKER_USER_DATA_PATH'));
}
if (beakerCore.getEnvVar('BEAKER_TEST_DRIVER')) {
  setup$14();
}

// configure the protocols
electron.protocol.registerStandardSchemes(['dat', 'beaker'], { secure: true });

// handle OS event to open URLs
electron.app.on('open-url', (e, url$$1) => {
  e.preventDefault(); // we are handling it
  // wait for ready (not waiting can trigger errors)
  if (electron.app.isReady()) open(url$$1);
  else electron.app.on('ready', () => open(url$$1));
});

electron.app.on('ready', async function () {
  // setup core
  await beakerCore.setup({
    // paths
    userDataPath: electron.app.getPath('userData'),
    homePath: electron.app.getPath('home'),
    templatesPath: path.join(__dirname, 'assets', 'templates'),
    disallowedSavePaths: DISALLOWED_SAVE_PATH_NAMES.map(path$$1 => electron.app.getPath(path$$1)),

    // APIs
    permsAPI: permissions,
    uiAPI: {showModal: showShellModal},
    rpcAPI: rpc,
    downloadsWebAPI: WEBAPI$1,
    browserWebAPI: WEBAPI
  });

  // base
  setup$2();
  setup$9();
  setup$10();

  // ui
  setup$5();
  registerContextMenu();
  setup$4();
  setup$8();
  setup$6();
  setup$7();
  setup$11();

  // protocols
  setup$12();
  setup$13();
  electron.protocol.registerStreamProtocol('dat', beakerCore.dat.protocol.electronHandler, err => {
    if (err) {
      console.error(err);
      throw new Error('Failed to create protocol: dat')
    }
  });

  // configure chromium's permissions for the protocols
  electron.protocol.registerServiceWorkerSchemes(['dat']);
});

// only run one instance
const isSecondInstance = electron.app.makeSingleInstance((argv, workingDirectory) => {
  handleArgv(argv);

  // focus/create a window
  ensureOneWindowExists();
  getActiveWindow().focus();
});
if (isSecondInstance) {
  electron.app.exit();
} else {
  handleArgv(process.argv);
}
function handleArgv (argv) {
  if (process.platform !== 'darwin') {
    // look for URLs, windows & linux use argv instead of open-url
    let url$$1 = argv.find(v => v.indexOf('://') !== -1);
    if (url$$1) {
      open(url$$1);
    }
  }
}

}());