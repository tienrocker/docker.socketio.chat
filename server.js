const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const moment = require('moment-timezone');
const { RedisStore } = require('connect-redis')
const session = require('express-session')
const { createClient } = require('redis')
const { User, Chat } = require('./db');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
const SECRET_KEY = process.env.SECRET_KEY || 'default-secret-key';

// Initialize client.
let redisClient = createClient({ url: process.env.REDIS_URI });
redisClient.connect().catch(console.error);

// Initialize store.
let redisStore = new RedisStore({ client: redisClient, prefix: 'chat:', })

const onlineUsers = new Map();

app.set('view engine', 'ejs');
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(
  session({
    store: redisStore,
    resave: false, // required: force lightweight session keep alive (touch)
    saveUninitialized: false, // recommended: only save session when data exists
    secret: process.env.SESSION_SECRET || 'default-session-secret-key',
  }),
);
app.use((req, res, next) => { res.locals.moment = moment; next(); });

app.get('/', async (req, res) => {
  const username = req.session.username;
  const token = req.session.token;
  try {
    const decoded = jwt.verify(token, SECRET_KEY);
    res.render('chat', { token, username });
  } catch (error) {
    res.redirect('/login');
  }
});

app.get('/login', (req, res) => {
  res.render('login');
});

app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const user = await User.findOne({ username });
  if (!user || !(await bcrypt.compare(password, user.password))) {
    if (!req.is('application/json')) {
      return res.render('login', { error: 'Invalid credentials' });
    } else {
      return res.json({ error: 'Invalid credentials' });
    }
  }

  req.session.user_id = user._id;
  req.session.username = username;
  req.session.token = jwt.sign({ id: user._id, username }, SECRET_KEY, { expiresIn: '1d' });

  if (!req.is('application/json')) {
    res.redirect('/');
  } else {
    res.json({ user_id: req.session.user_id, username: req.session.username, token: req.session.token });
  }
});

app.get('/register', (req, res) => {
  res.render('register');
});

app.post('/register', async (req, res) => {
  const { username, password } = req.body;
  const hashedPassword = await bcrypt.hash(password, 10);
  try {
    const user = new User({ username, password: hashedPassword });
    await user.save();
    res.redirect('/login');
  } catch (error) {
    res.render('register', { error: 'Username already exists' });
  }
});

app.get('/online-users', (req, res) => {
  const users = Array.from(onlineUsers.values());
  res.render('online-users', { users });
});

app.get('/more-chats', async (req, res) => {
  let { before } = req.query;

  let timestamp = moment(before, true).isValid() ? moment(before) : moment(Date.now());

  const olderChats = await Chat.find({ timestamp: { $lt: timestamp.toDate() } }).sort({ timestamp: -1 }).limit(10);
  res.json(olderChats);
});

io.use((socket, next) => {
  const token = socket.handshake.auth.token || socket.handshake.query.token;
  if (!token) return next(new Error('Authentication error'));
  try {
    const decoded = jwt.verify(token, SECRET_KEY);
    socket.user = decoded;
    next();
  } catch (error) {
    return next(error);
  }
});

io.on('connection', (socket) => {
  console.log(`User ${socket.user.username} connected`);
  onlineUsers.set(socket.id, socket.user.username);
  io.emit('userCount', onlineUsers.size);
  io.emit('onlineUsers', Array.from(onlineUsers.values()));

  socket.on('message', async (msg) => {
    const token = socket.handshake.auth.token || socket.handshake.query.token;
    if (!token) return next(new Error('Authentication error'));
    try {
      const decoded = jwt.verify(token, SECRET_KEY);
      socket.user = decoded;
      const chat = new Chat({ user: socket.user.username, message: msg });
      await chat.save();
      io.emit('message', { user: socket.user.username, message: msg, timestamp: chat.timestamp });
    } catch (error) {
      next(new Error('Invalid token'));
    }
  });

  socket.on('disconnect', () => {
    console.log(`User ${socket.user.username} disconnected`);
    onlineUsers.delete(socket.id);
    io.emit('userCount', onlineUsers.size);
    io.emit('onlineUsers', Array.from(onlineUsers.values()));
  });
});

server.listen(80, () => {
  console.log('Server running on port 80');
});