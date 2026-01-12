// ======================================================
// MODELO BIOCONÓMICO PESQUERO - LAGO TITICACA
// Versión completa con opciones de descarga avanzadas
// ======================================================

// Definir área del Lago Titicaca
var lagoTiticaca = ee.Geometry.Polygon(
  [[[-70.0, -15.5],
    [-69.0, -15.5],
    [-69.0, -16.5],
    [-70.0, -16.5]]], null, false);

// 1. CARGAR DATOS PESQUEROS Y AMBIENTALES
// Temperatura del agua MODIS
var temperaturaAgua = ee.ImageCollection('MODIS/006/MOD11A1')
  .filterDate('2010-01-01', '2023-12-31')
  .filterBounds(lagoTiticaca)
  .select('LST_Day_1km')
  .map(function(image) {
    return image.multiply(0.02).subtract(273.15);
  });

// Clorofila (productividad primaria)
var clorofila = ee.ImageCollection('NASA/OCEANDATA/MODIS-Aqua/L3SMI')
  .filterDate('2010-01-01', '2023-12-31')
  .filterBounds(lagoTiticaca)
  .select('chlor_a');

// 2. PANEL DE CONTROL COMPLETO
function createFisheryControlPanel() {
  var panel = ui.Panel({
    style: {
      position: 'top-right',
      padding: '15px',
      backgroundColor: 'rgba(255, 255, 255, 0.95)',
      border: '2px solid #FF9800',
      borderRadius: '5px',
      width: '320px'
    }
  });
  
  // Título
  var title = ui.Label({
    value: '🐟 CONTROL PESQUERO - TITICACA',
    style: {
      fontWeight: 'bold',
      fontSize: '18px',
      margin: '0 0 15px 0',
      color: '#E65100'
    }
  });
  panel.add(title);
  
  // Selector de especie
  var speciesLabel = ui.Label('Especie objetivo:');
  panel.add(speciesLabel);
  
  var speciesSelect = ui.Select({
    items: ['Karachi', 'Ispi', 'Pejerrey', 'Todas'],
    value: 'Todas',
    style: {margin: '5px 0 15px 0', width: '100%'}
  });
  panel.add(speciesSelect);
  
  // Botón de análisis
  var analyzeBtn = ui.Button({
    label: '📊 Analizar Pesquería',
    onClick: function() { analyzeFishery(speciesSelect.getValue()); },
    style: {
      backgroundColor: '#FF9800',
      color: 'white',
      padding: '10px',
      margin: '5px 0',
      width: '100%'
    }
  });
  panel.add(analyzeBtn);
  
  // Separador
  panel.add(ui.Label('--- DESCARGA DE DATOS ---'));
  
  // Descarga de temperatura
  var tempBtn = ui.Button({
    label: '🌡️ Descargar Temperatura',
    onClick: downloadTemperatureData,
    style: {margin: '5px 0', width: '100%', padding: '8px'}
  });
  panel.add(tempBtn);
  
  // Descarga de clorofila
  var chloroBtn = ui.Button({
    label: '🌿 Descargar Clorofila',
    onClick: downloadChlorophyllData,
    style: {margin: '5px 0', width: '100%', padding: '8px'}
  });
  panel.add(chloroBtn);
  
  // Descarga de resultados de optimización
  var resultsBtn = ui.Button({
    label: '📈 Descargar Resultados',
    onClick: downloadFisheryResults,
    style: {margin: '5px 0', width: '100%', padding: '8px'}
  });
  panel.add(resultsBtn);
  
  // Descarga completa del modelo
  var modelBtn = ui.Button({
    label: '⚡ Descargar Modelo Completo',
    onClick: downloadCompleteModel,
    style: {
      backgroundColor: '#4CAF50',
      color: 'white',
      margin: '10px 0 5px 0',
      width: '100%',
      padding: '10px'
    }
  });
  panel.add(modelBtn);
  
  return panel;
}

