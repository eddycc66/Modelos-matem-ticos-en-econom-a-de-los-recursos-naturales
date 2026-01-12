// ======================================================
// MODELO DE OPTIMIZACIÓN FORESTAL - BOSQUE SECO CHIQUITANO
// Versión corregida sin errores de sintaxis
// ======================================================

// Definir región de estudio - Bosque Seco Chiquitano
var regionChiquitania = ee.Geometry.Rectangle([-61.5, -18.5, -59.0, -16.0]);

// Cargar datos de cobertura forestal
var dataset = ee.Image('UMD/hansen/global_forest_change_2023_v1_11')
  .clip(regionChiquitania);

var treeCover = dataset.select('treecover2000');
var lossYear = dataset.select('lossyear');
var gain = dataset.select('gain');

// Función para agregar leyenda
function addForestLegend() {
  var legend = ui.Panel({
    style: {
      position: 'bottom-left',
      padding: '8px 15px',
      backgroundColor: 'white'
    }
  });
  
  var title = ui.Label({
    value: 'LEYENDA - COBERTURA FORESTAL',
    style: {
      fontWeight: 'bold',
      fontSize: '14px',
      margin: '0 0 8px 0'
    }
  });
  legend.add(title);
  
  var items = [
    {color: '#000000', label: 'Sin cobertura'},
    {color: '#FFFF00', label: 'Cobertura baja (< 30%)'},
    {color: '#00FF00', label: 'Cobertura media (30-70%)'},
    {color: '#006400', label: 'Cobertura alta (> 70%)'},
    {color: '#FF0000', label: 'Pérdida forestal (2001-2023)'}
  ];
  
  for (var i = 0; i < items.length; i++) {
    var colorBox = ui.Label({
      style: {
        backgroundColor: items[i].color,
        padding: '8px',
        margin: '0 0 4px 0'
      }
    });
    
    var description = ui.Label({
      value: items[i].label,
      style: {margin: '0 0 4px 10px'}
    });
    
    var row = ui.Panel({
      widgets: [colorBox, description],
      layout: ui.Panel.Layout.Flow('horizontal')
    });
    
    legend.add(row);
  }
  
  Map.add(legend);
}

// Función para ejecutar análisis forestal
function executeForestAnalysis() {
  print('=== ANÁLISIS FORESTAL - CHIQUITANIA ===');
  
  // Calcular estadísticas de cobertura
  var stats = treeCover.reduceRegion({
    reducer: ee.Reducer.percentile([25, 50, 75, 90]),
    geometry: regionChiquitania,
    scale: 30,
    maxPixels: 1e9
  });
  
  print('Estadísticas de cobertura forestal 2000:');
  print('• Percentil 25: ' + ee.Number(stats.get('treecover2000_p25')).format('%.1f') + '%');
  print('• Mediana: ' + ee.Number(stats.get('treecover2000_p50')).format('%.1f') + '%');
  print('• Percentil 75: ' + ee.Number(stats.get('treecover2000_p75')).format('%.1f') + '%');
  print('• Percentil 90: ' + ee.Number(stats.get('treecover2000_p90')).format('%.1f') + '%');
  
  // Calcular área total de pérdida
  var lossArea = lossYear.gt(0).and(lossYear.lte(23))
    .multiply(ee.Image.pixelArea())
    .divide(1e4)
    .reduceRegion({
      reducer: ee.Reducer.sum(),
      geometry: regionChiquitania,
      scale: 30,
      maxPixels: 1e9
    });
  
  print('\nPérdida forestal total (2001-2023):');
  print('• Área: ' + ee.Number(lossArea.get('lossyear')).format('%,.0f') + ' hectáreas');
  
  // Calcular ganancia forestal
  var gainArea = gain.multiply(ee.Image.pixelArea())
    .divide(1e4)
    .reduceRegion({
      reducer: ee.Reducer.sum(),
      geometry: regionChiquitania,
      scale: 30,
      maxPixels: 1e9
    });
  
  print('• Ganancia forestal: ' + ee.Number(gainArea.get('gain')).format('%,.0f') + ' hectáreas');
  
  // Ejecutar modelo de rotación óptima
  var rotationResults = calculateOptimalRotation();
  print('\n=== MODELO DE ROTACIÓN ÓPTIMA ===');
  print('Rotación recomendada: ' + rotationResults.optimalYears + ' años');
  print('VPN máximo estimado: $' + rotationResults.maxNPV.toLocaleString() + ' USD/ha');
  
  // Crear gráfico de pérdida anual
  createAnnualLossChart();
}

// Función para calcular rotación óptima
function calculateOptimalRotation() {
  var pricePerM3 = 180;
  var harvestCost = 85;
  var discountRate = 0.07;
  var growthRate = 0.025;
  var initialVolume = 150;
  
  var optimalYears = 0;
  var maxNPV = 0;
  var results = [];
  
  for (var t = 10; t <= 60; t += 5) {
    var volume = initialVolume * Math.exp(growthRate * t);
    var revenue = pricePerM3 * volume;
    var cost = harvestCost * volume;
    var npv = (revenue - cost) / Math.pow(1 + discountRate, t);
    
    results.push({
      years: t,
      npv: npv,
      volume: volume
    });
    
    if (npv > maxNPV) {
      maxNPV = npv;
      optimalYears = t;
    }
  }
  
  return {
    optimalYears: optimalYears,
    maxNPV: maxNPV,
    allResults: results
  };
}

