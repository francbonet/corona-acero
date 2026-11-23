/**
 * Versión de escritorio con Electron: una ventana que carga el build de Vite (dist/).
 *
 * El juego se sirve por un protocolo propio (corona://juego/…) en vez de file://: así los módulos de JavaScript
 * cargan sin problemas de origen, y las partidas guardadas (IndexedDB) tienen un origen fijo que no cambia de
 * una versión a otra. Se guardan en la carpeta de datos de la aplicación.
 *
 * `electron . --smoke-test` abre el juego sin mostrar la ventana, comprueba que el menú se ha dibujado sin
 * errores y sale con código 0 (o 1 si algo falla). Con `--captura=fichero.png`, guarda además una captura, y
 * con `--ruta=index.html?seed=prueba` abre esa ruta del juego (por ejemplo, una partida) en vez del menú.
 */
const { app, BrowserWindow, Menu, net, protocol, shell } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const SCHEME = 'corona';
const HOST = 'juego';
const START_URL = `${SCHEME}://${HOST}/index.html`;
const DIST = path.join(__dirname, '..', 'dist');
const SMOKE = process.argv.includes('--smoke-test');
const CAPTURE = process.argv.find((a) => a.startsWith('--captura='))?.slice('--captura='.length);
const ROUTE = process.argv.find((a) => a.startsWith('--ruta='))?.slice('--ruta='.length);

protocol.registerSchemesAsPrivileged([
  { scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);

/** Sirve los ficheros de dist/ (y nada fuera de esa carpeta). */
function serveDist() {
  protocol.handle(SCHEME, (request) => {
    const { pathname } = new URL(request.url);
    const file = path.normalize(path.join(DIST, decodeURIComponent(pathname === '/' ? '/index.html' : pathname)));
    if (!file.startsWith(DIST + path.sep)) return new Response('Fuera del juego', { status: 403 });
    return net.fetch(pathToFileURL(file).toString());
  });
}

/** Menú: en macOS, el de la aplicación (salir, ocultar, pantalla completa); en el resto, ninguno. */
function setupMenu() {
  if (process.platform !== 'darwin') {
    Menu.setApplicationMenu(null);
    return;
  }
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: app.name,
        submenu: [
          { role: 'about', label: `Acerca de ${app.name}` },
          { type: 'separator' },
          { role: 'hide', label: `Ocultar ${app.name}` },
          { role: 'hideOthers', label: 'Ocultar otros' },
          { role: 'unhide', label: 'Mostrar todo' },
          { type: 'separator' },
          { role: 'quit', label: `Salir de ${app.name}` },
        ],
      },
      { label: 'Edición', submenu: [{ role: 'copy', label: 'Copiar' }, { role: 'paste', label: 'Pegar' }, { role: 'selectAll', label: 'Seleccionar todo' }] },
      { label: 'Visualización', submenu: [{ role: 'togglefullscreen', label: 'Pantalla completa' }, { role: 'reload', label: 'Recargar' }] },
      { label: 'Ventana', submenu: [{ role: 'minimize', label: 'Minimizar' }, { role: 'zoom', label: 'Zoom' }, { role: 'close', label: 'Cerrar' }] },
    ]),
  );
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: 'Corona y Acero',
    backgroundColor: '#0c0806',
    autoHideMenuBar: true,
    show: false,
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      // La música y los efectos suenan desde el principio, sin esperar al primer clic.
      autoplayPolicy: 'no-user-gesture-required',
    },
  });

  if (!SMOKE) win.once('ready-to-show', () => win.show());

  // Los enlaces de fuera del juego se abren en el navegador.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (url.startsWith(`${SCHEME}://`)) return;
    event.preventDefault();
    if (/^https?:/.test(url)) void shell.openExternal(url);
  });

  // F11: pantalla completa (también en Windows y Linux, que no tienen menú).
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') {
      win.setFullScreen(!win.isFullScreen());
      event.preventDefault();
    }
  });

  if (SMOKE) smokeTest(win);
  void win.loadURL(SMOKE && ROUTE ? `${SCHEME}://${HOST}/${ROUTE.replace(/^\//, '')}` : START_URL);
  return win;
}

/** Prueba de humo: el juego carga, dibuja el menú y no da errores en la consola. */
function smokeTest(win) {
  const errors = [];
  win.webContents.on('console-message', (event) => {
    if (event.level === 'error') errors.push(event.message);
  });
  win.webContents.on('did-fail-load', (_e, code, description) => errors.push(`No carga (${code}): ${description}`));
  win.webContents.once('did-finish-load', () => {
    setTimeout(async () => {
      let menu = false;
      try {
        // En el menú, sus botones; en una partida, el lienzo del juego.
        menu = await win.webContents.executeJavaScript("!!document.querySelector('#menu-root button, canvas')");
      } catch (e) {
        errors.push(String(e));
      }
      if (CAPTURE) {
        const image = await win.webContents.capturePage();
        require('node:fs').writeFileSync(CAPTURE, image.toPNG());
      }
      const ok = menu && errors.length === 0;
      process.stdout.write(`${JSON.stringify({ ok, menu, errors })}\n`);
      app.exit(ok ? 0 : 1);
    }, ROUTE ? 5000 : 2500);
  });
}

if (!SMOKE && !app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const [win] = BrowserWindow.getAllWindows();
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
  app.whenReady().then(() => {
    serveDist();
    setupMenu();
    createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
  app.on('window-all-closed', () => app.quit());
}
