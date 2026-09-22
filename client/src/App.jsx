import { useEffect, useMemo, useState } from 'react';

const API = '/api';

const defaultConfig = { count: 20, mode: 'practice', diff: 'mixed' };

function App() {
  const [token, setToken] = useState(localStorage.getItem('ui-prep-iq-token') || '');
  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('ui-prep-iq-user') || 'null');
    } catch {
      return null;
    }
  });
  const [role, setRole] = useState('student');
  const [subjects, setSubjects] = useState({});
  const [selectedSubject, setSelectedSubject] = useState('Mathematics');
  const [selectedTopic, setSelectedTopic] = useState('Mixed');
  const [config, setConfig] = useState(defaultConfig);
  const [authName, setAuthName] = useState('');
  const [password, setPassword] = useState('');
  const [currentPage, setCurrentPage] = useState('auth');
  const [quiz, setQuiz] = useState(null);
  const [results, setResults] = useState([]);
  const [adminData, setAdminData] = useState({ students: 0, attempts: 0, average: 0, best: 0, rows: [] });

  useEffect(() => {
    loadSubjects();
    if (token && user) {
      if (user.role === 'admin') {
        loadAdminData();
        setCurrentPage('admin');
      } else {
        loadStudentData();
        setCurrentPage('student');
      }
    }
  }, []);

  useEffect(() => {
    if (token) localStorage.setItem('ui-prep-iq-token', token);
    else localStorage.removeItem('ui-prep-iq-token');
  }, [token]);

  useEffect(() => {
    if (user) localStorage.setItem('ui-prep-iq-user', JSON.stringify(user));
    else localStorage.removeItem('ui-prep-iq-user');
  }, [user]);

  async function loadSubjects() {
    const data = await fetchJson(`${API}/subjects`);
    setSubjects(data);
  }

  async function loadStudentData() {
    if (!token) return;
    const data = await fetchJson(`${API}/results/me`);
    setResults(data);
  }

  async function loadAdminData() {
    if (!token) return;
    const stats = await fetchJson(`${API}/admin/stats`);
    const rows = await fetchJson(`${API}/results/all`);
    setAdminData({ ...stats, rows });
  }

  async function handleAuth() {
    const name = authName.trim();
    const pass = password.trim();
    if (!name || !pass) {
      alert('Please fill in all fields.');
      return;
    }

    try {
      const payload = await fetchJson(`${API}/login`, {
        method: 'POST',
        body: JSON.stringify({ name, password: pass })
      });
      setToken(payload.token);
      setUser(payload.user);

      if (payload.user.role === 'admin') {
        await loadAdminData();
        setCurrentPage('admin');
      } else {
        await loadStudentData();
        setCurrentPage('student');
      }
    } catch (error) {
      alert(error.message);
    }
  }

  async function handleSignup() {
    const name = authName.trim();
    const pass = password.trim();
    if (!name || !pass) {
      alert('Please fill in all fields.');
      return;
    }

    try {
      const payload = await fetchJson(`${API}/signup`, {
        method: 'POST',
        body: JSON.stringify({ name, password: pass })
      });
      setToken(payload.token);
      setUser(payload.user);
      await loadStudentData();
      setCurrentPage('student');
    } catch (error) {
      alert(error.message);
    }
  }

  async function handleLogout() {
    setToken('');
    setUser(null);
    setCurrentPage('auth');
  }

  async function launchQuiz() {
    const query = new URLSearchParams({
      subject: selectedSubject,
      topic: selectedTopic,
      diff: config.diff,
      count: String(config.count)
    });

    const data = await fetchJson(`${API}/questions?${query.toString()}`);
    setQuiz({
      subject: selectedSubject,
      topic: selectedTopic,
      mode: config.mode,
      diff: config.diff,
      index: 0,
      questions: data,
      answers: Array(data.length).fill(null),
      flagged: Array(data.length).fill(false),
      remaining: config.mode === 'cbt' ? Math.max(35 * data.length, 120) : null
    });
    setCurrentPage('quiz');
  }

  async function submitQuiz() {
    if (!quiz) return;
    let correct = 0;
    quiz.questions.forEach((q, idx) => {
      if (quiz.answers[idx] === q.answer) correct += 1;
    });

    const total = quiz.questions.length;
    const wrong = total - correct;
    const score = total ? Math.round((correct / total) * 100) : 0;

    if (user && user.role === 'student') {
      await fetchJson(`${API}/results`, {
        method: 'POST',
        body: JSON.stringify({
          subject: quiz.subject,
          topic: quiz.topic,
          difficulty: quiz.diff,
          mode: quiz.mode,
          score,
          accuracy: score,
          correct,
          wrong,
          totalQuestions: total
        })
      });
      await loadStudentData();
    }

    setCurrentPage('results');
    setQuiz((prev) => ({ ...prev, score, correct, wrong }));
  }

  async function resetAdminData() {
    if (!confirm('Reset all student data?')) return;
    try {
      await fetchJson(`${API}/reset`, { method: 'POST' });
      await loadAdminData();
      alert('Student data reset.');
    } catch (error) {
      alert(error.message);
    }
  }

  async function exportAllResults() {
    const rows = await fetchJson(`${API}/results/all`);
    const blob = new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ui-results.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  const stats = useMemo(() => {
    const totalAttempts = results.length;
    const average = totalAttempts ? Math.round(results.reduce((sum, r) => sum + r.score, 0) / totalAttempts) : 0;
    const best = totalAttempts ? Math.max(...results.map((r) => r.score)) : 0;
    const streak = totalAttempts ? Math.max(...results.map((r) => (r.score >= 50 ? 1 : 0))) : 0;
    return { totalAttempts, average, best, streak };
  }, [results]);

  return (
    <>
      <Header />
      <main>
        {currentPage === 'auth' && (
          <AuthScreen
            role={role}
            setRole={setRole}
            authName={authName}
            setAuthName={setAuthName}
            password={password}
            setPassword={setPassword}
            onLogin={handleAuth}
            onSignup={handleSignup}
            onAdminPreset={() => {
              setRole('admin');
              setAuthName('admin');
              setPassword('admin123');
            }}
          />
        )}

        {currentPage === 'student' && (
          <StudentHome
            user={user}
            logout={handleLogout}
            startPractice={() => setCurrentPage('setup')}
            progress={() => setCurrentPage('progress')}
            stats={stats}
            results={results}
          />
        )}

        {currentPage === 'setup' && (
          <SetupScreen
            subjects={subjects}
            selectedSubject={selectedSubject}
            setSelectedSubject={setSelectedSubject}
            selectedTopic={selectedTopic}
            setSelectedTopic={setSelectedTopic}
            config={config}
            setConfig={setConfig}
            launchQuiz={launchQuiz}
            onBack={() => setCurrentPage('student')}
          />
        )}

        {currentPage === 'quiz' && quiz && (
          <QuizScreen
            quiz={quiz}
            setQuiz={setQuiz}
            onSubmit={submitQuiz}
            onBack={() => setCurrentPage('student')}
          />
        )}

        {currentPage === 'results' && quiz && (
          <ResultsScreen
            quiz={quiz}
            onReview={() => setCurrentPage('review')}
            onRetry={launchQuiz}
            onDashboard={() => setCurrentPage('student')}
          />
        )}

        {currentPage === 'review' && quiz && <ReviewScreen quiz={quiz} onBack={() => setCurrentPage('results')} />}

        {currentPage === 'progress' && <ProgressScreen results={results} subjects={subjects} onBack={() => setCurrentPage('student')} />}

        {currentPage === 'admin' && (
          <AdminScreen
            stats={adminData}
            onExport={exportAllResults}
            onReset={resetAdminData}
            onBack={() => setCurrentPage('auth')}
          />
        )}
      </main>

      <BottomNav current={currentPage} onNavigate={setCurrentPage} isAdmin={user?.role === 'admin'} />
    </>
  );
}

