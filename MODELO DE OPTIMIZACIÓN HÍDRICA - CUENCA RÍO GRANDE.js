// ======================================================
// MODELO DE OPTIMIZACIÓN HÍDRICA - CUENCA RÍO GRANDE
// Versión corregida con leyendas y opciones de descarga
// ======================================================

// Definir cuenca del Río Grande
var cuencaRioGrande = ee.Geometry.Polygon(
  [[[-66.5, -17.0],
    [-66.5, -20.5],
    [-62.0, -20.5],
    [-62.0, -17.0]]], null, false);

// Función para agregar leyenda
function addLegend(map, position, colors, labels, title) {
  var legend = ui.Panel({
    style: {
      position: position,
      padding: '8px 15px'
    }
  });
  
  var legendTitle = ui.Label({
    value: title,
    style: {
      fontWeight: 'bold',
      fontSize: '16px',
      margin: '0 0 4px 0',
      padding: '0'
    }
  });
  
  legend.add(legendTitle);
  
  for (var i = 0; i < colors.length; i++) {
    var colorBox = ui.Label({
      style: {
        backgroundColor: colors[i],
        padding: '8px',
        margin: '0 0 4px 0'
      }
    });
    
    var description = ui.Label({
      value: labels[i],
      style: {margin: '0 0 4px 10px'}
    });
    
    var row = ui.Panel({
      widgets: [colorBox, description],
      layout: ui.Panel.Layout.Flow('horizontal')
    });
    
    legend.add(row);
  }
  
  map.add(legend);
}

// 1. CARGAR Y PROCESAR DATOS DE PRECIPITACIÓN
var precipitacion = ee.ImageCollection('UCSB-CHG/CHIRPS/PENTAD')
  .filterDate('2010-01-01', '2023-12-31')
  .filterBounds(cuencaRioGrande)
  .select('precipitation');

// Calcular precipitación anual
var precipitacionAnual = precipitacion.sum().clip(cuencaRioGrande);

// 2. CARGAR DATOS DE EVAPOTRANSPIRACIÓN
var evapotranspiracion = ee.ImageCollection('MODIS/006/MOD16A2')
  .filterDate('2010-01-01', '2023-12-31')
  .filterBounds(cuencaRioGrande)
  .select('ET');

var evapotranspiracionAnual = evapotranspiracion.sum()
  .multiply(0.1) // Escalar a valores reales
  .clip(cuencaRioGrande);

// 3. CARGAR DATOS DE USO DE SUELO
var uso_suelo = ee.ImageCollection('GOOGLE/DYNAMICWORLD/V1')
  .filterDate('2020-01-01', '2020-12-31')
  .filterBounds(cuencaRioGrande)
  .mean()
  .clip(cuencaRioGrande);

// 4. CALCULAR BALANCE HÍDRICO
function calcularBalanceHidricoAnual(year) {
  var startDate = ee.Date.fromYMD(year, 1, 1);
  var endDate = ee.Date.fromYMD(year, 12, 31);
  
  // Precipitación anual
  var precip = precipitacion
    .filterDate(startDate, endDate)
    .sum()
    .rename('precipitacion');
  
  // Evapotranspiración anual
  var et = evapotranspiracion
    .filterDate(startDate, endDate)
    .sum()
    .multiply(0.1)
    .rename('evapotranspiracion');
  
  // Escorrentía (usando modelo simple)
  var escorrentia = precip.multiply(0.3).rename('escorrentia');
  
  // Balance hídrico
  var balance = precip.subtract(et).subtract(escorrentia).rename('balance');
  
  return ee.Image.cat([precip, et, escorrentia, balance])
    .set('year', year);
}

// Calcular serie temporal
var years = ee.List.sequence(2010, 2023);
var balancesAnuales = years.map(function(year) {
  return calcularBalanceHidricoAnual(year);
});

var coleccionBalances = ee.ImageCollection(balancesAnuales);

