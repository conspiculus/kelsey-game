const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || __dirname;
const SAVE_FILE = path.join(DATA_DIR, 'story_planner_data.json');
const SITE_PASSWORD = process.env.SITE_PASSWORD || 'kelsey2026';

// --- Data helpers ---

const STARTER_TEXT = "The story begins with a woman looking through a castle window across the plains to a distant mountain range. This is Kelsey, Lord Lady of the Castle Eyrie, In the Northern Wastes. The time has come for Her to return to her ancestral homeland in the Misty Mountains. Many perils await her on this journey and she will need help from her friends along the way, but first...";

function readData() {
  if (!fs.existsSync(SAVE_FILE)) {
    const seed = {
      users: {},
      fields: { a1_story: [{ userId: 'system', text: STARTER_TEXT }] },
      version: 1,
    };
    writeData(seed);
    return seed;
  }
  const raw = JSON.parse(fs.readFileSync(SAVE_FILE, 'utf8'));

  // Already in new format
  if (raw.users && raw.fields && typeof raw.version === 'number') {
    return raw;
  }

  // Migrate old flat format: { fieldId: "text", ... }
  const migrated = { users: {}, fields: {}, version: 1 };
  const migratorId = 'user_migrated';
  migrated.users[migratorId] = { name: 'Original Author', color: '#c9a84c' };

  for (const [fieldId, text] of Object.entries(raw)) {
    if (typeof text === 'string' && text.length > 0) {
      migrated.fields[fieldId] = [{ userId: migratorId, text }];
    }
  }

  // Save migrated data
  fs.writeFileSync(SAVE_FILE, JSON.stringify(migrated, null, 2), 'utf8');
  return migrated;
}

function writeData(data) {
  fs.writeFileSync(SAVE_FILE, JSON.stringify(data, null, 2), 'utf8');
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try { resolve(JSON.parse(body)); }
      catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

function sendJSON(res, status, obj) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(JSON.stringify(obj));
}

function checkAuth(req) {
  const auth = req.headers['authorization'] || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  return token === SITE_PASSWORD;
}

// --- Server ---

const server = http.createServer(async (req, res) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    });
    res.end();
    return;
  }

  // Serve the HTML file
  if (req.method === 'GET' && (req.url === '/' || req.url === '/story_planner.html')) {
    const html = fs.readFileSync(path.join(__dirname, 'story_planner.html'), 'utf8');
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(html);
    return;
  }

  // POST /api/auth — verify password
  if (req.method === 'POST' && req.url === '/api/auth') {
    try {
      const { password } = await parseBody(req);
      if (password === SITE_PASSWORD) {
        sendJSON(res, 200, { ok: true });
      } else {
        sendJSON(res, 401, { error: 'Wrong password' });
      }
    } catch (e) {
      sendJSON(res, 400, { error: 'Invalid JSON' });
    }
    return;
  }

  // Auth check for all other API routes
  if (req.url.startsWith('/api/')) {
    if (!checkAuth(req)) {
      sendJSON(res, 401, { error: 'Unauthorized' });
      return;
    }
  }

  // GET /api/data — return full data
  if (req.method === 'GET' && req.url === '/api/data') {
    const data = readData();
    sendJSON(res, 200, data);
    return;
  }

  // GET /api/version — lightweight polling
  if (req.method === 'GET' && req.url === '/api/version') {
    const data = readData();
    sendJSON(res, 200, { version: data.version });
    return;
  }

  // POST /api/users — register a user
  if (req.method === 'POST' && req.url === '/api/users') {
    try {
      const { userId, name, color } = await parseBody(req);
      if (!userId || !name || !color) {
        sendJSON(res, 400, { error: 'Missing userId, name, or color' });
        return;
      }
      const data = readData();
      data.users[userId] = { name, color };
      data.version++;
      writeData(data);
      sendJSON(res, 200, { ok: true });
    } catch (e) {
      sendJSON(res, 400, { error: 'Invalid JSON' });
    }
    return;
  }

  // POST /api/save — save segments for a field
  if (req.method === 'POST' && req.url === '/api/save') {
    try {
      const { userId, fieldId, segments } = await parseBody(req);
      if (!userId || !fieldId || !Array.isArray(segments)) {
        sendJSON(res, 400, { error: 'Missing userId, fieldId, or segments array' });
        return;
      }

      const data = readData();

      // Validate: no other user's text was deleted
      const existing = data.fields[fieldId] || [];
      for (const oldSeg of existing) {
        if (oldSeg.userId !== userId && oldSeg.userId !== 'system') {
          // Find this segment's text somewhere in the new segments
          const found = segments.some(
            s => s.userId === oldSeg.userId && s.text === oldSeg.text
          );
          if (!found) {
            sendJSON(res, 409, {
              error: 'Cannot delete or modify another user\'s text',
            });
            return;
          }
        }
      }

      data.fields[fieldId] = segments;
      data.version++;
      writeData(data);
      sendJSON(res, 200, { ok: true, version: data.version });
    } catch (e) {
      sendJSON(res, 400, { error: 'Invalid JSON' });
    }
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, () => {
  console.log(`Story Planner running at http://localhost:${PORT}`);
});
