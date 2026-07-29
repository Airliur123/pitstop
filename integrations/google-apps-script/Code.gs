/**
 * PitStop Google Sheets -> signed integration endpoint.
 *
 * Install this as a spreadsheet-bound Apps Script and create an installable
 * "From spreadsheet / On form submit" trigger for onFormSubmit.
 */

var CONTROL_HEADERS = {
  id: 'PitStop Submission ID',
  status: 'PitStop Sync Status',
  syncedAt: 'PitStop Sync At',
};

function onFormSubmit(event) {
  if (!event || !event.range) {
    throw new Error('Install onFormSubmit as a spreadsheet form-submit trigger.');
  }
  syncRow_(event.range.getSheet(), event.range.getRow(), event.namedValues || {});
}

function replayFailedRows() {
  var sheet = SpreadsheetApp.getActiveSheet();
  var controls = ensureControlColumns_(sheet);
  var values = sheet.getDataRange().getDisplayValues();
  for (var rowIndex = 1; rowIndex < values.length; rowIndex += 1) {
    var status = String(values[rowIndex][controls.status - 1] || '');
    if (status.indexOf('GAGAL') === 0 || status.indexOf('RETRY') === 0) {
      syncRow_(sheet, rowIndex + 1, rowValuesByHeader_(values[0], values[rowIndex]));
    }
  }
}

function syncRow_(sheet, row, namedValues) {
  var config = readConfig_();
  var controls = ensureControlColumns_(sheet);
  var externalIdCell = sheet.getRange(row, controls.id);
  var externalId = String(externalIdCell.getValue() || '').trim();
  if (!externalId) {
    externalId = 'sheet-response-' + Utilities.getUuid();
    externalIdCell.setValue(safeCell_(externalId));
  }

  var input = normalizeNamedValues_(namedValues);
  var body = {
    payload: mapPayload_(input),
    schemaVersion: 1,
    submittedAt: submittedAt_(input),
  };
  var outcome = postWithRetry_(config, externalId, body);
  sheet.getRange(row, controls.status).setValue(safeCell_(outcome.status));
  sheet.getRange(row, controls.syncedAt).setValue(new Date());
}

function postWithRetry_(config, externalId, body) {
  var startedAt = Date.now();
  var lastCode = 'INTEGRATION_UNAVAILABLE';
  for (var attempt = 0; attempt < config.maxAttempts; attempt += 1) {
    if (Date.now() - startedAt >= config.deadlineMs) {
      return { status: 'GAGAL: DEADLINE_EXCEEDED' };
    }
    var timestamp = new Date().toISOString();
    var message = signatureMessage_(config.sourceId, externalId, timestamp, body);
    var signature = hmacHex_(message, config.secret);
    try {
      var response = UrlFetchApp.fetch(config.endpoint, {
        contentType: 'application/json',
        followRedirects: false,
        headers: {
          'X-PitStop-Key-Id': config.keyId,
          'X-PitStop-Signature': signature,
          'X-PitStop-Source': config.sourceId,
          'X-PitStop-Submission-Id': externalId,
          'X-PitStop-Timestamp': timestamp,
        },
        method: 'post',
        muteHttpExceptions: true,
        payload: JSON.stringify(body),
      });
      var statusCode = response.getResponseCode();
      if (statusCode === 202) {
        return { status: 'DITERIMA (menunggu worker/moderasi)' };
      }
      lastCode = safeProblemCode_(response.getContentText());
      if (statusCode >= 400 && statusCode < 500 && statusCode !== 408 && statusCode !== 429) {
        return { status: 'GAGAL: ' + lastCode };
      }
    } catch (error) {
      lastCode = 'NETWORK_ERROR';
    }
    if (attempt + 1 < config.maxAttempts) {
      Utilities.sleep(Math.min(30000, config.initialBackoffMs * Math.pow(2, attempt)));
    }
  }
  return { status: 'RETRY GAGAL: ' + lastCode };
}

