require('dotenv').config({ path: '../.env' });
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';

const SUBJECTS = {
  Mathematics: {
    icon: '∑',
    topics: ['Number & Sets', 'Algebra', 'Quadratic Equations', 'Graphs & Functions', 'Geometry', 'Trigonometry', 'Statistics', 'Probability']
  },
  Biology: {
    icon: '🧬',
    topics: ['Cell Biology', 'Genetics', 'Ecology', 'Human Physiology', 'Reproduction', 'Nutrition & Health', 'Evolution', 'Biotechnology']
  },
  Chemistry: {
    icon: '⚗',
    topics: ['Atomic Structure', 'Periodic Table', 'Chemical Bonding', 'Acids, Bases & Salts', 'Stoichiometry', 'Organic Chemistry', 'Rates of Reaction', 'Separation Techniques']
  },
  Physics: {
    icon: '⚙',
    topics: ['Mechanics', 'Electricity', 'Waves', 'Optics', 'Thermal Physics', 'Modern Physics', 'Magnetism', 'Measurements']
  },
  English: {
    icon: 'A',
    topics: ['Grammar', 'Comprehension', 'Vocabulary', 'Synonyms & Antonyms', 'Sentence Structure', 'Punctuation', 'Idioms', 'Oral English']
  }
};

const QUESTION_BANK = buildQuestionBank();

function buildQuestionBank() {
  const bank = {};

  Object.entries(SUBJECTS).forEach(([subject, details]) => {
    const questions = [];

    details.topics.forEach((topic) => {
      for (let i = 0; i < 6; i++) {
        questions.push({
          subject,
          topic,
          type: i % 2 === 0 ? 'mcq' : 'roman',
          difficulty: i % 3 === 0 ? 'easy' : i % 3 === 1 ? 'medium' : 'hard',
          q: `${subject} question on ${topic}: Which option best reflects correct understanding?`,
          options: [
            'Correct understanding and reasoned application',
            'Random guessing',
            'Ignoring the concept',
            'Blind memorization without application'
          ],
          answer: 0,
          explanation: `${topic} is central to understanding and solving key questions in ${subject}.`
        });
      }
    });

    questions.push({
      subject,
      topic: details.topics[0],
      type: 'mcq',
      difficulty: 'easy',
      q: `Which statement is most accurate about ${details.topics[0]} in ${subject}?`,
      options: [
        'It is a foundational concept in the subject',
        'It is unrelated to exam success',
        'It is only for notes and not tests',
        'It can be ignored in preparation'
      ],
      answer: 0,
      explanation: `Strong mastery of ${details.topics[0]} supports problem solving and exam confidence.`
    });

    questions.push({
      subject,
      topic: details.topics[1] || details.topics[0],
      type: 'mcq',
      difficulty: 'medium',
      q: `A learner who understands ${details.topics[1] || details.topics[0]} in ${subject} is likely to:`,
      options: [
        'Apply concepts accurately to questions',
        'Avoid all practice',
        'Guess blindly',
        'Ignore the task completely'
      ],
      answer: 0,
      explanation: 'Conceptual understanding leads to accuracy and confidence.'
    });

    questions.push({
      subject,
      topic: details.topics[2] || details.topics[0],
      type: 'roman',
      difficulty: 'hard',
      q: `Which of the following are essential in learning ${details.topics[2] || details.topics[0]}?`,
      statements: [
        'Conceptual understanding',
        'Regular practice',
        'Systematic revision',
        'Guessing blindly'
      ],
      options: ['I and II only', 'I, II and III only', 'II and IV only', 'I and IV only'],
      answer: 1,
      explanation: 'Read, understand, practice, and revise. Blind guessing is not effective.'
    });

    bank[subject] = questions;
  });

  return bank;
}

app.use(cors());
app.use(express.json());

