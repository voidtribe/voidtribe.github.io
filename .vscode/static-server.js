const fs = require('fs');
const http = require('http');
const path = require('path');

const rootDir = process.cwd();
const port = Number(process.argv[2] || 8080);

const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.webp': 'image/webp'
};

function send(response, statusCode, body, contentType) {
  response.writeHead(statusCode, { 'Content-Type': contentType });
  response.end(body);
}

function resolvePath(urlPath) {
  const decodedPath = decodeURIComponent((urlPath || '/').split('?')[0]);
  const normalizedPath = path.normalize(decodedPath).replace(/^([.][.][\\/])+/, '');
  const relativePath = normalizedPath.replace(/^([\\/])+/, '');
  return path.join(rootDir, relativePath);
}

const server = http.createServer((request, response) => {
  let filePath = resolvePath(request.url);

  fs.stat(filePath, (statError, stats) => {
    if (!statError && stats.isDirectory()) {
      filePath = path.join(filePath, 'index.html');
    }

    fs.readFile(filePath, (readError, data) => {
      if (readError) {
        if (readError.code === 'ENOENT') {
          send(response, 404, 'Not found', 'text/plain; charset=utf-8');
          return;
        }

        send(response, 500, 'Internal server error', 'text/plain; charset=utf-8');
        return;
      }

      const extension = path.extname(filePath).toLowerCase();
      const contentType = mimeTypes[extension] || 'application/octet-stream';
      response.writeHead(200, { 'Content-Type': contentType });
      response.end(data);
    });
  });
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Serving HTTP on http://127.0.0.1:${port}`);
});