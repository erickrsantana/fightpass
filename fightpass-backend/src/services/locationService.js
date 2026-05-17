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

async function geocodeWithOpenStreetMap(formattedAddress, address) {
  const params = new URLSearchParams({
    format: "jsonv2",
    q: `${formattedAddress}, Brasil`,
    countrycodes: "br",
    limit: "1"
  });

  const data = await fetchJson(`${env.location.openStreetMapGeocodingUrl}?${params.toString()}`, {
    headers: {
      "User-Agent": `${env.appName}/1.0 (prototipo academico FightPass)`
    }
  });
  const result = Array.isArray(data) ? data[0] : null;

  if (!result || !result.lat || !result.lon) {
    return null;
  }

  return {
    ...address,
    formattedAddress: result.display_name || formattedAddress,
    latitude: Number(result.lat),
    longitude: Number(result.lon),
    geocodingProvider: "openstreetmap",
    geocodingStatus: "success",
    geocodedAt: new Date()
  };
}

async function geocodeAddress(address) {
  const formattedAddress = buildFormattedAddress(address);

  try {
    if (env.location.googleGeocodingApiKey) {
      const googleResult = await geocodeWithGoogle(formattedAddress, address);
      if (googleResult) {
        return googleResult;
      }
    }

    const openStreetMapResult = await geocodeWithOpenStreetMap(formattedAddress, address);
    if (openStreetMapResult) {
      return openStreetMapResult;
    }
  } catch (error) {
    // Em caso de indisponibilidade externa, a aplicação mantém o endereço e sinaliza a pendência.
  }

  return {
    ...address,
    formattedAddress,
    geocodingProvider: env.location.googleGeocodingApiKey ? "google/openstreetmap" : "openstreetmap",
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
  const resolved = await resolveCep(payload.zipCode, payload.number, payload.complement);

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
