import { useCallback, useEffect, useMemo, useState } from 'react';
import './styles.css';

const GEO_API = 'https://geocoding-api.open-meteo.com/v1/search';
const WEATHER_API = 'https://api.open-meteo.com/v1/forecast';
const defaultPlace = { name: 'Ibadan', country: 'Nigeria', latitude: 7.3775, longitude: 3.947 };

const codes = {
  0: ['Clear sky', '☀️'], 1: ['Mainly clear', '🌤️'], 2: ['Partly cloudy', '⛅'], 3: ['Overcast', '☁️'],
  45: ['Foggy', '🌫️'], 48: ['Rime fog', '🌫️'], 51: ['Light drizzle', '🌦️'], 53: ['Drizzle', '🌦️'], 55: ['Heavy drizzle', '🌧️'],
  61: ['Light rain', '🌦️'], 63: ['Rain', '🌧️'], 65: ['Heavy rain', '🌧️'], 71: ['Light snow', '🌨️'], 73: ['Snow', '🌨️'],
  75: ['Heavy snow', '❄️'], 80: ['Rain showers', '🌦️'], 81: ['Rain showers', '🌧️'], 82: ['Heavy showers', '⛈️'],
  85: ['Snow showers', '🌨️'], 86: ['Heavy snow showers', '❄️'], 95: ['Thunderstorm', '⛈️'], 96: ['Thunderstorm with hail', '⛈️'], 99: ['Thunderstorm with hail', '⛈️']
};

const describe = (code) => codes[code] || ['Unknown conditions', '🌡️'];
const request = async (url) => { const response = await fetch(url); if (!response.ok) throw new Error('Weather service is unavailable.'); return response.json(); };
const dayName = (date) => new Date(`${date}T12:00:00`).toLocaleDateString([], { weekday: 'short' });
const timeName = (date) => new Date(date).toLocaleTimeString([], { hour: 'numeric' });