// 3. ANÁLISIS DE PESQUERÍA
function analyzeFishery(species) {
  print('🐟 ANÁLISIS PESQUERO - ' + species.toUpperCase());
  
  var speciesData = {
    'Karachi': {capacity: 12000, growth: 0.45, price: 2800, cost: 1200},
    'Ispi': {capacity: 8000, growth: 0.55, price: 2200, cost: 900},
    'Pejerrey': {capacity: 6000, growth: 0.35, price: 3500, cost: 1500}
  };
  
  if (species === 'Todas') {
    Object.keys(speciesData).forEach(function(sp) {
      calculateOptimalFishery(sp, speciesData[sp]);
    });
  } else {
    calculateOptimalFishery(species, speciesData[species]);
  }
  
  // Análisis ambiental
  analyzeEnvironmentalConditions();
}

// 4. CALCULAR PESQUERÍA ÓPTIMA
function calculateOptimalFishery(species, params) {
  // Modelo de Schaefer
  var MSY = (params.capacity * params.growth) / 4; // Máximo rendimiento sostenible
  var optimalEffort = params.growth / 2;
  var optimalCatch = MSY;
  var optimalBiomass = params.capacity / 2;
  
  // Beneficios económicos
  var revenue = optimalCatch * params.price;
  var cost = optimalCatch * params.cost;
  var profit = revenue - cost;
  
  print('\n📊 ' + species.toUpperCase() + ':');
  print('• Capacidad de carga: ' + params.capacity.toLocaleString() + ' ton');
  print('• Tasa de crecimiento: ' + (params.growth * 100).toFixed(1) + '%');
  print('• Máximo rendimiento sostenible: ' + MSY.toFixed(0) + ' ton/año');
  print('• Esfuerzo óptimo: ' + optimalEffort.toFixed(3));
  print('• Biomasa óptima: ' + optimalBiomass.toFixed(0) + ' ton');
  print('• Beneficio anual: $' + profit.toLocaleString() + ' USD');
  
  return {
    species: species,
    msy: MSY,
    optimalEffort: optimalEffort,
    optimalCatch: optimalCatch,
    profit: profit
  };
}

// 5. DESCARGA DE DATOS DE TEMPERATURA
function downloadTemperatureData() {
  print('🌡️ Descargando datos de temperatura...');
  
  // Temperatura promedio anual
  var tempAnual = temperaturaAgua.mean().clip(lagoTiticaca);
  
  Export.image.toDrive({
    image: tempAnual,
    description: 'Temperatura_Agua_Titicaca_Promedio',
    scale: 1000,
    region: lagoTiticaca,
    fileFormat: 'GeoTIFF',
    maxPixels: 1e9,
    folder: 'GEE_Bolivia_Pesquero',
    crs: 'EPSG:4326'
  });
  
  // Serie temporal de temperatura
  var years = ee.List.sequence(2010, 2023);
  var tempSeries = years.map(function(year) {
    var temp = temperaturaAgua
      .filter(ee.Filter.calendarRange(year, year, 'year'))
      .mean()
      .reduceRegion({
        reducer: ee.Reducer.mean(),
        geometry: lagoTiticaca,
        scale: 1000
      }).get('LST_Day_1km');
    
    return ee.Feature(null, {
      'Anio': year,
      'Temperatura_C': ee.Number(temp),
      'Region': 'Lago_Titicaca'
    });
  });
  
  Export.table.toDrive({
    collection: ee.FeatureCollection(tempSeries),
    description: 'Serie_Temperatura_Titicaca',
    fileFormat: 'CSV',
    folder: 'GEE_Bolivia_Pesquero'
  });
  
  print('✅ Datos de temperatura en proceso de descarga.');
}