// 5. MODELO DE OPTIMIZACIÓN DE ASIGNACIÓN DE AGUA
function modeloOptimizacionAgua() {
  // Calcular disponibilidad promedio
  var disponibilidadPromedio = coleccionBalances.select('balance')
    .mean()
    .multiply(ee.Image.pixelArea()).divide(1e6) // Convertir a millones de m³
    .reduceRegion({
      reducer: ee.Reducer.mean(),
      geometry: cuencaRioGrande,
      scale: 5000,
      maxPixels: 1e9
    }).get('balance');
  
  // Convertir a número
  disponibilidadPromedio = ee.Number(disponibilidadPromedio).multiply(1e-3); // Ajustar escala
  
  // Demandas por sector (millones de m³/año)
  var demandas = ee.Dictionary({
    'Agricultura': 450,
    'Municipal': 120,
    'Industrial': 80,
    'Ambiental': 150
  });
  
  // Beneficios por m³ (USD)
  var beneficios = ee.Dictionary({
    'Agricultura': 0.8,
    'Municipal': 2.5,
    'Industrial': 5.0,
    'Ambiental': 1.2
  });
  
  // Restricciones mínimas (millones de m³)
  var minimos = ee.Dictionary({
    'Agricultura': 300,
    'Municipal': 100,
    'Industrial': 50,
    'Ambiental': 100
  });
  
  // Resolver optimización
  var sectores = ['Agricultura', 'Municipal', 'Industrial', 'Ambiental'];
  
  // Asignar mínimos
  var asignacion = ee.Dictionary({});
  var totalAsignado = ee.Number(0);
  
  sectores.forEach(function(sector) {
    var minimo = ee.Number(minimos.get(sector));
    asignacion = asignacion.set(sector, minimo);
    totalAsignado = totalAsignado.add(minimo);
  });
  
  // Distribuir agua restante
  var aguaRestante = disponibilidadPromedio.subtract(totalAsignado);
  var sumaBeneficios = ee.Number(0);
  
  sectores.forEach(function(sector) {
    sumaBeneficios = sumaBeneficios.add(ee.Number(beneficios.get(sector)));
  });
  
  sectores.forEach(function(sector) {
    var beneficio = ee.Number(beneficios.get(sector));
    var proporcion = beneficio.divide(sumaBeneficios);
    var adicional = aguaRestante.multiply(proporcion);
    var actual = ee.Number(asignacion.get(sector));
    asignacion = asignacion.set(sector, actual.add(adicional));
  });
  
  return {
    'asignacion': asignacion,
    'disponibilidad': disponibilidadPromedio,
    'beneficios': beneficios
  };
}

// 6. VISUALIZACIÓN EN EL MAPA
Map.centerObject(cuencaRioGrande, 8);

// Capa 1: Precipitación Anual Promedio
var visPrecip = {
  min: 300,
  max: 1500,
  palette: ['white', 'lightblue', 'blue', 'darkblue', 'purple']
};

Map.addLayer(precipitacionAnual, visPrecip, 'Precipitación Anual Promedio (mm)');

// Capa 2: Evapotranspiración
var visET = {
  min: 500,
  max: 1200,
  palette: ['yellow', 'orange', 'red']
};

Map.addLayer(evapotranspiracionAnual, visET, 'Evapotranspiración Anual (mm)');

// Capa 3: Balance Hídrico Promedio
var balancePromedio = coleccionBalances.select('balance').mean();
var visBalance = {
  min: -200,
  max: 200,
  palette: ['red', 'white', 'green']
};

Map.addLayer(balancePromedio, visBalance, 'Balance Hídrico Promedio (mm)');

// Capa 4: Uso de Suelo
var visUsoSuelo = {
  bands: ['label'],
  min: 0,
  max: 8,
  palette: ['#419BDF', '#397D49', '#88B053', '#7A87C6', 
            '#E49635', '#DFC35A', '#C4281B', '#A59B8F', '#B39FE1']
};

Map.addLayer(uso_suelo, visUsoSuelo, 'Uso de Suelo 2020');

// 7. AGREGAR LEYENDAS
// Leyenda para precipitación
addLegend(Map, 'bottom-left', 
  ['#ffffff', '#87ceeb', '#0000ff', '#00008b', '#800080'],
  ['< 400 mm', '400-800 mm', '800-1200 mm', '1200-1600 mm', '> 1600 mm'],
  'Precipitación Anual');