export default function App() {
  const [place, setPlace] = useState(() => JSON.parse(localStorage.getItem('weather-place') || 'null') || defaultPlace);
  const [weather, setWeather] = useState(null);
  const [query, setQuery] = useState('');
  const [unit, setUnit] = useState('celsius');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [theme, setTheme] = useState(() => localStorage.getItem('weather-theme') || 'dark');
  const [saved, setSaved] = useState(() => JSON.parse(localStorage.getItem('weather-saved') || '[]'));

  const loadWeather = useCallback(async (location) => {
    setLoading(true); setError('');
    try {
      const params = new URLSearchParams({
        latitude: location.latitude, longitude: location.longitude, timezone: 'auto', forecast_days: '7',
        temperature_unit: unit, wind_speed_unit: 'kmh', precipitation_unit: 'mm',
        current: 'temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,cloud_cover,pressure_msl,wind_speed_10m,wind_direction_10m',
        hourly: 'temperature_2m,precipitation_probability,weather_code,wind_speed_10m',
        daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset,uv_index_max'
      });
      const data = await request(`${WEATHER_API}?${params}`);
      setWeather(data);
      setPlace(location);
      localStorage.setItem('weather-place', JSON.stringify(location));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [unit]);

  useEffect(() => { loadWeather(place); }, [loadWeather]);
  useEffect(() => { document.body.dataset.theme = theme; localStorage.setItem('weather-theme', theme); }, [theme]);
  useEffect(() => { localStorage.setItem('weather-saved', JSON.stringify(saved)); }, [saved]);

  async function search(event) {
    event.preventDefault();
    if (!query.trim()) return;
    setLoading(true); setError('');
    try {
      const data = await request(`${GEO_API}?name=${encodeURIComponent(query.trim())}&count=1&language=en&format=json`);
      if (!data.results?.length) throw new Error('City not found. Try another city.');
      await loadWeather(data.results[0]);
      setQuery('');
    } catch (e) {
      setError(e.message);
      setLoading(false);
    }
  }

  function locate() {
    if (!navigator.geolocation) return setError('Geolocation is not supported by this browser.');
    setLoading(true);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => loadWeather({ name: 'Your location', latitude: coords.latitude, longitude: coords.longitude }),
      () => { setLoading(false); setError('Location permission was not granted.'); }
    );
  }

  function toggleSaved() {
    const key = `${place.latitude},${place.longitude}`;
    setSaved(saved.some((x) => `${x.latitude},${x.longitude}` === key)
      ? saved.filter((x) => `${x.latitude},${x.longitude}` !== key)
      : [...saved, place].slice(-6));
  }

  async function share() {
    const data = { title: 'Skyline Weather', text: `Check the weather dashboard for ${place.name}.`, url: window.location.href };
    try {
      if (navigator.share) await navigator.share(data);
      else { await navigator.clipboard.writeText(window.location.href); alert('Dashboard link copied.'); }
    } catch (e) {
      if (e.name !== 'AbortError') alert(window.location.href);
    }
  }

  const current = weather?.current;
  const daily = weather?.daily;
  const hourly = weather?.hourly;
  const info = current ? describe(current.weather_code) : ['Unknown', '🌡️'];
  const savedNow = saved.some((x) => `${x.latitude},${x.longitude}` === `${place.latitude},${place.longitude}`);
  const symbol = unit === 'celsius' ? '°C' : '°F';

  const hours = useMemo(() => {
    if (!hourly || !current) return [];
    const start = Math.max(0, hourly.time.findIndex((t) => t >= current.time));
    return hourly.time.slice(start, start + 12).map((time, i) => ({
      time,
      temp: hourly.temperature_2m[start + i],
      rain: hourly.precipitation_probability[start + i],
      code: hourly.weather_code[start + i]
    }));
  }, [hourly, current]);

  return (
    <div className="weather-app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-icon">☁</span>
          <div><strong>Skyline</strong><small>Live weather dashboard</small></div>
        </div>
        <div className="top-actions">
          <button className="icon-button" onClick={share} title="Share">↗</button>
          <button className="icon-button" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} title="Theme">{theme === 'dark' ? '☀' : '☾'}</button>
        </div>
      </header>

      <main className="dashboard">
        <section className="search-row">
          <form className="search-box" onSubmit={search}>
            <span>⌕</span>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search for a city..." />
            <button type="submit">Search</button>
          </form>
          <button className="location-button" onClick={locate}>⌖ Use my location</button>
        </section>

        {error && <div className="error-banner">⚠ {error}<button onClick={() => setError('')}>×</button></div>}

        {loading && <div className="panel loading-card"><div className="spinner" /> Loading weather...</div>}

        {!loading && weather && current && daily && (
          <>
            <section className="hero-weather panel">
              <div className="hero-location">
                <div>
                  <span className="eyebrow">CURRENT WEATHER</span>
                  <h1>{place.name}</h1>
                  <p>{place.admin1 ? `${place.admin1}, ` : ''}{place.country || ''}</p>
                </div>
                <button className={`save-button ${savedNow ? 'saved' : ''}`} onClick={toggleSaved}>{savedNow ? '★ Saved' : '☆ Save'}</button>
              </div>

              <div className="hero-reading">
                <div className="weather-symbol">{info[1]}</div>
                <div>
                  <div className="temperature">{Math.round(current.temperature_2m)}<sup>{symbol}</sup></div>
                  <strong>{info[0]}</strong>
                  <p>Feels like {Math.round(current.apparent_temperature)}{symbol}</p>
                </div>
                <div className="high-low">
                  <span>H {Math.round(daily.temperature_2m_max[0])}{symbol}</span>
                  <span>L {Math.round(daily.temperature_2m_min[0])}{symbol}</span>
                </div>
              </div>
            </section>

            <div className="content-grid">
              <section className="panel">
                <div className="section-heading">
                  <div>
                    <span className="eyebrow">AT A GLANCE</span>
                    <h2>Weather details</h2>
                  </div>
                  <div className="unit-toggle">
                    <button className={unit === 'celsius' ? 'active' : ''} onClick={() => setUnit('celsius')}>°C</button>
                    <button className={unit === 'fahrenheit' ? 'active' : ''} onClick={() => setUnit('fahrenheit')}>°F</button>
                  </div>
                </div>
                <div className="detail-grid">
                  <Detail icon="💧" label="Humidity" value={`${current.relative_humidity_2m}%`} />
                  <Detail icon="💨" label="Wind" value={`${Math.round(current.wind_speed_10m)} km/h`} />
                  <Detail icon="🧭" label="Direction" value={`${Math.round(current.wind_direction_10m)}°`} />
                  <Detail icon="☁️" label="Cloud cover" value={`${current.cloud_cover}%`} />
                  <Detail icon="🌧️" label="Precipitation" value={`${current.precipitation} mm`} />
                  <Detail icon="🔽" label="Pressure" value={`${Math.round(current.pressure_msl)} hPa`} />
                </div>
              </section>

              <section className="panel">
                <span className="eyebrow">TODAY'S SUN</span>
                <h2>Daylight</h2>
                <div className="sun-row">
                  <span>🌅 Sunrise<strong>{new Date(daily.sunrise[0]).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</strong></span>
                  <span>🌇 Sunset<strong>{new Date(daily.sunset[0]).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</strong></span>
                </div>
                <div className="uv"><span>UV index</span><strong>{Math.round(daily.uv_index_max[0])}</strong></div>
              </section>
            </div>

            <section className="panel">
              <div className="section-heading">
                <div>
                  <span className="eyebrow">NEXT 12 HOURS</span>
                  <h2>Hourly forecast</h2>
                </div>
                <span className="muted">Rain probability</span>
              </div>
              <div className="hourly-row">
                {hours.map((item) => (
                  <div className="hour-card" key={item.time}>
                    <span>{timeName(item.time)}</span>
                    <b>{describe(item.code)[1]}</b>
                    <strong>{Math.round(item.temp)}°</strong>
                    <small>💧 {item.rain}%</small>
                  </div>
                ))}
              </div>
            </section>

            <section className="panel">
              <span className="eyebrow">7-DAY OUTLOOK</span>
              <h2>Daily forecast</h2>
              <div className="daily-list">
                {daily.time.map((day, index) => {
                  const detail = describe(daily.weather_code[index]);
                  return (
                    <div className="day-row" key={day}>
                      <strong>{index === 0 ? 'Today' : dayName(day)}</strong>
                      <span className="day-condition"><b>{detail[1]}</b>{detail[0]}</span>
                      <span className="rain-chance">💧 {daily.precipitation_probability_max[index]}%</span>
                      <span className="day-temps"><b>{Math.round(daily.temperature_2m_max[index])}°</b><span>{Math.round(daily.temperature_2m_min[index])}°</span></span>
                    </div>
                  );
                })}
              </div>
            </section>

            {saved.length > 0 && (
              <section className="panel">
                <span className="eyebrow">YOUR PLACES</span>
                <h2>Saved locations</h2>
                <div className="saved-list">
                  {saved.map((item) => (
                    <button className="saved-city" key={`${item.latitude}-${item.longitude}`} onClick={() => loadWeather(item)}>
                      📍 {item.name}{item.country ? `, ${item.country}` : ''}
                    </button>
                  ))}
                </div>
              </section>
            )}

            <footer>Weather data by <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo</a> · No API key required</footer>
          </>
        )}
      </main>
    </div>
  );
}

function Detail({ icon, label, value }) {
  return (
    <div className="detail">
      <span>{icon}</span>
      <div>
        <small>{label}</small>
        <strong>{value}</strong>
      </div>
    </div>
  );
}
