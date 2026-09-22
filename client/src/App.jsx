import { useEffect, useMemo, useState } from 'react';

const API = '/api';
const defaultConfig = { count: 20, mode: 'practice', diff: 'mixed' };

async function api(url, options = {}, token = localStorage.getItem('ui-prep-iq-token') || '') {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {})
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function App() {
  const [token, setToken] = useState(() => localStorage.getItem('ui-prep-iq-token') || '');
  const [user, setUser] = useState(() => JSON.parse(localStorage.getItem('ui-prep-iq-user') || 'null'));
  const [subjects, setSubjects] = useState({});
  const [page, setPage] = useState('auth');
  const [role, setRole] = useState('student');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [config, setConfig] = useState(defaultConfig);
  const [subject, setSubject] = useState('Mathematics');
  const [topic, setTopic] = useState('Mixed');
  const [results, setResults] = useState([]);
  const [admin, setAdmin] = useState({ students: 0, attempts: 0, average: 0, best: 0, rows: [] });
  const [quiz, setQuiz] = useState(null);
  const [error, setError] = useState('');
  const [dark, setDark] = useState(true);

  useEffect(() => { api(`${API}/subjects`).then(setSubjects).catch(e => setError(e.message)); }, []);

  useEffect(() => {
    if (!token || !user) return;
    if (user.role === 'admin') { loadAdmin(token); setPage('admin'); }
    else { loadResults(token); setPage('student'); }
  }, []);

  useEffect(() => {
    document.body.classList.toggle('light', !dark);
  }, [dark]);

  async function loadResults(authToken = token) {
    try { setResults(await api(`${API}/results/me`, {}, authToken)); } catch (e) { setError(e.message); }
  }

  async function loadAdmin(authToken = token) {
    try {
      const [stats, rows] = await Promise.all([
        api(`${API}/admin/stats`, {}, authToken),
        api(`${API}/results/all`, {}, authToken)
      ]);
      setAdmin({ ...stats, rows });
    } catch (e) { setError(e.message); }
  }

  function saveSession(newToken, newUser) {
    setToken(newToken);
    setUser(newUser);
    localStorage.setItem('ui-prep-iq-token', newToken);
    localStorage.setItem('ui-prep-iq-user', JSON.stringify(newUser));
  }

  async function login() {
    setError('');
    try {
      const data = await api(`${API}/login`, { method: 'POST', body: JSON.stringify({ name: name.trim(), password }) });
      saveSession(data.token, data.user);
      if (data.user.role === 'admin') { await loadAdmin(data.token); setPage('admin'); }
      else { await loadResults(data.token); setPage('student'); }
    } catch (e) { setError(e.message); }
  }

  async function signup() {
    setError('');
    try {
      const data = await api(`${API}/signup`, { method: 'POST', body: JSON.stringify({ name: name.trim(), password }) });
      saveSession(data.token, data.user);
      await loadResults(data.token);
      setPage('student');
    } catch (e) { setError(e.message); }
  }

  function logout() {
    setToken(''); setUser(null); setResults([]); setPage('auth');
    localStorage.removeItem('ui-prep-iq-token');
    localStorage.removeItem('ui-prep-iq-user');
  }

  async function shareApp() {
    const shareData = { title: 'UI Prep IQ', text: 'Practice UI/Post-UTME questions with UI Prep IQ.', url: window.location.href };
    try {
      if (navigator.share) await navigator.share(shareData);
      else { await navigator.clipboard.writeText(window.location.href); alert('App link copied. Send it to your students.'); }
    } catch (e) {
      if (e.name !== 'AbortError') alert('Copy this link: ' + window.location.href);
    }
  }

  async function launch() {
    setError('');
    try {
      const query = new URLSearchParams({ subject, topic, diff: config.diff, count: String(config.count) });
      const questions = await api(`${API}/questions?${query}`);
      if (!questions.length) throw new Error('No questions found for this selection.');
      setQuiz({ subject, topic, mode: config.mode, diff: config.diff, questions, index: 0, answers: Array(questions.length).fill(null), flagged: Array(questions.length).fill(false), remaining: config.mode === 'cbt' ? Math.max(35 * questions.length, 120) : null });
      setPage('quiz');
    } catch (e) { setError(e.message); }
  }

  async function submit() {
    if (!quiz || quiz.submitted) return;
    const correct = quiz.questions.reduce((n, q, i) => n + (quiz.answers[i] === q.answer ? 1 : 0), 0);
    const total = quiz.questions.length;
    const score = Math.round((correct / total) * 100);
    const completed = { ...quiz, submitted: true, correct, wrong: total - correct, score };
    setQuiz(completed);
    try {
      if (user?.role === 'student') {
        await api(`${API}/results`, { method: 'POST', body: JSON.stringify({ subject: quiz.subject, topic: quiz.topic, difficulty: quiz.diff, mode: quiz.mode, score, accuracy: score, correct, wrong: total - correct, totalQuestions: total }) });
        await loadResults();
      }
      if (user?.role === 'admin') await loadAdmin();
      setPage('results');
    } catch (e) { setError(e.message); }
  }

  const stats = useMemo(() => {
    const attempts = results.length;
    return { attempts, average: attempts ? Math.round(results.reduce((n, r) => n + r.score, 0) / attempts) : 0, best: attempts ? Math.max(...results.map(r => r.score)) : 0 };
  }, [results]);

  return <>
    <Header dark={dark} toggleTheme={() => setDark(v => !v)} onShare={shareApp} />
    <main>
      {error && <div className="notice glass" role="alert"><span>⚠</span><div>{error}<button className="ghost" onClick={() => setError('')}>Dismiss</button></div></div>}
      {page === 'auth' && <Auth role={role} setRole={setRole} name={name} setName={setName} password={password} setPassword={setPassword} login={login} signup={signup} share={shareApp} />}
      {page === 'student' && <Student user={user} stats={stats} results={results} start={() => setPage('setup')} progress={() => setPage('progress')} logout={logout} share={shareApp} />}
      {page === 'setup' && <Setup subjects={subjects} subject={subject} setSubject={s => { setSubject(s); setTopic('Mixed'); }} topic={topic} setTopic={setTopic} config={config} setConfig={setConfig} launch={launch} back={() => setPage('student')} />}
      {page === 'quiz' && quiz && <Quiz quiz={quiz} setQuiz={setQuiz} submit={submit} quit={() => setPage('student')} />}
      {page === 'results' && quiz && <Results quiz={quiz} review={() => setPage('review')} retry={launch} dashboard={() => setPage('student')} />}
      {page === 'review' && quiz && <Review quiz={quiz} back={() => setPage('results')} />}
      {page === 'progress' && <Progress results={results} subjects={subjects} back={() => setPage('student')} />}
      {page === 'admin' && <Admin data={admin} exportData={() => download(admin.rows, 'ui-prep-results.json')} reset={async () => { if (confirm('Reset all student data?')) { await api(`${API}/reset`, { method: 'POST' }); await loadAdmin(); } }} logout={logout} />}
    </main>
    <nav className="bottom"><button className={page === 'auth' ? 'active' : ''} onClick={() => setPage('auth')}>⌂<span>Home</span></button><button className={page === 'student' ? 'active' : ''} onClick={() => user ? setPage(user.role === 'admin' ? 'admin' : 'student') : setPage('auth')}>◈<span>{user?.role === 'admin' ? 'Admin' : 'Student'}</span></button><button className={page === 'admin' ? 'active' : ''} onClick={() => user?.role === 'admin' ? setPage('admin') : setPage('auth')}>◌<span>Admin</span></button></nav>
  </>;
}