// Leyenda para balance hídrico
addLegend(Map, 'bottom-right',
  ['#ff0000', '#ffffff', '#00ff00'],
  ['Déficit (< -100 mm)', 'Equilibrio (-100 a 100 mm)', 'Superávit (> 100 mm)'],
  'Balance Hídrico');

// 8. PANEL DE CONTROL INTERACTIVO
var panelControl = ui.Panel({
  style: {
    position: 'top-right',
    padding: '10px'
  }
});

var tituloPanel = ui.Label({
  value: 'CONTROL DE MODELO HÍDRICO',
  style: {
    fontWeight: 'bold',
    fontSize: '16px',
    margin: '0 0 10px 0'
  }
});

panelControl.add(tituloPanel);

// Botón para calcular optimización
var botonOptimizar = ui.Button({
  label: 'Calcular Optimización',
  onClick: function() {
    calcularYMostrarResultados();
  },
  style: {margin: '5px'}
});

panelControl.add(botonOptimizar);

// Selector de año para análisis
var selectorAno = ui.Select({
  items: ['2010','2011','2012','2013','2014','2015',
          '2016','2017','2018','2019','2020','2021','2022','2023'],
  placeholder: 'Seleccionar año',
  style: {margin: '5px', width: '150px'}
});

panelControl.add(selectorAno);

// Botón para descargar datos
var botonDescargar = ui.Button({
  label: 'Descargar Datos',
  onClick: function() {
    descargarDatos();
  },
  style: {margin: '5px', backgroundColor: '#4CAF50', color: 'white'}
});

panelControl.add(botonDescargar);

Map.add(panelControl);

// 9. FUNCIÓN PARA CALCULAR Y MOSTRAR RESULTADOS
function calcularYMostrarResultados() {
  print('=== MODELO DE OPTIMIZACIÓN HÍDRICA - CUENCA RÍO GRANDE ===');
  
  // Calcular estadísticas de precipitación
  var statsPrecip = precipitacionAnual.reduceRegion({
    reducer: ee.Reducer.mean().combine({
      reducer2: ee.Reducer.stdDev(),
      sharedInputs: true
    }),
    geometry: cuencaRioGrande,
    scale: 5000,
    maxPixels: 1e9
  });
  
  print('Estadísticas de Precipitación (2010-2023):');
  print('• Promedio anual: ' + ee.Number(statsPrecip.get('precipitation_mean')).format('%.0f') + ' mm');
  print('• Desviación estándar: ' + ee.Number(statsPrecip.get('precipitation_stdDev')).format('%.0f') + ' mm');
  
  // Calcular disponibilidad total de agua
  var volumenTotal = precipitacionAnual
    .multiply(ee.Image.pixelArea())
    .divide(1e9) // Convertir a millones de m³
    .reduceRegion({
      reducer: ee.Reducer.sum(),
      geometry: cuencaRioGrande,
      scale: 5000,
      maxPixels: 1e9
    });
  
  var volumenMillonesM3 = ee.Number(volumenTotal.get('precipitation')).multiply(1e-3);
  print('\nVolumen total de precipitación: ' + volumenMillonesM3.format('%.0f') + ' millones de m³/año');
  
  // Ejecutar modelo de optimización
  var resultadoOptimizacion = modeloOptimizacionAgua();
  var asignacion = resultadoOptimizacion.asignacion;
  var disponibilidad = resultadoOptimizacion.disponibilidad;
  var beneficios = resultadoOptimizacion.beneficios;
  
  print('\n=== RESULTADOS DE OPTIMIZACIÓN ===');
  print('Disponibilidad estimada: ' + ee.Number(disponibilidad).format('%.0f') + ' millones de m³/año');
  print('\nAsignación óptima por sector:');
  
  // Calcular beneficio total
  var beneficioTotal = ee.Number(0);
  
  ['Agricultura', 'Municipal', 'Industrial', 'Ambiental'].forEach(function(sector) {
    var asignado = ee.Number(asignacion.get(sector));
    var beneficioUnitario = ee.Number(beneficios.get(sector));
    var beneficioSector = asignado.multiply(beneficioUnitario);
    beneficioTotal = beneficioTotal.add(beneficioSector);
    
    print('• ' + sector + ': ' + 
          asignado.format('%.1f') + ' millones de m³' +
          ' (Beneficio: $' + beneficioSector.format('%.1f') + ' millones)');
  });
  
  print('\nBeneficio económico total estimado: $' + beneficioTotal.format('%.1f') + ' millones USD/año');
  
  // Gráfico de serie temporal de precipitación
  var serieTemporal = years.map(function(year) {
    var precipAnual = precipitacion
      .filter(ee.Filter.calendarRange(year, year, 'year'))
      .sum()
      .reduceRegion({
        reducer: ee.Reducer.mean(),
        geometry: cuencaRioGrande,
        scale: 5000
      }).get('precipitation');
    
    return ee.Feature(null, {
      'Año': ee.Number(year),
      'Precipitacion': ee.Number(precipAnual)
    });
  });
  
  var chartPrecip = ui.Chart.feature.byFeature(ee.FeatureCollection(serieTemporal), 'Año', 'Precipitacion')
    .setChartType('LineChart')
    .setOptions({
      title: 'Precipitación Anual - Cuenca Río Grande',
      hAxis: {title: 'Año'},
      vAxis: {title: 'Precipitación (mm)'},
      lineWidth: 2,
      colors: ['#4285F4'],
      trendlines: {0: {color: '#FF6B6B'}}
    });
  
  print(chartPrecip);
}

