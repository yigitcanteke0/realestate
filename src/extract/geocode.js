export async function geocode(fetchFn, address) {
  try {
    const q = encodeURIComponent(`${address}, Cassino, FR, Italia`);
    const r = await fetchFn(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${q}`, {
      headers: { Accept: 'application/json' },
    });
    if (!r?.ok) return null;
    const [hit] = await r.json();
    const lat = Number(hit?.lat);
    const lng = Number(hit?.lon);
    return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng, method: 'geocoder' } : null;
  } catch {
    return null;
  }
}