function Header({ dark, toggleTheme, onShare }) { return <header><div className="brand"><div className="brand-mark">UI</div><div><b>UI Prep IQ</b><small>University of Ibadan • CBT Prep</small></div></div><div className="header-actions"><button className="icon-btn" onClick={onShare} title="Share app">↗</button><button className="icon-btn" onClick={toggleTheme} title="Toggle theme">{dark ? '☼' : '☾'}</button></div></header>; }
function Auth({ role, setRole, name, setName, password, setPassword, login, signup, share }) { return <section className="page active"><div className="hero glass"><div className="tag">ADMISSION PREPARATION</div><h1>Train smarter.<br/><span className="gradient">Think like a CBT champion.</span></h1><p>Interactive UI/Post-UTME practice with saved student results and CBT timing.</p><div className="actions"><button className="primary" onClick={() => setRole('student')}>Student Login</button><button className="secondary" onClick={share}>Share App ↗</button></div></div><div className="auth-box glass"><div className="tabs"><button className={role === 'student' ? 'tab active' : 'tab'} onClick={() => setRole('student')}>Student</button><button className={role === 'admin' ? 'tab active' : 'tab'} onClick={() => { setRole('admin'); setName('admin'); }}>Admin</button></div><div className="field"><label>{role === 'admin' ? 'Admin username' : 'Student name'}</label><input value={name} onChange={e => setName(e.target.value)} placeholder={role === 'admin' ? 'admin' : 'Your full name'} /></div><div className="field"><label>Password</label><input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder={role === 'admin' ? 'admin123' : 'Create or enter password'} /></div><button className="primary wide" onClick={login}>Continue</button>{role === 'student' && <button className="secondary wide" onClick={signup}>Create Student Account</button>}</div></section>; }
function Student({ user, stats, results, start, progress, logout, share }) { return <section className="page active"><div className="page-head"><div><small>STUDENT</small><h2>Welcome, {user?.name}</h2></div><button className="secondary" onClick={logout}>Logout</button></div><div className="mini-grid"><div className="mini glass"><small>Attempts</small><b>{stats.attempts}</b></div><div className="mini glass"><small>Average</small><b>{stats.average}%</b></div><div className="mini glass"><small>Best score</small><b>{stats.best}%</b></div><div className="mini glass"><small>Subjects</small><b>5</b></div></div><div className="actions"><button className="primary" onClick={start}>Start Practice 🚀</button><button className="secondary" onClick={progress}>Progress</button><button className="secondary" onClick={share}>Send to Students ↗</button></div><div className="panel glass"><div className="heading"><small>RECENT RESULTS</small><h2>Performance</h2></div>{results.length ? results.slice(0, 5).map(r => <div className="result-item" key={r.id}><div><strong>{r.subject}</strong><small>{r.mode} • {new Date(r.created_at).toLocaleString()}</small></div><span className="result-badge">{r.score}%</span></div>) : <div className="review"><h3>No attempt yet</h3><small>Start a test to save your result.</small></div>}</div></section>; }
function Setup({ subjects, subject, setSubject, topic, setTopic, config, setConfig, launch, back }) { const topics = subjects[subject]?.topics || []; return <section className="page active"><div className="page-head"><button className="back" onClick={back}>←</button><div><small>SETUP</small><h2>Build your session</h2></div></div><div className="setup glass"><label>Subject</label><div className="choices">{Object.keys(subjects).map(s => <button className={s === subject ? 'choice selected' : 'choice'} key={s} onClick={() => setSubject(s)}>{s}</button>)}</div><label>Topic</label><div className="choices"><button className={topic === 'Mixed' ? 'choice selected' : 'choice'} onClick={() => setTopic('Mixed')}>Mixed</button>{topics.map(t => <button className={topic === t ? 'choice selected' : 'choice'} key={t} onClick={() => setTopic(t)}>{t}</button>)}</div><label>Questions</label><div className="choices">{[10, 20, 40, 60].map(n => <button className={config.count === n ? 'choice selected' : 'choice'} key={n} onClick={() => setConfig({ ...config, count: n })}>{n}</button>)}</div><label>Mode</label><div className="choices">{['practice', 'cbt'].map(m => <button className={config.mode === m ? 'choice selected' : 'choice'} key={m} onClick={() => setConfig({ ...config, mode: m })}>{m}</button>)}</div><label>Difficulty</label><div className="choices">{['mixed', 'easy', 'medium', 'hard'].map(d => <button className={config.diff === d ? 'choice selected' : 'choice'} key={d} onClick={() => setConfig({ ...config, diff: d })}>{d}</button>)}</div><div className="summary"><span>Selected</span><b>{config.count} • {config.diff} • {config.mode}</b></div><button className="primary wide" onClick={launch}>Launch Test 🚀</button></div></section>; }
function Quiz({ quiz, setQuiz, submit, quit }) { const q = quiz.questions[quiz.index], answer = quiz.answers[quiz.index]; const choose = i => setQuiz({ ...quiz, answers: quiz.answers.map((v, n) => n === quiz.index ? i : v) }); const move = n => setQuiz({ ...quiz, index: Math.max(0, Math.min(quiz.questions.length - 1, n)) }); return <section className="page active"><div className="quiz-top"><button className="icon-btn" onClick={quit}>×</button><div className="quiz-info"><b>{quiz.subject}</b><small>{quiz.topic}</small></div><div className="timer">{quiz.mode === 'cbt' ? formatTime(quiz.remaining) : 'Practice'}</div></div><div className="progress-track"><div className="progress-bar" style={{ width: `${((quiz.index + 1) / quiz.questions.length) * 100}%` }} /></div><div className="q-top"><span>Question {quiz.index + 1} of {quiz.questions.length}</span><button className={quiz.flagged[quiz.index] ? 'flag active' : 'flag'} onClick={() => setQuiz({ ...quiz, flagged: quiz.flagged.map((v, i) => i === quiz.index ? !v : v) })}>⚑</button></div><div className="question glass"><div className="type">{q.type === 'roman' ? 'ROMAN NUMERAL' : 'MCQ'}</div><h2>{quiz.index + 1}. {q.q}</h2>{q.statements?.map((s, i) => <div className="statement" key={i}>{s}</div>)}<div className="options">{q.options.map((o, i) => <button key={i} className={`option ${answer === i ? 'selected' : ''} ${answer !== null && q.answer === i ? 'correct' : ''} ${answer !== null && answer === i && q.answer !== i ? 'wrong' : ''}`} onClick={() => choose(i)}><span className="letter">{String.fromCharCode(65 + i)}</span><span>{o}</span></button>)}</div>{answer !== null && <div className="explanation">{q.explanation}</div>}</div><div className="quiz-controls"><button className="secondary" onClick={() => move(quiz.index - 1)}>← Previous</button><button className="primary" onClick={() => quiz.index === quiz.questions.length - 1 ? submit() : move(quiz.index + 1)}>{quiz.index === quiz.questions.length - 1 ? 'Finish →' : 'Next →'}</button></div><button className="submit" onClick={submit}>Submit test</button><div className="navigator">{quiz.questions.map((_, i) => <button key={i} className={`navQ ${i === quiz.index ? 'current' : ''} ${quiz.answers[i] !== null ? 'done' : ''}`} onClick={() => move(i)}>{i + 1}</button>)}</div></section>; }
function Results({ quiz, review, retry, dashboard }) { return <section className="page active"><div className="result-panel glass"><div className="ring"><b>{quiz.score}%</b><small>SCORE</small></div><div><small>SESSION COMPLETE</small><h2>{quiz.score >= 80 ? 'Excellent work!' : quiz.score >= 60 ? 'Good effort.' : 'Keep going.'}</h2><p>{quiz.correct} correct out of {quiz.questions.length} questions.</p></div></div><div className="stats"><div className="stat glass"><b>{quiz.correct}</b><span>Correct</span></div><div className="stat glass"><b>{quiz.wrong}</b><span>Wrong</span></div><div className="stat glass"><b>{quiz.score}%</b><span>Accuracy</span></div></div><div className="actions"><button className="primary" onClick={review}>Review Answers</button><button className="secondary" onClick={retry}>Retry</button><button className="secondary" onClick={dashboard}>Dashboard</button></div></section>; }
function Review({ quiz, back }) { return <section className="page active"><div className="page-head"><button className="back" onClick={back}>←</button><div><small>ANALYSIS</small><h2>Answer review</h2></div></div>{quiz.questions.map((q, i) => <div className="review" key={i}><small>{q.topic}</small><h3>{i + 1}. {q.q}</h3><p><span className={quiz.answers[i] === q.answer ? 'good' : 'bad'}>Your answer:</span> {quiz.answers[i] == null ? 'Not answered' : q.options[quiz.answers[i]]}</p><p><span className="good">Correct answer:</span> {q.options[q.answer]}</p><small>{q.explanation}</small></div>)}</section>; }
function Progress({ results, subjects, back }) { const attempted = results.reduce((n, r) => n + r.total_questions, 0), correct = results.reduce((n, r) => n + r.correct, 0); return <section className="page active"><div className="page-head"><button className="back" onClick={back}>←</button><div><small>PERFORMANCE</small><h2>Progress</h2></div></div><div className="progress-panel glass"><div><span>Questions attempted</span><b>{attempted}</b></div><div><span>Correct answers</span><b>{correct}</b></div><div><span>Overall accuracy</span><b>{attempted ? Math.round(correct / attempted * 100) : 0}%</b></div></div>{Object.keys(subjects).map(s => { const rows = results.filter(r => r.subject === s), a = rows.reduce((n, r) => n + r.total_questions, 0), c = rows.reduce((n, r) => n + r.correct, 0), p = a ? Math.round(c / a * 100) : 0; return <div className="subject-progress" key={s}><div className="row"><b>{s}</b><span>{p}%</span></div><div className="bar"><i style={{ width: `${p}%` }} /></div></div>; })}</section>; }
function Admin({ data, exportData, reset, logout }) { return <section className="page active"><div className="page-head"><div><small>ADMIN</small><h2>Control center</h2></div><button className="secondary" onClick={logout}>Logout</button></div><div className="actions"><button className="primary" onClick={exportData}>Export Results</button><button className="secondary" onClick={reset}>Reset Student Data</button></div><div className="admin-stats"><div className="admin-card glass"><small>Students</small><b>{data.students}</b></div><div className="admin-card glass"><small>Attempts</small><b>{data.attempts}</b></div><div className="admin-card glass"><small>Average</small><b>{data.average}%</b></div><div className="admin-card glass"><small>Best</small><b>{data.best}%</b></div></div><div className="table-wrap glass"><table><thead><tr><th>Student</th><th>Subject</th><th>Score</th><th>Mode</th><th>Date</th></tr></thead><tbody>{data.rows.map(r => <tr key={r.id}><td>{r.student_name}</td><td>{r.subject}</td><td>{r.score}%</td><td>{r.mode}</td><td>{new Date(r.created_at).toLocaleString()}</td></tr>)}</tbody></table></div></section>; }
function formatTime(s) { const n = Math.max(0, s || 0); return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`; }
function download(data, filename) { const a = document.createElement('a'), url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url); }

export default App;
