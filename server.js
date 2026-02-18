const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3000;
const SAVE_FILE = path.join(__dirname, 'story_planner_data.json');

const server = http.createServer((req, res) => {
  // Serve the HTML file
  if (req.method === 'GET' && (req.url === '/' || req.url === '/story_planner.html')) {
    const html = fs.readFileSync(path.join(__dirname, 'story_planner.html'), 'utf8');
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(html);
    return;
  }

  // Load saved data
  if (req.method === 'GET' && req.url === '/api/data') {
    if (fs.existsSync(SAVE_FILE)) {
      const data = fs.readFileSync(SAVE_FILE, 'utf8');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(data);
    } else {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{}');
    }
    return;
  }

  // Save data
  if (req.method === 'POST' && req.url === '/api/data') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        JSON.parse(body); // validate JSON
        fs.writeFileSync(SAVE_FILE, body, 'utf8');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{"ok":true}');
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end('{"error":"Invalid JSON"}');
      }
    });
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, () => {
  console.log(`Story Planner running at http://localhost:${PORT}`);
});
