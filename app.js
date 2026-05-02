require('dotenv').config();
const OpenAI = require('openai');

const express = require('express');
const axios = require('axios');
const jwt = require('jsonwebtoken');

// middleware → čtení cookies z requestu
const cookieParser = require('cookie-parser');

const app = express(); // 👈 1. vytvoříš app

app.use(express.json()); // 👈 2. pak middleware
app.use(cookieParser());

const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const JWT_SECRET = process.env.JWT_SECRET;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// middleware → debug
function auth(req, res, next) {
  console.log('AUTH HIT:', req.path);

  const token = req.cookies.token;

  if (!token) {
    return res.send('Chybí token');
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    res.send('Neplatný token');
  }
}
function requireRole(role) {
  return (req, res, next) => {
    if (req.user.role !== role) {
      return res.status(403).send('Forbidden');
    }
    next();
  };
}

// Home
app.get('/', (req, res) => {
  res.send(`<a href="/login">Login přes GitHub</a>`);
});
console.log('LOGIN ROUTE REGISTERED');

// login → přesměrování na GitHub OAuth
app.get('/login', (req, res) => {
  const redirect = `https://github.com/login/oauth/authorize?client_id=${CLIENT_ID}&scope=user`;
  res.redirect(redirect);
});

// test route → ověření že routing funguje
app.get('/test', (req, res) => {
  res.send('funguje');
});

// callback → GitHub vrátí code → vytvoření JWT → uložení do cookie → redirect
app.get('/callback', async (req, res) => {
  console.log('CALLBACK HIT');

  const code = req.query.code;

  const tokenRes = await axios.post(
    'https://github.com/login/oauth/access_token',
    {
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      code: code,
    },
    {
      headers: { Accept: 'application/json' },
    },
  );

  const accessToken = tokenRes.data.access_token;

  const userRes = await axios.get('https://api.github.com/user', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  const githubUser = userRes.data;

  console.log('GITHUB USER:', githubUser);

  // ROLE LOGIKA
  let role = 'user';

  if (githubUser.login.toLowerCase() === 'martinakolarova') {
    role = 'admin';
  }

  // JWT
  const token = jwt.sign(
    {
      user: githubUser.login,
      role: role,
      has2FA: githubUser.two_factor_authentication,
      accessToken: accessToken, // TADY JE TEN KLÍČ
    },
    JWT_SECRET,
    { expiresIn: '1h' },
  );

  // uloží token do cookie
  res.cookie('token', token, {
    httpOnly: true,
  });

  // přesměruje na dashboard
  res.redirect('/dashboard');
});

// Protected route (JWT)
app.get('/protected', auth, (req, res) => {
  res.send(`Ahoj ${req.user.user}`);
});

// Chráněná routa – dostupná jen pro uživatele s platným JWT tokenem
app.get('/dashboard', auth, (req, res) => {
  res.send(
    `Dashboard pro ${req.user.user} | role: ${req.user.role} | 2FA: ${req.user.has2FA}`,
  );
});

app.get('/admin', auth, requireRole('admin'), (req, res) => {
  res.send('Admin only page');
});

// endpoint → vrátí GitHub repozitáře přihlášeného uživatele
app.get('/api/repos', auth, async (req, res) => {
  console.log('API REPOS HIT');

  const githubAccessToken = req.user.accessToken;

  if (!githubAccessToken) {
    return res.status(401).send('No GitHub token');
  }

  try {
    let allRepos = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const response = await axios.get(
        `https://api.github.com/user/repos?per_page=100&page=${page}`,
        {
          headers: {
            Authorization: `Bearer ${githubAccessToken}`,
          },
        },
      );

      allRepos = allRepos.concat(response.data);

      if (response.data.length < 100) {
        hasMore = false;
      } else {
        page++;
      }
    }

    res.json(allRepos);
  } catch (err) {
    console.error('GitHub API error:', err.message);
    res.status(500).send('Chyba při volání GitHub API');
  }
});

function getFallbackIntent(message) {
  const text = message.toLowerCase();

  if (text.includes('detail') || text.includes('info')) {
    return 'repo_detail';
  }

  if (text.includes('repo') || text.includes('projekt')) {
    return 'get_repos';
  }

  return 'unknown';
}

app.post('/api/chat', auth, async (req, res) => {
  const message = req.body.message;

  const fallbackIntent = getFallbackIntent(message);
  let intent = fallbackIntent;

  try {
    const aiResponse = await openai.responses.create({
      model: 'gpt-4.1-mini',
      input: `User says: "${message}". 
Return ONLY JSON:
{ "intent": "get_repos" } 
or { "intent": "repo_detail" }
or { "intent": "unknown" }`,
    });

    const text = aiResponse.output_text;
    const parsed = JSON.parse(text);
    intent = parsed.intent;
  } catch (err) {
    console.log('AI fallback aktivní:', err.code || err.message);
  }

  // GET REPOS
  if (intent === 'get_repos') {
    try {
      const githubAccessToken = req.user.accessToken;

      const response = await axios.get(
        'https://api.github.com/user/repos?per_page=100',
        {
          headers: {
            Authorization: `Bearer ${githubAccessToken}`,
          },
        },
      );

      return res.json(response.data);
    } catch (err) {
      console.error(err);
      return res.status(500).send('Chyba GitHub API');
    }
  }

  // REPO DETAIL (zatím jen placeholder)
  if (intent === 'repo_detail') {
    return res.send('Zadej například: "detail repo název-repa"');
  }

  res.send('Zkus například:\n- ukaž moje repo\n- detail repo NAZEV_REPA');
});

const path = require('path');

app.get('/bot', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(3000, () => console.log('http://localhost:3000'));

/* 
const SESSION_SECRET =
  '6462dc4934b2db0a070b497890fd48102bc38419e8a9f19304fd6ff8a0a22344';
// Session middleware
app.use(
  session({
    secret: 'SESSION_SECRET',
    resave: false,
    saveUninitialized: false,
  }),
);

app.get('/profile', (req, res) => {
  if (!req.session.user) {
    return res.send('Nejsi přihlášená');
  }

  res.send(`<h1>Ahoj ${req.session.user}</h1>`);
});

Logout (jen pro session – tady už vlastně není potřeba, JWT)
app.get('/logout', (req, res) => {
  req.session.destroy();
  res.send('Odhlášeno');
});


app.get('/token', (req, res) => {
  const token = jwt.sign(
    { user: 'martina' },
    'fbf041a0eb21202d7b386af534d3b0714adb9b2d136c8ad720f6396741818888',
    {
      expiresIn: '1h',
    },
  );

  res.send(token);
}); 
... tady byl ještě kód k tomu tokenu
console.log(token);

const decoded = jwt.verify(token, 'tajny_string');

console.log(decoded);

const jwt = require('jsonwebtoken');*/