// 6. DESCARGA DE DATOS DE CLOROFILA
function downloadChlorophyllData() {
  print('🌿 Descargando datos de clorofila...');
  
  // Clorofila promedio
  var chloroPromedio = clorofila.mean().clip(lagoTiticaca);
  
  Export.image.toDrive({
    image: chloroPromedio,
    description: 'Clorofila_Titicaca_Promedio',
    scale: 4000,
    region: lagoTiticaca,
    fileFormat: 'GeoTIFF',
    maxPixels: 1e9,
    folder: 'GEE_Bolivia_Pesquero'
  });
  
  // Estadísticas de productividad
  var chloroStats = chloroPromedio.reduceRegion({
    reducer: ee.Reducer.mean().combine({
      reducer2: ee.Reducer.stdDev(),
      sharedInputs: true
    }),
    geometry: lagoTiticaca,
    scale: 4000
  });
  
  var statsTable = ee.FeatureCollection([
    ee.Feature(null, {
      'Clorofila_promedio_mg_m3': ee.Number(chloroStats.get('chlor_a_mean')),
      'Clorofila_std_mg_m3': ee.Number(chloroStats.get('chlor_a_stdDev')),
      'Productividad': 'Media', // Clasificación simple
      'Fecha_analisis': ee.Date(new Date()).format('YYYY-MM-dd')
    })
  ]);
  
  Export.table.toDrive({
    collection: statsTable,
    description: 'Estadisticas_Clorofila_Titicaca',
    fileFormat: 'CSV',
    folder: 'GEE_Bolivia_Pesquero'
  });
  
  print('✅ Datos de clorofila en proceso de descarga.');
}

// 7. DESCARGA DE RESULTADOS PESQUEROS
function downloadFisheryResults() {
  print('📈 Descargando resultados pesqueros...');
  
  var species = [
    {name: 'Karachi', capacity: 12000, growth: 0.45, price: 2800, cost: 1200},
    {name: 'Ispi', capacity: 8000, growth: 0.55, price: 2200, cost: 900},
    {name: 'Pejerrey', capacity: 6000, growth: 0.35, price: 3500, cost: 1500}
  ];
  
  var results = species.map(function(sp) {
    var msy = (sp.capacity * sp.growth) / 4;
    var profit = (msy * sp.price) - (msy * sp.cost);
    
    return ee.Feature(null, {
      'Especie': sp.name,
      'Capacidad_carga_ton': sp.capacity,
      'Tasa_crecimiento': sp.growth,
      'MSY_ton_año': msy,
      'Precio_USD_ton': sp.price,
      'Costo_USD_ton': sp.cost,
      'Beneficio_anual_USD': profit,
      'Esfuerzo_optimo': sp.growth / 2,
      'Biomasa_optima_ton': sp.capacity / 2,
      'Recomendacion_captura_ton': msy * 0.8 // 80% del MSY para seguridad
    });
  });
  
  Export.table.toDrive({
    collection: ee.FeatureCollection(results),
    description: 'Resultados_Optimizacion_Pesquera',
    fileFormat: 'CSV',
    folder: 'GEE_Bolivia_Pesquero'
  });
  
  print('✅ Resultados pesqueros en proceso de descarga.');
}

// 8. DESCARGA DEL MODELO COMPLETO
function downloadCompleteModel() {
  print('⚡ Descargando modelo pesquero completo...');
  
  // Crear imagen compuesta con todas las variables
  var tempPromedio = temperaturaAgua.mean().clip(lagoTiticaca);
  var chloroPromedio = clorofila.mean().clip(lagoTiticaca);
  
  // Crear mapa de aptitud pesquera (simplificado)
  var suitability = tempPromedio.multiply(0.5)
    .add(chloroPromedio.multiply(0.5))
    .rename('aptitud_pesquera');
  
  var completeModel = ee.Image.cat([
    tempPromedio.rename('temperatura_promedio_C'),
    chloroPromedio.rename('clorofila_promedio_mg_m3'),
    suitability
  ]);
  
  Export.image.toDrive({
    image: completeModel,
    description: 'Modelo_Pesquero_Completo_Titicaca',
    scale: 1000,
    region: lagoTiticaca,
    fileFormat: 'GeoTIFF',
    maxPixels: 1e9,
    folder: 'GEE_Bolivia_Pesquero'
  });
  
  // Crear reporte completo
  var reportData = ee.FeatureCollection([
    ee.Feature(null, {
      'Modelo': 'Bioeconómico Pesquero',
      'Region': 'Lago Titicaca',
      'Especies': 'Karachi, Ispi, Pejerrey',
      'Periodo_analisis': '2010-2023',
      'Variables': 'Temperatura, Clorofila, Aptitud',
      'Fecha_generacion': ee.Date(new Date()).format('YYYY-MM-dd HH:mm:ss'),
      'Autor': 'M.Sc. Edwin Calle Condori',
      'Institucion': 'Geonorth'
    })
  ]);
  
  Export.table.toDrive({
    collection: reportData,
    description: 'Reporte_Modelo_Pesquero',
    fileFormat: 'CSV',
    folder: 'GEE_Bolivia_Pesquero'
  });
  
  print('✅ Modelo completo en proceso de descarga.');
}