function mapPayload_(values) {
  var category = required_(values, 'Kategori');
  var priceCategory = category === 'MAKAN_MURAH' || category === 'NGOPI';
  var payload = {
    address: required_(values, 'Alamat'),
    area: required_(values, 'Wilayah/Area'),
    category: category,
    facilities: parseFacilities_(optional_(values, 'Fasilitas')),
    openingHours: parseOpeningHours_(optional_(values, 'Jam Operasional')),
    placeName: required_(values, 'Nama Tempat'),
  };
  putOptional_(payload, 'landmark', optional_(values, 'Patokan'));
  putOptional_(payload, 'mapUrl', optional_(values, 'Google Maps URL'));
  putOptional_(payload, 'notes', optional_(values, 'Catatan'));
  putOptional_(payload, 'submitterEmail', optional_(values, 'Email Pengisi'));
  if (priceCategory) {
    payload.cheapestMenuName = required_(values, 'Menu Utama/Termurah');
    payload.cheapestMenuPrice = parseRupiah_(required_(values, 'Harga Termurah'));
    payload.maximumUsefulBudget = parseRupiah_(required_(values, 'Budget Maksimum'));
    var minimum = optional_(values, 'Kisaran Harga Minimum');
    var maximum = optional_(values, 'Kisaran Harga Maksimum');
    if (minimum || maximum) {
      payload.priceRange = {
        maximum: parseRupiah_(maximum || minimum),
        minimum: parseRupiah_(minimum || maximum),
      };
    }
  }
  return payload;
}

function signatureMessage_(sourceId, externalId, timestamp, body) {
  return ['pitstop-google-form-v1', sourceId, externalId, timestamp, canonicalJson_(body)].join(
    '\n',
  );
}

function canonicalJson_(value) {
  if (value === null || typeof value === 'number' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  if (typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return '[' + value.map(canonicalJson_).join(',') + ']';
  }
  var keys = Object.keys(value)
    .filter(function (key) {
      return value[key] !== undefined;
    })
    .sort();
  return (
    '{' +
    keys
      .map(function (key) {
        return JSON.stringify(key) + ':' + canonicalJson_(value[key]);
      })
      .join(',') +
    '}'
  );
}

function hmacHex_(message, secret) {
  return Utilities.computeHmacSha256Signature(message, secret, Utilities.Charset.UTF_8)
    .map(function (byte) {
      return ((byte + 256) % 256).toString(16).padStart(2, '0');
    })
    .join('');
}

function readConfig_() {
  var properties = PropertiesService.getScriptProperties();
  return {
    deadlineMs: positiveInteger_(properties.getProperty('PITSTOP_REQUEST_DEADLINE_MS') || '90000'),
    endpoint: requiredProperty_(properties, 'PITSTOP_ENDPOINT'),
    initialBackoffMs: positiveInteger_(
      properties.getProperty('PITSTOP_INITIAL_BACKOFF_MS') || '1000',
    ),
    keyId: requiredProperty_(properties, 'PITSTOP_CURRENT_KEY_ID'),
    maxAttempts: positiveInteger_(properties.getProperty('PITSTOP_MAX_ATTEMPTS') || '5'),
    secret: requiredProperty_(properties, 'PITSTOP_HMAC_SECRET'),
    sourceId: requiredProperty_(properties, 'PITSTOP_SOURCE_ID'),
  };
}

function ensureControlColumns_(sheet) {
  var lastColumn = Math.max(1, sheet.getLastColumn());
  var headers = sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0];
  var result = {};
  Object.keys(CONTROL_HEADERS).forEach(function (key) {
    var label = CONTROL_HEADERS[key];
    var index = headers.indexOf(label);
    if (index < 0) {
      index = headers.length;
      headers.push(label);
      sheet.getRange(1, index + 1).setValue(label);
    }
    result[key] = index + 1;
  });
  return result;
}

function normalizeNamedValues_(namedValues) {
  var normalized = {};
  Object.keys(namedValues).forEach(function (key) {
    var value = namedValues[key];
    normalized[String(key).trim()] = Array.isArray(value)
      ? String(value[0] || '').trim()
      : String(value || '').trim();
  });
  return normalized;
}

function rowValuesByHeader_(headers, row) {
  var values = {};
  headers.forEach(function (header, index) {
    values[String(header).trim()] = [String(row[index] || '')];
  });
  return values;
}