function createToken(user) {
  return jwt.sign({ id: user.id, name: user.name, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.split(' ')[1] : null;

  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    return next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  return next();
}

function ensureAdminUser() {
  const adminName = process.env.ADMIN_USERNAME || 'admin';
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
  const existing = db.prepare('SELECT * FROM users WHERE name = ?').get(adminName);

  if (!existing) {
    const hash = bcrypt.hashSync(adminPassword, 10);
    db.prepare('INSERT INTO users (name, password_hash, role) VALUES (?, ?, ?)').run(adminName, hash, 'admin');
  }
}

ensureAdminUser();

app.get('/api/health', (req, res) => {
  res.json({ ok: true, message: 'UI Prep IQ API running' });
});

app.get('/api/subjects', (req, res) => {
  res.json(SUBJECTS);
});

app.post('/api/signup', (req, res) => {
  const { name, password } = req.body || {};

  if (!name || !password) {
    return res.status(400).json({ error: 'Name and password are required.' });
  }

  const cleanName = String(name).trim();
  if (cleanName.length < 2) {
    return res.status(400).json({ error: 'Name must be at least 2 characters.' });
  }

  if (cleanName.toLowerCase() === 'admin') {
    return res.status(400).json({ error: 'That username is reserved.' });
  }

  const existing = db.prepare('SELECT * FROM users WHERE name = ?').get(cleanName);
  if (existing) {
    return res.status(409).json({ error: 'User already exists.' });
  }

  const hash = bcrypt.hashSync(password, 10);
  const result = db.prepare('INSERT INTO users (name, password_hash, role) VALUES (?, ?, ?)').run(cleanName, hash, 'student');

  const user = { id: result.lastInsertRowid, name: cleanName, role: 'student' };
  const token = createToken(user);

  return res.json({ token, user });
});

app.post('/api/login', (req, res) => {
  const { name, password } = req.body || {};

  if (!name || !password) {
    return res.status(400).json({ error: 'Name and password are required.' });
  }

  const user = db.prepare('SELECT * FROM users WHERE name = ?').get(String(name).trim());
  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const valid = bcrypt.compareSync(password, user.password_hash);
  if (!valid) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const payload = { id: user.id, name: user.name, role: user.role };
  return res.json({ token: createToken(payload), user: payload });
});

app.get('/api/me', requireAuth, (req, res) => {
  const user = db.prepare('SELECT id, name, role FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found.' });
  return res.json({ user });
});

app.get('/api/questions', (req, res) => {
  const subject = req.query.subject || 'Mathematics';
  const diff = req.query.diff || 'mixed';
  const topic = req.query.topic || 'Mixed';
  const count = Number(req.query.count || 20);

  let pool = QUESTION_BANK[subject] || [];

  if (diff !== 'mixed') pool = pool.filter((q) => q.difficulty === diff);
  if (topic !== 'Mixed') pool = pool.filter((q) => q.topic === topic);

  if (!pool.length) pool = QUESTION_BANK[subject] || [];

  const selected = pool.sort(() => Math.random() - 0.5).slice(0, Math.min(count, 60));
  return res.json(selected);
});

app.post('/api/results', requireAuth, (req, res) => {
  const { subject, topic, difficulty, mode, score, accuracy, correct, wrong, totalQuestions } = req.body || {};

  if (!subject || typeof score !== 'number' || typeof totalQuestions !== 'number') {
    return res.status(400).json({ error: 'Invalid result payload.' });
  }

  const user = db.prepare('SELECT id, name, role FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found.' });

  db.prepare(`
    INSERT INTO results (user_id, student_name, subject, topic, difficulty, mode, score, accuracy, correct, wrong, total_questions)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    user.id,
    user.name,
    subject,
    topic || 'Mixed',
    difficulty || 'mixed',
    mode || 'practice',
    score,
    accuracy,
    correct,
    wrong,
    totalQuestions
  );

  return res.status(201).json({ success: true });
});

app.get('/api/results/me', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT * FROM results WHERE user_id = ? ORDER BY created_at DESC').all(req.user.id);
  return res.json(rows);
});

app.get('/api/results/all', requireAuth, requireAdmin, (req, res) => {
  const rows = db.prepare('SELECT * FROM results ORDER BY created_at DESC').all();
  return res.json(rows);
});

app.get('/api/admin/stats', requireAuth, requireAdmin, (req, res) => {
  const students = db.prepare("SELECT COUNT(*) AS c FROM users WHERE role = 'student'").get();
  const attempts = db.prepare('SELECT COUNT(*) AS c FROM results').get();
  const average = db.prepare('SELECT COALESCE(AVG(score), 0) AS avg FROM results').get();
  const max = db.prepare('SELECT COALESCE(MAX(score), 0) AS max FROM results').get();

  return res.json({
    students: students.c,
    attempts: attempts.c,
    average: Math.round(average.avg),
    best: max.max
  });
});

app.post('/api/reset', requireAuth, requireAdmin, (req, res) => {
  db.prepare('DELETE FROM results').run();
  db.prepare("DELETE FROM users WHERE role = 'student'").run();
  return res.json({ success: true });
});

const clientDist = path.join(__dirname, '..', 'client', 'dist');
const clientBuildExists = require('fs').existsSync(clientDist);

if (clientBuildExists) {
  app.use(express.static(clientDist));
  app.get('*', (req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`UI Prep IQ server running on http://localhost:${PORT}`);
});