function Header() {
  return (
    <header>
      <div className="brand">
        <div className="brand-mark">UI</div>
        <div>
          <b>UI Prep IQ</b>
          <small>University of Ibadan • CBT Prep</small>
        </div>
      </div>
      <div className="header-actions">
        <button className="icon-btn" aria-label="theme toggle">◐</button>
      </div>
    </header>
  );
}

function AuthScreen({ role, setRole, authName, setAuthName, password, setPassword, onLogin, onSignup, onAdminPreset }) {
  return (
    <section className="page active">
      <div className="hero glass">
        <div className="tag">ADMISSION PREPARATION</div>
        <h1>Train smarter.<br /><span className="gradient">Think like a CBT champion.</span></h1>
        <p>Practice with a modern CBT platform built for serious UI/UTME preparation.</p>
        <div className="actions">
          <button className="primary" onClick={onAdminPreset}>Admin Login</button>
          <button className="secondary" onClick={() => setRole('student')}>Student</button>
        </div>
      </div>

      <div className="auth-box glass">
        <div className="tabs">
          <button className={role === 'student' ? 'tab active' : 'tab'} onClick={() => setRole('student')}>Student</button>
          <button className={role === 'admin' ? 'tab active' : 'tab'} onClick={() => setRole('admin')}>Admin</button>
        </div>

        <div className="field">
          <label>{role === 'admin' ? 'Admin Username' : 'Student Name'}</label>
          <input value={authName} onChange={(e) => setAuthName(e.target.value)} placeholder={role === 'admin' ? 'admin' : 'Enter your name'} />
        </div>

        <div className="field">
          <label>Password</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter password" />
        </div>

        <div className="actions">
          <button className="primary wide" onClick={onLogin}>Continue</button>
        </div>
        <div className="actions">
          <button className="secondary wide" onClick={onSignup}>Create Student Account</button>
        </div>
      </div>
    </section>
  );
}

