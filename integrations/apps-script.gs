// ============================================================
//  RIDERA — Apps Script CORREGIDO
//  Cambios:
//  - doPost ya NO acepta aprobado desde el cliente
//  - Elimina la lógica que aprobaba registros previos
//  - Envía email de notificación al admin cuando llega registro
// ============================================================

var ADMIN_EMAIL = 'multiservicioslavina@gmail.com';

function doPost(e) {
  var ss   = SpreadsheetApp.getActiveSpreadsheet();
  var data = JSON.parse(e.postData.contents);
  var tipo = data.tipo || 'Sin tipo';

  data.aprobado = 'NO';

  var sheet = ss.getSheetByName(tipo);
  if (!sheet) {
    sheet = ss.insertSheet(tipo);
  }

  if (sheet.getLastRow() === 0) {
    var headers = Object.keys(data);
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length)
      .setBackground('#E85D20')
      .setFontColor('#ffffff')
      .setFontWeight('bold');
  } else {
    var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    var headersLower = headers.map(function(h) { return String(h).trim().toLowerCase(); });
    var dataKeys = Object.keys(data);
    for (var ki = 0; ki < dataKeys.length; ki++) {
      if (headersLower.indexOf(dataKeys[ki].toLowerCase()) === -1) {
        var nextCol = sheet.getLastColumn() + 1;
        sheet.getRange(1, nextCol).setValue(dataKeys[ki]);
        sheet.getRange(1, nextCol)
          .setBackground('#E85D20')
          .setFontColor('#ffffff')
          .setFontWeight('bold');
        headersLower.push(dataKeys[ki].toLowerCase());
      }
    }
  }

  var currentHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var row = currentHeaders.map(function(h) {
    var key = String(h).trim().toLowerCase();
    for (var k in data) {
      if (k.toLowerCase() === key) return data[k];
    }
    return '';
  });

  sheet.appendRow(row);

  try {
    var nombre  = data.nombre   || '(sin nombre)';
    var ciudad  = data.ciudad   || '(sin ciudad)';
    var tel     = data.telefono || '(sin teléfono)';
    var sheetUrl = ss.getUrl();
    MailApp.sendEmail({
      to:      ADMIN_EMAIL,
      subject: '🏪 Nuevo almacén en Ridera: ' + nombre,
      htmlBody:
        '<h2 style="color:#E85D20">Nuevo almacén registrado</h2>' +
        '<p><b>Nombre:</b> ' + nombre + '</p>' +
        '<p><b>Ciudad:</b> ' + ciudad + '</p>' +
        '<p><b>Teléfono:</b> ' + tel + '</p>' +
        '<p><b>Tipo:</b> ' + tipo + '</p>' +
        '<p><b>Fecha:</b> ' + new Date().toLocaleString('es-CO') + '</p>' +
        '<hr>' +
        '<p><a href="' + sheetUrl + '" style="background:#E85D20;color:#fff;padding:10px 20px;text-decoration:none;border-radius:6px;">Ver en Google Sheets</a></p>' +
        '<p style="color:#999;font-size:12px;">Para aprobar: abre la hoja "' + tipo + '" y cambia "aprobado" a SI</p>'
    });
  } catch(mailErr) {
    Logger.log('Email error: ' + mailErr);
  }

  return ContentService
    .createTextOutput(JSON.stringify({ status: 'ok' }))
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  var params = e ? e.parameter : {};
  var tipo   = params.tipo || 'talleres';

  try {
    var ss    = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(tipo);

    if (!sheet) {
      return jsonResponse({ status: 'error', message: 'Hoja "' + tipo + '" no encontrada' });
    }

    var rows = sheet.getDataRange().getValues();
    if (rows.length < 2) {
      return jsonResponse({ status: 'ok', talleres: [] });
    }

    var headers     = rows[0].map(function(h) { return String(h).trim().toLowerCase(); });
    var idxAprobado = headers.indexOf('aprobado');

    var talleres = rows.slice(1)
      .filter(function(row) { return row.some(function(cell) { return cell !== ''; }); })
      .filter(function(row) {
        if (idxAprobado === -1) return false;
        return String(row[idxAprobado]).trim().toLowerCase() === 'si';
      })
      .map(function(row) {
        var obj = {};
        headers.forEach(function(h, i) {
          if (h === 'logo' || h === 'foto1' || h === 'foto2' || h === 'foto3') return;
          obj[h] = row[i] !== undefined ? String(row[i]) : '';
        });
        return obj;
      });

    return jsonResponse({ status: 'ok', talleres: talleres });

  } catch (err) {
    return jsonResponse({ status: 'error', message: err.toString() });
  }
}

function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
