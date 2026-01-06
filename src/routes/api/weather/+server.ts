import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// Open-Meteo API (free, no API key required)
const GEOCODING_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const WEATHER_URL = 'https://api.open-meteo.com/v1/forecast';

// Weather code to condition mapping
const WEATHER_CONDITIONS: Record<number, string> = {
  0: 'Clear sky',
  1: 'Mainly clear',
  2: 'Partly cloudy',
  3: 'Overcast',
  45: 'Foggy',
  48: 'Depositing rime fog',
  51: 'Light drizzle',
  53: 'Moderate drizzle',
  55: 'Dense drizzle',
  61: 'Slight rain',
  63: 'Moderate rain',
  65: 'Heavy rain',
  71: 'Slight snow',
  73: 'Moderate snow',
  75: 'Heavy snow',
  77: 'Snow grains',
  80: 'Slight rain showers',
  81: 'Moderate rain showers',
  82: 'Violent rain showers',
  85: 'Slight snow showers',
  86: 'Heavy snow showers',
  95: 'Thunderstorm',
  96: 'Thunderstorm with slight hail',
  99: 'Thunderstorm with heavy hail',
};

export const GET: RequestHandler = async ({ url }) => {
  const location = url.searchParams.get('location');

  if (!location) {
    return json({ error: 'Location required' }, { status: 400 });
  }

  try {
    // Get coordinates from location name
    const geoResponse = await fetch(
      `${GEOCODING_URL}?name=${encodeURIComponent(location)}&count=1&language=en&format=json`
    );
    const geoData = await geoResponse.json();

    if (!geoData.results?.length) {
      return json({ error: 'Location not found' }, { status: 404 });
    }

    const { latitude, longitude, name, country } = geoData.results[0];

    // Get current weather
    const weatherResponse = await fetch(
      `${WEATHER_URL}?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m&timezone=auto`
    );
    const weatherData = await weatherResponse.json();

    const current = weatherData.current;
    const weatherCode = current.weather_code;

    return json({
      location: `${name}, ${country}`,
      temperature: Math.round(current.temperature_2m),
      feelsLike: Math.round(current.apparent_temperature),
      humidity: current.relative_humidity_2m,
      windSpeed: Math.round(current.wind_speed_10m),
      weatherCode,
      condition: WEATHER_CONDITIONS[weatherCode] || 'Unknown',
    });
  } catch (error) {
    console.error('Weather API error:', error);
    return json({ error: 'Failed to fetch weather' }, { status: 500 });
  }
};