// Función para crear gráfico de pérdida anual
function createAnnualLossChart() {
  var annualLoss = ee.List.sequence(1, 23).map(function(year) {
    var loss = lossYear.eq(year);
    var area = loss.multiply(ee.Image.pixelArea())
      .reduceRegion({
        reducer: ee.Reducer.sum(),
        geometry: regionChiquitania,
        scale: 30,
        maxPixels: 1e9
      }).get('lossyear');
    
    return ee.Feature(null, {
      'Año': ee.Number(year).add(2000),
      'Area_ha': ee.Number(area).divide(1e4)
    });
  });
  
  var chart = ui.Chart.feature.byFeature(
    ee.FeatureCollection(annualLoss), 
    'Año', 
    'Area_ha'
  )
  .setChartType('ColumnChart')
  .setOptions({
    title: 'Pérdida Forestal Anual - Chiquitania',
    hAxis: {title: 'Año'},
    vAxis: {title: 'Hectáreas'},
    colors: ['#d9534f'],
    legend: {position: 'none'}
  });
  
  print(chart);
}

// Función para descargar cobertura forestal
function downloadTreeCover() {
  print('Iniciando descarga de cobertura forestal...');
  
  Export.image.toDrive({
    image: treeCover,
    description: 'Cobertura_Forestal_Chiquitania_2000',
    scale: 30,
    region: regionChiquitania,
    fileFormat: 'GeoTIFF',
    maxPixels: 1e9,
    folder: 'GEE_Bolivia_Forestal'
  });
  
  print('Tarea de descarga creada. Revise la pestaña "Tasks".');
}

// Función para descargar pérdidas forestales
function downloadForestLoss(year) {
  print('Descargando pérdidas forestales para ' + year + '...');
  
  var yearLoss = lossYear.eq(parseInt(year) - 2000);
  
  Export.image.toDrive({
    image: yearLoss.selfMask(),
    description: 'Perdida_Forestal_Chiquitania_' + year,
    scale: 30,
    region: regionChiquitania,
    fileFormat: 'GeoTIFF',
    maxPixels: 1e9,
    folder: 'GEE_Bolivia_Forestal'
  });
  
  print('Tarea de descarga creada para el año ' + year);
}

// Crear panel de control
function createControlPanel() {
  var panel = ui.Panel({
    style: {
      position: 'top-right',
      padding: '10px',
      backgroundColor: 'white',
      border: '1px solid #ccc'
    }
  });
  
  var title = ui.Label({
    value: 'CONTROL FORESTAL',
    style: {
      fontWeight: 'bold',
      fontSize: '16px',
      margin: '0 0 10px 0',
      color: '#2E7D32'
    }
  });
  panel.add(title);
  
  // Botón de análisis
  var analyzeBtn = ui.Button({
    label: 'Ejecutar Análisis',
    onClick: executeForestAnalysis,
    style: {
      backgroundColor: '#4CAF50',
      color: 'white',
      padding: '8px',
      margin: '5px'
    }
  });
  panel.add(analyzeBtn);
  
  // Selector de año
  var yearItems = [];
  for (var i = 1; i <= 23; i++) {
    yearItems.push((2000 + i).toString());
  }
  
  var yearSelector = ui.Select({
    items: yearItems,
    placeholder: 'Seleccionar año pérdida',
    style: {margin: '5px', width: '180px'}
  });
  panel.add(yearSelector);
  
  // Botón de descarga de cobertura
  var downloadCoverBtn = ui.Button({
    label: 'Descargar Cobertura',
    onClick: downloadTreeCover,
    style: {margin: '5px', padding: '8px'}
  });
  panel.add(downloadCoverBtn);
  
  // Botón de descarga de pérdidas
  var downloadLossBtn = ui.Button({
    label: 'Descargar Pérdidas',
    onClick: function() {
      var year = yearSelector.getValue();
      if (year) {
        downloadForestLoss(year);
      }
    },
    style: {margin: '5px', padding: '8px'}
  });
  panel.add(downloadLossBtn);
  
  return panel;
}

// Visualización en el mapa
Map.centerObject(regionChiquitania, 9);

// Capa de cobertura forestal 2000
Map.addLayer(treeCover, {
  min: 0,
  max: 100,
  palette: ['000000', 'FFFF00', '00FF00', '006400']
}, 'Cobertura Forestal 2000 (%)');

// Capa de pérdida forestal
Map.addLayer(lossYear.updateMask(lossYear.gt(0)), {
  min: 1,
  max: 23,
  palette: ['FF0000']
}, 'Pérdida Forestal (2001-2023)');

// Inicializar interfaz
addForestLegend();
Map.add(createControlPanel());

// Ejecutar análisis inicial
executeForestAnalysis();