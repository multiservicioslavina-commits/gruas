// ============================================================
//  RIDERA — Apps Script completo
//  doPost: guarda registros (distingue origen: formulario vs WordPress)
//  doGet:  devuelve solo grúas aprobadas (aprobado = SI)
// ============================================================

function doPost(e) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const data = JSON.parse(e.postData.contents);
  const tipo = data.tipo || 'Sin tipo';

  let sheet = ss.getSheetByName(tipo);
  if (!sheet) {
    sheet = ss.insertSheet(tipo);
  }

  // Si no trae campo aprobado, viene del formulario → NO
  // Si viene de WordPress (post aprobado), traerá aprobado = SI
  if (!data.aprobado) {
    data.aprobado = 'NO';
  }

  if (sheet.getLastRow() === 0) {
    const headers = Object.keys(data);
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length)
      .setBackground('#E85D20')
      .setFontColor('#ffffff')
      .setFontWeight('bold');
  } else {
    // Agregar cualquier header nuevo que venga en data y no exista en la hoja
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

  // Construir fila alineada con los headers existentes
  var currentHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var row = currentHeaders.map(function(h) {
    var key = String(h).trim().toLowerCase();
    // Buscar la key en data (case-insensitive)
    for (var k in data) {
      if (k.toLowerCase() === key) return data[k];
    }
    return '';
  });

  sheet.appendRow(row);

  // Si viene de WordPress (aprobado=SI), actualizar también filas existentes con mismo nombre
  if (String(data.aprobado).toUpperCase() === 'SI' && data.nombre) {
    var allHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]
      .map(function(h) { return String(h).trim().toLowerCase(); });
    var idxNombre = allHeaders.indexOf('nombre');
    var idxAprobado = allHeaders.indexOf('aprobado');

    if (idxNombre !== -1 && idxAprobado !== -1) {
      var allData = sheet.getDataRange().getValues();
      for (var i = 1; i < allData.length - 1; i++) { // -1 para no tocar la fila recién insertada
        if (String(allData[i][idxNombre]).trim().toLowerCase() === String(data.nombre).trim().toLowerCase()) {
          sheet.getRange(i + 1, idxAprobado + 1).setValue('SI');
        }
      }
    }
  }

  return ContentService
    .createTextOutput(JSON.stringify({ status: 'ok' }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── doGet: devuelve solo las grúas con aprobado = SI ────────
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

    var headers = rows[0].map(function(h) { return String(h).trim().toLowerCase(); });
    var idxAprobado = headers.indexOf('aprobado');

    var talleres = rows.slice(1)
      .filter(function(row) { return row.some(function(cell) { return cell !== ''; }); })
      .filter(function(row) {
        if (idxAprobado === -1) return false; // Sin columna aprobado, NO mostrar (antes mostraba todo)
        return String(row[idxAprobado]).trim().toLowerCase() === 'si';
      })
      .map(function(row) {
        var obj = {};
        headers.forEach(function(h, i) { obj[h] = row[i] !== undefined ? String(row[i]) : ''; });
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