// 9. ANÁLISIS AMBIENTAL
function analyzeEnvironmentalConditions() {
  print('\n🌍 ANÁLISIS AMBIENTAL DEL LAGO:');
  
  // Temperatura promedio
  var tempStats = temperaturaAgua.mean()
    .reduceRegion({
      reducer: ee.Reducer.mean(),
      geometry: lagoTiticaca,
      scale: 1000
    });
  
  print('• Temperatura promedio: ' + ee.Number(tempStats.get('LST_Day_1km')).format('%.1f') + '°C');
  
  // Clorofila promedio
  var chloroStats = clorofila.mean()
    .reduceRegion({
      reducer: ee.Reducer.mean(),
      geometry: lagoTiticaca,
      scale: 4000
    });
  
  print('• Clorofila promedio: ' + ee.Number(chloroStats.get('chlor_a')).format('%.2f') + ' mg/m³');
  
  // Clasificar productividad
  var chloroValue = ee.Number(chloroStats.get('chlor_a'));
  var productivity = chloroValue.gt(5) ? 'Alta' : 
                     chloroValue.gt(2) ? 'Media' : 'Baja';
  
  print('• Productividad primaria: ' + productivity);
}

// 10. VISUALIZACIÓN EN EL MAPA
Map.centerObject(lagoTiticaca, 10);

// Temperatura del agua
Map.addLayer(temperaturaAgua.mean(), {
  min: 10,
  max: 20,
  palette: ['blue', 'cyan', 'green', 'yellow', 'red']
}, 'Temperatura Promedio (°C)');

// Clorofila
Map.addLayer(clorofila.mean(), {
  min: 0,
  max: 10,
  palette: ['white', 'green', 'darkgreen']
}, 'Clorofila-a (mg/m³)');

// 11. LEYENDA
function addFisheryLegend() {
  var legend = ui.Panel({
    style: {
      position: 'bottom-left',
      padding: '10px',
      backgroundColor: 'white'
    }
  });
  
  legend.add(ui.Label('LEYENDA - VARIABLES PESQUERAS'));
  
  var items = [
    {color: '0000ff', label: '10-12°C (Frío)'},
    {color: '00ffff', label: '12-14°C (Templado)'},
    {color: '00ff00', label: '14-16°C (Óptimo)'},
    {color: 'ffff00', label: '16-18°C (Cálido)'},
    {color: 'ff0000', label: '18-20°C (Caliente)'}
  ];
  
  items.forEach(function(item) {
    var row = ui.Panel({
      widgets: [
        ui.Label({style: {backgroundColor: item.color, padding: '8px', margin: '2px'}}),
        ui.Label(item.label, {margin: '0 0 0 10px'})
      ],
      layout: ui.Panel.Layout.Flow('horizontal')
    });
    legend.add(row);
  });
  
  Map.add(legend);
}

// 12. INICIALIZAR
addFisheryLegend();
Map.add(createFisheryControlPanel());

print('🐟 MODELO BIOCONÓMICO PESQUERO - TITICACA');
print('==========================================');
print('Herramienta para gestión sostenible de pesquerías.');
print('');
print('📥 OPCIONES DE DESCARGA:');
print('1. Datos de temperatura (GeoTIFF + CSV)');
print('2. Datos de clorofila/productividad');
print('3. Resultados de optimización por especie');
print('4. Modelo completo con aptitud pesquera');
print('');
print('👆 Use el panel de control para acceder a todas las funciones.');
print('');
print('💡 RECOMENDACIONES:');
print('• Mantener capturas al 80% del MSY');
print('• Monitorear temperatura (>16°C afecta reproducción)');
print('• Proteger zonas de reproducción (< 5m profundidad)');