console.log(`Currently this wrapper is only used in prod, if you're running locally please use npm run dev`)

import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

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
console.log(' - -')
console.log(fourOhFourContents)
console.log(' - -')
const ERROR_PAGE_STYLESHEET_URL = fourOhFourContents.match(/<link rel="stylesheet" href="([^"]+)"/)[1];

const staticRedirects = {
  '/': '/latest/',
  '/latest': '/latest/',
}

function redirect(res, url, code = 'unknown') {
  console.log('redirecting to', url, code);
  res.redirect(302, url)
}

function getErrorPage(type, message) {
  return ERROR_PAGE_TEMPLATE.replaceAll('{{ERROR_TYPE}}', type).replaceAll('{{ERROR_MESSAGE}}', message).replaceAll('{{STYLESHEET_URL}}', ERROR_PAGE_STYLESHEET_URL);
}

app.use((req, _res, next) => {
  if (staticRedirects.hasOwnProperty(req.path)) {
    return redirect(_res, staticRedirects[req.path], 'staticRedirect');
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

app.use(async (req, res, next) => {
  const url = req.path;
  const filePathFromUrl = path.join(BUILD_DIR, url);
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
  res.status(500).send('Internal Server Error', 'Something went wrong on our side, sorry.');
})

// app.get('*', (_req, res) => res.sendFile(path.join(BUILD_DIR, 'index.html')));

app.listen(PORT, () =>
  console.log(`[wrapper] Prod server listening on http://localhost:${PORT}`)
);
