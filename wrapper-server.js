console.log(`Currently this wrapper is only used in prod, if you're running locally please use npm run dev`)

import express from 'express';
import path from 'node:path';
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const {PORT} = process.env;

if (!PORT) {
  throw new Error('PORT environment variable is not set');
}

const app = express();

const BUILD_DIR = path.join(__dirname, 'build');
const ERROR_PAGE_PATH = path.join(__dirname, 'error.html');
const ERROR_PAGE_TEMPLATE = await fs.readFile(ERROR_PAGE_PATH, 'utf-8');
const fourOhFourContents = await fs.readFile(path.join(BUILD_DIR, '404.html'), 'utf-8');
const ERROR_PAGE_STYLESHEET_URL = fourOhFourContents.match(/<link rel="stylesheet" href="([^"]+)"/)[1];

const staticRedirects = {
  '/': '/latest/',
  '/latest': '/latest/',
  '/0.x': '/0.x/',
  '/plugins': '/latest/plugins',
  '/build-a-plugin': '/latest/plugins/create-plugin',
}

const v0xRedirects = {
  '/variants/creating-variants': '/variants/creating-variants/create-a-variant',
  '/try-demo-prototype': '/getting-started/try-demo-prototype',
  '/setup': '/getting-started/setup',
  '/prototyping/nunjucks': '/prototypes/nunjucks',
  '/prototyping/create-prototype': '/getting-started/try-demo-prototype',
  '/prototyping': '/prototypes'
}

const notYetImplementedRedirects = [
  '/routers/create-routes',
  '/nunjucks/filters',
  '/in-browser-javascript',
  '/sass',
  '/nunjucks/how-to-use-layouts',
  ...[
    '0.0.1',
    '0.0.2',
    '0.0.3',
    '0.0.4',
    '0.0.5',
    '0.0.6',
    '0.0.7',
    '0.0.8',
    '0.1.0',
  ].map(version => `/adaptors/govuk-frontend-adaptor/${version}`)
]

function redirect(res, url, code = 'unknown') {
  console.log('redirecting to', url, code);
  res.redirect(302, url)
}

function getErrorPage(type, message) {
  return ERROR_PAGE_TEMPLATE.replaceAll('{{ERROR_TYPE}}', type).replaceAll('{{ERROR_MESSAGE}}', message).replaceAll('{{STYLESHEET_URL}}', ERROR_PAGE_STYLESHEET_URL);
}

app.use((req, res, next) => {
  const searchElement = ['', ...req.path.split('/').slice(2)].join('/');
  if (notYetImplementedRedirects.includes(searchElement)) {
    console.log('Not yet implemented redirect for', req.originalUrl);
    return redirect(res, '/latest/not-implemented', 'notYetImplementedRedirect');
  }
  next()
})

app.use((req, res, next) => {
  const splitPath = req.path.split('/');
  const firstPathItem = splitPath[1];
  if (firstPathItem === '0.x' || firstPathItem.split('-')[0].match(/^[0-9]+\.[0-9]+\.[0-9]+$/)) {
    console.log('Detected versioned path, redirecting to latest', req.originalUrl);
    return redirect(res, ['', 'latest', ...splitPath.slice(2)].join('/'), 'versionedRedirect');
  }
  next()
})

app.use((req, _res, next) => {
  if (staticRedirects.hasOwnProperty(req.path)) {
    return redirect(_res, staticRedirects[req.path], 'staticRedirect (global)');
  }
  const firstPathPart = req.path.split('/')[1];
  const remaining = req.originalUrl.slice(firstPathPart.length + 1);
  if (['latest', '0.x'].includes(firstPathPart) && v0xRedirects.hasOwnProperty(remaining)) {
    return redirect(_res, `/${firstPathPart}${v0xRedirects[remaining]}`, 'staticRedirect (0.x or latest)');
  }
  next();
});

function rewriteFilePathIfNeeded(urlPath) {
  if (urlPath === path.join(BUILD_DIR, '/favicon.ico')) {
    return path.join(BUILD_DIR, '/img/favicon.ico');
  }
  return urlPath;
}

app.use((req, res, next) => {
  if (req.path.endsWith('.html')) {
    res.redirect(302, req.path.slice(0, -5));
  } else {
    next()
  }
})

function getFilePathFromUrl(url) {
// This is the ideal for later, but it fails because of the client-side routing in Docusaurus
//   if (url.startsWith('/0.x/')) {
//     return path.join(BUILD_DIR, url.replace('/0.x/', '/latest/'));
//   }
  return path.join(BUILD_DIR, url);
}

app.use(async (req, res, next) => {
  const url = req.path;
  const filePathFromUrl = getFilePathFromUrl(url);
  if (!path.normalize(filePathFromUrl).startsWith(BUILD_DIR) || filePathFromUrl.includes('../')) {
    return next(new Error('suspected path injection'))
  }
  const filePath = rewriteFilePathIfNeeded(filePathFromUrl);
  const type = await fs.stat(filePath).then((stats) => {
    if (stats.isFile()) {
      return 'FILE';
    }
    if (stats.isDirectory()) {
      return 'DIRECTORY';
    }
    return 'NOT_FOUND';
  }).catch((err) => (err.code === 'ENOENT' || err.name === 'NotFoundError') ? 'NOT_FOUND' : err);

  if (type === 'FILE') {
    return res.sendFile(filePath);
  }
  if (type === 'DIRECTORY') {
    const indexFilePath = path.join(filePath, 'index.html');
    return res.sendFile(indexFilePath);
  }
  if (type === 'NOT_FOUND') {
    return next();
  }
  console.error('Should not be able to get here (a)', req.path, filePathFromUrl, type)
  next(type || new Error('Unknown file stat error'));
})

app.use((req, res, next) => {
  res.status(404).send(getErrorPage('Not found', `The requested URL was not found on this server.`));
})

app.use((err, _req, res, _next) => {
  console.error(err)
  res.status(500).send(getErrorPage('Internal Server Error', `Something went wrong on our side, we have logged the problem.`));
})

// app.get('*', (_req, res) => res.sendFile(path.join(BUILD_DIR, 'index.html')));

app.listen(PORT, () =>
  console.log(`[wrapper] Prod server listening on http://localhost:${PORT}`)
);