function StudentHome({ user, logout, startPractice, progress, stats, results }) {
  return (
    <section className="page active">
      <div className="page-head">
        <button className="back" onClick={logout}>←</button>
        <div>
          <small>STUDENT</small>
          <h2>Dashboard</h2>
        </div>
      </div>

      <div className="student-card glass">
        <div>
          <small>Welcome back</small>
          <b>{user?.name || 'Student'}</b>
        </div>
        <button className="secondary" onClick={logout}>Logout</button>
      </div>

      <div className="mini-grid">
        <div className="mini glass">
          <small>Total attempts</small>
          <b>{stats.totalAttempts}</b>
        </div>
        <div className="mini glass">
          <small>Average score</small>
          <b>{stats.average}%</b>
        </div>
        <div className="mini glass">
          <small>Best score</small>
          <b>{stats.best}%</b>
        </div>
        <div className="mini glass">
          <small>Best streak</small>
          <b>{stats.streak}</b>
        </div>
      </div>

      <div className="actions">
        <button className="primary" onClick={startPractice}>Start Practice</button>
        <button className="secondary" onClick={progress}>Progress</button>
      </div>

      <div className="glass panel">
        <div className="heading">
          <small>RECENT RESULTS</small>
          <h2>Performance</h2>
        </div>

        <div className="result-list">
          {results.length === 0 ? (
            <div className="review">
              <h3>No result yet</h3>
              <small>Start a practice session to see your score here.</small>
            </div>
          ) : (
            results.slice(0, 5).map((item) => (
              <div key={item.id} className="result-item">
                <div>
                  <strong>{item.subject}</strong>
                  <small>{item.mode} • {new Date(item.created_at).toLocaleString()}</small>
                </div>
                <div className="result-badge">{item.score}%</div>
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
}

function SetupScreen({ subjects, selectedSubject, setSelectedSubject, selectedTopic, setSelectedTopic, config, setConfig, launchQuiz, onBack }) {
  return (
    <section className="page active">
      <div className="page-head">
        <button className="back" onClick={onBack}>←</button>
        <div>
          <small>SETUP</small>
          <h2>Build your session</h2>
        </div>
      </div>

      <div className="setup glass">
        <label>Subject</label>
        <div className="choices">
          {Object.keys(subjects).map((subject) => (
            <button
              key={subject}
              className={selectedSubject === subject ? 'choice selected' : 'choice'}
              onClick={() => setSelectedSubject(subject)}
            >
              {subject}
            </button>
          ))}
        </div>

        <label>Topic</label>
        <div className="choices">
          {['Mixed', ...(subjects[selectedSubject]?.topics || [])].map((topic) => (
            <button
              key={topic}
              className={selectedTopic === topic ? 'choice selected' : 'choice'}
              onClick={() => setSelectedTopic(topic)}
            >
              {topic}
            </button>
          ))}
        </div>

        <label>Number of questions</label>
        <div className="choices">
          {[10, 20, 40, 60].map((count) => (
            <button
              key={count}
              className={config.count === count ? 'choice selected' : 'choice'}
              onClick={() => setConfig((prev) => ({ ...prev, count }))}
            >
              {count}
            </button>
          ))}
        </div>

        <label>Mode</label>
        <div className="choices">
          {['practice', 'cbt'].map((mode) => (
            <button
              key={mode}
              className={config.mode === mode ? 'choice selected' : 'choice'}
              onClick={() => setConfig((prev) => ({ ...prev, mode }))}
            >
              {mode}
            </button>
          ))}
        </div>

        <label>Difficulty</label>
        <div className="choices">
          {['mixed', 'easy', 'medium', 'hard'].map((diff) => (
            <button
              key={diff}
              className={config.diff === diff ? 'choice selected' : 'choice'}
              onClick={() => setConfig((prev) => ({ ...prev, diff }))}
            >
              {diff}
            </button>
          ))}
        </div>

        <div className="summary">
          <span>Selected</span>
          <b>{config.count} questions • {config.diff} • {config.mode}</b>
        </div>

        <button className="primary wide" onClick={launchQuiz}>Launch Test 🚀</button>
      </div>
    </section>
  );
}

function QuizScreen({ quiz, setQuiz, onSubmit, onBack }) {
  const q = quiz.questions[quiz.index];
  const answerIndex = quiz.answers[quiz.index];

  const handleOptionSelect = (index) => {
    setQuiz((prev) => ({
      ...prev,
      answers: prev.answers.map((value, i) => i === prev.index ? index : value)
    }));
  };

  return (
    <section className="page active">
      <div className="quiz-top">
        <button className="icon-btn" onClick={onBack}>×</button>
        <div className="quiz-info">
          <b>{quiz.subject}</b>
          <small>{quiz.topic === 'Mixed' ? 'Mixed Practice' : quiz.topic}</small>
        </div>
        <div className="timer">{quiz.mode === 'cbt' ? formatTime(quiz.remaining) : 'Practice'}</div>
      </div>

      <div className="progress-track">
        <div className="progress-bar" style={{ width: `${((quiz.index + 1) / quiz.questions.length) * 100}%` }} />
      </div>

      <div className="q-top">
        <span>Question {quiz.index + 1} of {quiz.questions.length}</span>
        <button className={quiz.flagged[quiz.index] ? 'flag active' : 'flag'} onClick={() => setQuiz((prev) => ({
          ...prev,
          flagged: prev.flagged.map((value, i) => i === prev.index ? !value : value)
        }))}>⚑</button>
      </div>

      <div className="question glass">
        <div className="type">{q.type === 'roman' ? 'ROMAN NUMERAL' : 'MCQ'}</div>
        <h2>{`${quiz.index + 1}. ${q.q}`}</h2>

        {q.statements && (
          <div className="statements">
            {q.statements.map((statement, idx) => (
              <div className="statement" key={idx}>{statement}</div>
            ))}
          </div>
        )}

        <div className="options">
          {q.options.map((option, idx) => {
            const selected = answerIndex === idx;
            const correct = q.answer === idx && answerIndex !== null;
            const wrong = answerIndex === idx && q.answer !== idx && answerIndex !== null;
            return (
              <button
                key={idx}
                className={['option', selected ? 'selected' : '', correct ? 'correct' : '', wrong ? 'wrong' : ''].join(' ')}
                onClick={() => handleOptionSelect(idx)}
              >
                <span className="letter">{String.fromCharCode(65 + idx)}</span>
                <span>{option}</span>
              </button>
            );
          })}
        </div>

        {answerIndex !== null && (
          <div className="explanation">{q.explanation}</div>
        )}
      </div>

      <div className="quiz-controls">
        <button className="secondary" onClick={() => setQuiz((prev) => ({ ...prev, index: Math.max(prev.index - 1, 0) }))}>← Previous</button>
        <button className="primary" onClick={() => {
          if (quiz.index === quiz.questions.length - 1) onSubmit();
          else setQuiz((prev) => ({ ...prev, index: Math.min(prev.index + 1, prev.questions.length - 1) }));
        }}>{quiz.index === quiz.questions.length - 1 ? 'Finish →' : 'Next →'}</button>
      </div>

      <button className="submit" onClick={onSubmit}>Submit test</button>

      <div className="navigator">
        {quiz.questions.map((_, idx) => (
          <button
            key={idx}
            className={['navQ', idx === quiz.index ? 'current' : '', quiz.answers[idx] !== null ? 'done' : '', quiz.flagged[idx] ? 'flagged' : ''].join(' ')}
            onClick={() => setQuiz((prev) => ({ ...prev, index: idx }))}
          >
            {idx + 1}
          </button>
        ))}
      </div>
    </section>
  );
}

function ResultsScreen({ quiz, onReview, onRetry, onDashboard }) {
  const total = quiz.questions.length;
  const correct = quiz.questions.filter((q, idx) => quiz.answers[idx] === q.answer).length;
  const wrong = total - correct;
  const score = total ? Math.round((correct / total) * 100) : 0;

  return (
    <section className="page active">
      <div className="result-panel glass">
        <div className="ring">
          <b>{score}%</b>
          <small>SCORE</small>
        </div>
        <div>
          <small>SESSION COMPLETE</small>
          <h2>{score >= 80 ? 'Excellent work!' : score >= 60 ? 'Good effort.' : score >= 40 ? 'Nice start.' : 'Keep going.'}</h2>
          <p>
            {score >= 80 ? 'You are highly prepared. Keep your momentum.' : score >= 60 ? 'You are on a strong track.' : score >= 40 ? 'You have a solid base. Keep practicing.' : 'A little more revision will push your score higher.'}
          </p>
        </div>
      </div>

      <div className="stats">
        <div className="stat glass">
          <b>{correct}</b>
          <span>Correct</span>
        </div>
        <div className="stat glass">
          <b>{wrong}</b>
          <span>Wrong</span>
        </div>
        <div className="stat glass">
          <b>{score}%</b>
          <span>Accuracy</span>
        </div>
      </div>

      <div className="actions">
        <button className="primary" onClick={onReview}>Review Answers</button>
        <button className="secondary" onClick={onRetry}>Retry</button>
        <button className="secondary" onClick={onDashboard}>Dashboard</button>
      </div>
    </section>
  );
}

function ReviewScreen({ quiz, onBack }) {
  return (
    <section className="page active">
      <div className="page-head">
        <button className="back" onClick={onBack}>←</button>
        <div>
          <small>ANALYSIS</small>
          <h2>Answer review</h2>
        </div>
      </div>

      <div>
        {quiz.questions.map((q, index) => {
          const selected = quiz.answers[index];
          const correct = selected === q.answer;
          return (
            <div className="review" key={index}>
              <small>{q.topic}</small>
              <h3>{index + 1}. {q.q}</h3>
              <p><span className={correct ? 'good' : 'bad'}>Your answer:</span> {selected !== null && selected !== undefined ? q.options[selected] : 'No answer selected'}</p>
              <p><span className="good">Correct answer:</span> {q.options[q.answer]}</p>
              <small>{q.explanation}</small>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function ProgressScreen({ results, subjects, onBack }) {
  const totalAttempted = results.reduce((sum, r) => sum + r.total_questions, 0);
  const totalCorrect = results.reduce((sum, r) => sum + r.correct, 0);
  const totalAccuracy = totalAttempted ? Math.round((totalCorrect / totalAttempted) * 100) : 0;

  const subjectMap = {};
  results.forEach((r) => {
    if (!subjectMap[r.subject]) subjectMap[r.subject] = { attempts: 0, correct: 0 };
    subjectMap[r.subject].attempts += r.total_questions;
    subjectMap[r.subject].correct += r.correct;
  });

  return (
    <section className="page active">
      <div className="page-head">
        <button className="back" onClick={onBack}>←</button>
        <div>
          <small>YOUR PERFORMANCE</small>
          <h2>Progress</h2>
        </div>
      </div>

      <div className="progress-panel glass">
        <div><span>Questions attempted</span><b>{totalAttempted}</b></div>
        <div><span>Correct answers</span><b>{totalCorrect}</b></div>
        <div><span>Overall accuracy</span><b>{totalAccuracy}%</b></div>
        <div><span>Best streak</span><b>{results.length ? Math.max(...results.map((r) => r.score >= 50 ? 1 : 0)) : 0}</b></div>
      </div>

      <div className="heading">
        <small>SUBJECT BREAKDOWN</small>
        <h2>Where you stand</h2>
      </div>

      <div>
        {Object.keys(subjects).map((subject) => {
          const info = subjectMap[subject] || { attempts: 0, correct: 0 };
          const attempts = info.attempts;
          const correct = info.correct;
          const accuracy = attempts ? Math.round((correct / attempts) * 100) : 0;
          return (
            <div className="subject-progress" key={subject}>
              <div className="row">
                <b>{subject}</b>
                <span>{accuracy}%</span>
              </div>
              <div className="row">
                <span>{correct}/{attempts} correct</span>
                <span>{attempts} attempts</span>
              </div>
              <div className="bar"><i style={{ width: `${accuracy}%` }} /></div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function AdminScreen({ stats, onExport, onReset, onBack }) {
  return (
    <section className="page active">
      <div className="page-head">
        <button className="back" onClick={onBack}>←</button>
        <div>
          <small>ADMIN</small>
          <h2>Control center</h2>
        </div>
      </div>

      <div className="actions">
        <button className="primary" onClick={onExport}>Export All Results</button>
        <button className="secondary" onClick={onReset}>Reset Student Data</button>
      </div>

      <div className="admin-stats">
        <div className="admin-card glass">
          <small>Students</small>
          <b>{stats.students}</b>
        </div>
        <div className="admin-card glass">
          <small>Attempts</small>
          <b>{stats.attempts}</b>
        </div>
        <div className="admin-card glass">
          <small>Average score</small>
          <b>{stats.average}%</b>
        </div>
        <div className="admin-card glass">
          <small>Best score</small>
          <b>{stats.best}%</b>
        </div>
      </div>

      <div className="table-wrap glass">
        <table>
          <thead>
            <tr>
              <th>Student</th>
              <th>Subject</th>
              <th>Score</th>
              <th>Accuracy</th>
              <th>Mode</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            {stats.rows.length === 0 ? (
              <tr><td colSpan="6" style={{ padding: '20px', color: 'var(--muted)' }}>No results yet.</td></tr>
            ) : stats.rows.map((row) => (
              <tr key={row.id}>
                <td>{row.student_name}</td>
                <td>{row.subject}</td>
                <td>{row.score}%</td>
                <td>{row.accuracy}%</td>
                <td><span className="pill">{row.mode}</span></td>
                <td>{new Date(row.created_at).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function BottomNav({ current, onNavigate, isAdmin }) {
  return (
    <nav className="bottom">
      <button className={current === 'auth' ? 'active' : ''} onClick={() => onNavigate('auth')}>⌂<span>Home</span></button>
      <button className={current === 'student' ? 'active' : ''} onClick={() => onNavigate(isAdmin ? 'admin' : 'student')}>◈<span>{isAdmin ? 'Admin' : 'Student'}</span></button>
      <button className={current === 'admin' ? 'active' : ''} onClick={() => onNavigate('admin')}>◌<span>Admin</span></button>
    </nav>
  );
}

function formatTime(seconds) {
  const s = Math.max(seconds, 0);
  const mins = Math.floor(s / 60);
  const secs = s % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
      ...(localStorage.getItem('ui-prep-iq-token') ? { Authorization: `Bearer ${localStorage.getItem('ui-prep-iq-token')}` } : {})
    }
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || 'Request failed.');
  }
  return payload;
}

export default App;
