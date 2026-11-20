const db = require("../database/connection");
const env = require("../config/env");
const { ApiError } = require("../lib/http");

function onlyDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

function normalizeZipCode(value) {
  const digits = onlyDigits(value);
  if (digits.length !== 8) {
    throw new ApiError(422, "CEP invalido");
  }
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

function buildFormattedAddress(address) {
  return [
    [address.street, address.number].filter(Boolean).join(", "),
    address.neighborhood,
    address.city,
    address.state,
    address.zipCode
  ].filter(Boolean).join(" - ");
}

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.location.geocodingTimeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        ...(options.headers || {})
      }
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function findCepInCache(zipCode) {
  const rows = await db.query(
    `SELECT zip_code, street, neighborhood, city, state, formatted_address,
            latitude, longitude, geocoding_provider, geocoding_status, geocoded_at
     FROM cep_cache
     WHERE zip_code = ?
     LIMIT 1`,
    [zipCode]
  );
  return rows[0] || null;
}

async function findAddressByCep(zipCode) {
  const cached = await findCepInCache(zipCode);
  if (cached) {
    return {
      zipCode: cached.zip_code,
      street: cached.street,
      neighborhood: cached.neighborhood,
      city: cached.city,
      state: cached.state,
      formattedAddress: cached.formatted_address,
      latitude: cached.latitude,
      longitude: cached.longitude,
      geocodingProvider: cached.geocoding_provider,
      geocodingStatus: cached.geocoding_status,
      geocodedAt: cached.geocoded_at,
      source: "cache"
    };
  }

  const digits = onlyDigits(zipCode);
  const data = await fetchJson(`https://viacep.com.br/ws/${digits}/json/`);
  if (data.erro) {
    throw new ApiError(404, "CEP nao encontrado");
  }

  const address = {
    zipCode,
    street: data.logradouro || null,
    neighborhood: data.bairro || null,
    city: data.localidade,
    state: data.uf,
    formattedAddress: null,
    latitude: null,
    longitude: null,
    geocodingProvider: null,
    geocodingStatus: "pending",
    geocodedAt: null,
    source: "viacep"
  };

  await db.query(
    `INSERT INTO cep_cache
       (zip_code, street, neighborhood, city, state, formatted_address, geocoding_status)
     VALUES (?, ?, ?, ?, ?, ?, 'pending')
     ON DUPLICATE KEY UPDATE
       street = VALUES(street),
       neighborhood = VALUES(neighborhood),
       city = VALUES(city),
       state = VALUES(state),
       formatted_address = VALUES(formatted_address)`,
    [
      address.zipCode,
      address.street,
      address.neighborhood,
      address.city,
      address.state,
      buildFormattedAddress(address)
    ]
  );

  return address;
}

async function geocodeWithGoogle(formattedAddress, address) {
  const params = new URLSearchParams({
    address: formattedAddress,
    key: env.location.googleGeocodingApiKey,
    region: "br"
  });
  const data = await fetchJson(`https://maps.googleapis.com/maps/api/geocode/json?${params.toString()}`);
  const result = data.results && data.results[0];

  if (data.status !== "OK" || !result) {
    return null;
  }

  return {
    ...address,
    formattedAddress: result.formatted_address || formattedAddress,
    latitude: result.geometry.location.lat,
    longitude: result.geometry.location.lng,
    geocodingProvider: "google",
    geocodingStatus: "success",
    geocodedAt: new Date()
  };
}

function validCoords(lat, lng) {
  const latitude = Number(lat);
  const longitude = Number(lng);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (latitude === 0 && longitude === 0) return null;
  if (latitude < -34 || latitude > 6 || longitude < -74 || longitude > -28) return null; // fora do Brasil
  return { latitude, longitude };
}

function success(address, coords, provider, formattedAddress) {
  return {
    ...address,
    formattedAddress: formattedAddress || address.formattedAddress || buildFormattedAddress(address),
    latitude: coords.latitude,
    longitude: coords.longitude,
    geocodingProvider: provider,
    geocodingStatus: "success",
    geocodedAt: new Date()
  };
}

async function nominatimSearch(params) {
  const search = new URLSearchParams({
    format: "jsonv2",
    countrycodes: "br",
    limit: "1",
    ...params
  });
  const data = await fetchJson(`${env.location.openStreetMapGeocodingUrl}?${search.toString()}`, {
    headers: {
      "User-Agent": `${env.appName}/1.0 (prototipo academico FightPass; https://fightpassfinal.vercel.app)`,
      "Accept-Language": "pt-BR"
    }
  });
  const result = Array.isArray(data) ? data[0] : null;
  if (!result) return null;
  const coords = validCoords(result.lat, result.lon);
  return coords ? { coords, displayName: result.display_name } : null;
}

async function geocodeWithBrasilApi(address) {
  const digits = onlyDigits(address.zipCode);
  const data = await fetchJson(`https://brasilapi.com.br/api/cep/v2/${digits}`);
  const point = data && data.location && data.location.coordinates;
  return point ? validCoords(point.latitude, point.longitude) : null;
}

async function geocodeWithAwesomeApi(address) {
  const digits = onlyDigits(address.zipCode);
  const data = await fetchJson(`https://cep.awesomeapi.com.br/json/${digits}`);
  return data ? validCoords(data.lat, data.lng) : null;
}