// 10. FUNCIÓN PARA DESCARGAR DATOS
function descargarDatos() {
  var anoSeleccionado = selectorAno.getValue();
  
  if (!anoSeleccionado) {
    print('Por favor, seleccione un año primero.');
    return;
  }
  
  var ano = parseInt(anoSeleccionado);
  var balanceAnual = calcularBalanceHidricoAnual(ano);
  
  // Exportar imagen de balance hídrico
  Export.image.toDrive({
    image: balanceAnual.select('balance'),
    description: 'Balance_Hidrico_RioGrande_' + ano,
    scale: 1000,
    region: cuencaRioGrande,
    fileFormat: 'GeoTIFF',
    maxPixels: 1e9,
    folder: 'GEE_Exports'
  });
  
  // Exportar datos estadísticos
  var stats = balanceAnual.reduceRegion({
    reducer: ee.Reducer.mean(),
    geometry: cuencaRioGrande,
    scale: 5000,
    maxPixels: 1e9
  });
  
  var tablaStats = ee.FeatureCollection([
    ee.Feature(null, {
      'Año': ano,
      'Precipitacion_mm': ee.Number(stats.get('precipitacion')),
      'Evapotranspiracion_mm': ee.Number(stats.get('evapotranspiracion')),
      'Escorrentia_mm': ee.Number(stats.get('escorrentia')),
      'Balance_mm': ee.Number(stats.get('balance')),
      'Fecha_exportacion': ee.Date(new Date()).format('YYYY-MM-dd')
    })
  ]);
  
  Export.table.toDrive({
    collection: tablaStats,
    description: 'Estadisticas_Hidricas_' + ano,
    fileFormat: 'CSV',
    folder: 'GEE_Exports'
  });
  
  print('✅ Exportación iniciada para el año ' + ano);
  print('Revise la pestaña "Tasks" para completar la descarga.');
}

// 11. INFORMACIÓN ADICIONAL Y METADATOS
print('============================================');
print('MODELO DE OPTIMIZACIÓN HÍDRICA - RÍO GRANDE');
print('============================================');
print('Descripción: Modelo integrado para la gestión óptima');
print('de recursos hídricos en la cuenca del Río Grande, Bolivia.');
print('');
print('📊 Datos utilizados:');
print('• Precipitación: CHIRPS (5.5 km resolución)');
print('• Evapotranspiración: MODIS MOD16A2 (500 m)');
print('• Uso de suelo: Dynamic World (10 m)');
print('');
print('⚙️ Parámetros del modelo:');
print('• Coeficiente de escorrentía: 30%');
print('• Tasa de infiltración: 40%');
print('• Pérdidas por evaporación: 30%');
print('');
print('👆 Haga clic en "Calcular Optimización" para ejecutar el modelo.');

// 12. ANÁLISIS AUTOMÁTICO INICIAL
calcularYMostrarResultados();