function submittedAt_(values) {
  var raw = optional_(values, 'Timestamp');
  var parsed = raw ? new Date(raw) : new Date();
  if (isNaN(parsed.getTime())) {
    throw new Error('Timestamp Form tidak valid.');
  }
  return parsed.toISOString();
}

function parseFacilities_(value) {
  if (!value) return [];
  return value.split(',').map(function (entry) {
    var parts = entry.split(':');
    return {
      code: String(parts[0] || '')
        .trim()
        .toUpperCase(),
      status: String(parts[1] || 'AVAILABLE')
        .trim()
        .toUpperCase(),
    };
  });
}

function parseOpeningHours_(value) {
  if (!value) return [];
  var parsed = JSON.parse(value);
  if (!Array.isArray(parsed)) throw new Error('Jam Operasional harus berupa JSON array.');
  return parsed;
}

function parseRupiah_(value) {
  if (typeof value === 'number') {
    return assertSupportedRupiah_(value);
  }
  var normalized = String(value).trim();
  if (/^[=+\-@]/.test(normalized)) {
    throw new Error('Nilai rupiah tidak boleh berupa formula spreadsheet.');
  }
  var match = /^(?:Rp\s*)?(\d+|\d{1,3}(?:\.\d{3})+)$/i.exec(normalized);
  if (!match) {
    throw new Error('Format rupiah tidak valid. Gunakan 12000, 12.000, atau Rp 12.000.');
  }
  return assertSupportedRupiah_(Number(match[1].replace(/\./g, '')));
}

function assertSupportedRupiah_(amount) {
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > 10000000) {
    throw new Error('Nilai rupiah berada di luar batas yang didukung.');
  }
  return amount;
}

/**
 * Manual parity check for the public fixture at fixtures/rupiah-v1.json.
 * Run from the Apps Script editor after updating the template.
 */
function runPitStopRupiahParserSelfTest() {
  var fixture = rupiahParityFixture_();
  fixture.valid.forEach(function (sample) {
    if (parseRupiah_(sample.input) !== sample.expected) {
      throw new Error('Fixture rupiah valid tidak cocok: ' + JSON.stringify(sample.input));
    }
  });
  fixture.invalid.forEach(function (sample) {
    var rejected = false;
    try {
      parseRupiah_(sample.input);
    } catch (error) {
      rejected = true;
    }
    if (!rejected) {
      throw new Error('Fixture rupiah invalid diterima: ' + JSON.stringify(sample.input));
    }
  });
  return true;
}

function rupiahParityFixture_() {
  return {
    valid: [
      { input: 12000, expected: 12000 },
      { input: '12000', expected: 12000 },
      { input: '12.000', expected: 12000 },
      { input: 'Rp 12.000', expected: 12000 },
      { input: 'Rp10000', expected: 10000 },
      { input: '10.000.000', expected: 10000000 },
    ],
    invalid: [
      { input: '-12000' },
      { input: 12000.5 },
      { input: '12.000,50' },
      { input: '12,000.00' },
      { input: '12rb' },
      { input: '=12000' },
      { input: '+12000' },
      { input: '@12000' },
      { input: '10000001' },
      { input: '9007199254740993' },
    ],
  };
}

function putOptional_(target, key, value) {
  if (value) target[key] = value;
}

function required_(values, key) {
  var value = optional_(values, key);
  if (!value) throw new Error(key + ' wajib diisi.');
  return value;
}

function optional_(values, key) {
  return String(values[key] || '').trim();
}

function safeCell_(value) {
  var cleaned = String(value)
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .trim();
  return /^[=+\-@]/.test(cleaned) ? "'" + cleaned : cleaned;
}

function safeProblemCode_(body) {
  try {
    var parsed = JSON.parse(body);
    var code = String(parsed.code || (parsed.error && parsed.error.code) || 'HTTP_ERROR');
    return safeCell_(code).slice(0, 120);
  } catch (error) {
    return 'HTTP_ERROR';
  }
}

function requiredProperty_(properties, key) {
  var value = properties.getProperty(key);
  if (!value) throw new Error('Script Property ' + key + ' belum dikonfigurasi.');
  return value;
}

function positiveInteger_(value) {
  var parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error('Konfigurasi integer tidak valid.');
  return parsed;
}