async function geocodeAddress(address) {
  const formattedAddress = buildFormattedAddress(address);
  const startedAt = Date.now();
  const street = address.street || "";
  const number = address.number || "";
  const neighborhood = address.neighborhood || "";
  const city = address.city || "";
  const state = address.state || "";
  const where = [city, state].filter(Boolean).join(", ");

  // Do mais preciso para o mais aproximado. Cada tentativa que falha e registrada e a proxima e tentada.
  const attempts = [];
  if (env.location.googleGeocodingApiKey) {
    attempts.push(["google", async () => {
      const found = await geocodeWithGoogle(formattedAddress, address);
      return found ? { done: found } : null;
    }]);
  }
  if (street) {
    attempts.push(["osm:rua+numero", async () => {
      const q = [[street, number].filter(Boolean).join(", "), neighborhood, where].filter(Boolean).join(", ");
      const hit = await nominatimSearch({ q });
      return hit ? { coords: hit.coords, name: hit.displayName, provider: "openstreetmap" } : null;
    }]);
    attempts.push(["osm:rua", async () => {
      const hit = await nominatimSearch({ q: [street, where].filter(Boolean).join(", ") });
      return hit ? { coords: hit.coords, name: hit.displayName, provider: "openstreetmap" } : null;
    }]);
  }
  attempts.push(["brasilapi:cep", async () => {
    const coords = await geocodeWithBrasilApi(address);
    return coords ? { coords, provider: "brasilapi" } : null;
  }]);
  attempts.push(["awesomeapi:cep", async () => {
    const coords = await geocodeWithAwesomeApi(address);
    return coords ? { coords, provider: "awesomeapi" } : null;
  }]);
  attempts.push(["osm:cep", async () => {
    const hit = await nominatimSearch({ postalcode: address.zipCode, country: "Brazil" });
    return hit ? { coords: hit.coords, name: hit.displayName, provider: "openstreetmap" } : null;
  }]);
  if (neighborhood) {
    attempts.push(["osm:bairro", async () => {
      const hit = await nominatimSearch({ q: [neighborhood, where].filter(Boolean).join(", ") });
      return hit ? { coords: hit.coords, name: hit.displayName, provider: "openstreetmap-bairro" } : null;
    }]);
  }

  for (const [label, run] of attempts) {
    if (Date.now() - startedAt > 15000) break;
    try {
      const found = await run();
      if (found && found.done) return found.done;
      if (found && found.coords) {
        return success(address, found.coords, found.provider, formattedAddress);
      }
      console.warn(`[geocoding] ${label}: sem resultado para ${address.zipCode}`);
    } catch (error) {
      console.warn(`[geocoding] ${label}: ${error.message}`);
    }
  }

  return {
    ...address,
    formattedAddress,
    geocodingProvider: "openstreetmap",
    geocodingStatus: "failed",
    geocodedAt: new Date()
  };
}

async function resolveCep(zipCode, number = null, complement = null) {
  const normalizedZipCode = normalizeZipCode(zipCode);
  const baseAddress = await findAddressByCep(normalizedZipCode);

  if (baseAddress.latitude && baseAddress.longitude && !number) {
    return baseAddress;
  }

  const resolved = await geocodeAddress({
    ...baseAddress,
    number: number || null,
    complement: complement || null
  });

  await db.query(
    `UPDATE cep_cache
     SET formatted_address = ?, latitude = ?, longitude = ?, geocoding_provider = ?,
         geocoding_status = ?, geocoded_at = ?
     WHERE zip_code = ?`,
    [
      resolved.formattedAddress,
      resolved.latitude,
      resolved.longitude,
      resolved.geocodingProvider,
      resolved.geocodingStatus,
      resolved.geocodedAt,
      normalizedZipCode
    ]
  );

  return resolved;
}

async function upsertInstitutionAddress(institutionId, payload, connection = null) {
  const executor = connection || db;
  let resolved = await resolveCep(payload.zipCode, payload.number, payload.complement);

  // Coordenadas informadas manualmente pelo administrador (quando o CEP nao localiza sozinho)
  const manual = payload.latitude && payload.longitude ? validCoords(payload.latitude, payload.longitude) : null;
  if (manual) {
    resolved = success(resolved, manual, "manual", resolved.formattedAddress);
  }

  await executor.query(
    `INSERT INTO addresses
       (institution_id, street, number, complement, neighborhood, city, state, zip_code,
        formatted_address, latitude, longitude, geocoding_provider, geocoding_status, geocoded_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       street = VALUES(street),
       number = VALUES(number),
       complement = VALUES(complement),
       neighborhood = VALUES(neighborhood),
       city = VALUES(city),
       state = VALUES(state),
       zip_code = VALUES(zip_code),
       formatted_address = VALUES(formatted_address),
       latitude = VALUES(latitude),
       longitude = VALUES(longitude),
       geocoding_provider = VALUES(geocoding_provider),
       geocoding_status = VALUES(geocoding_status),
       geocoded_at = VALUES(geocoded_at)`,
    [
      institutionId,
      resolved.street || "",
      payload.number,
      payload.complement || null,
      resolved.neighborhood || "",
      resolved.city,
      resolved.state,
      resolved.zipCode,
      resolved.formattedAddress,
      resolved.latitude,
      resolved.longitude,
      resolved.geocodingProvider,
      resolved.geocodingStatus,
      resolved.geocodedAt
    ]
  );

  return resolved;
}

module.exports = {
  normalizeZipCode,
  resolveCep,
  upsertInstitutionAddress
};
