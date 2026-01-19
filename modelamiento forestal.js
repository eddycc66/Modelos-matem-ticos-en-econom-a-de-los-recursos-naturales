/**
 * Script de Google Earth Engine para modelamiento forestal
 * Área: Santa Cruz, Bolivia
 * Fecha: 2024-11-20
 */

// ============================================
// 1. DEFINIR ÁREA DE ESTUDIO (Santa Cruz, Bolivia)
// ============================================

// Coordenadas aproximadas de Santa Cruz, Bolivia
var santaCruz = ee.Geometry.Polygon([
  [[-62.0, -18.4], [-62.0, -17.2], [-63.5, -17.2], [-63.5, -18.4]]
]);

// Alternativa: Cargar desde FeatureCollection
// var departamentos = ee.FeatureCollection('FAO/GAUL/2015/level1');
// var santaCruz = departamentos.filter(ee.Filter.eq('ADM1_NAME', 'Santa Cruz'));

// Definir AOI
var aoi = santaCruz;
Map.centerObject(aoi, 10);
Map.addLayer(aoi, {color: 'red'}, 'AOI Santa Cruz');

// ============================================
// 2. CARGAR Y FILTRAR IMÁGENES SENTINEL-2
// ============================================

// Definir años de estudio
var startYear = 2023;
var endYear = 2024;

// Función para filtrar por nubosidad
function maskClouds(image) {
  var cloudProb = image.select('MSK_CLDPRB');
  return image.updateMask(cloudProb.lt(10));
}

// Colección para cada año
function getAnnualCollection(year) {
  var startDate = ee.Date.fromYMD(year, 1, 1);
  var endDate = ee.Date.fromYMD(year, 12, 31);
  
  return ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
    .filterBounds(aoi)
    .filterDate(startDate, endDate)
    .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 10))
    .map(maskClouds)
    .select(['B4', 'B8', 'SCL', 'MSK_CLDPRB']);
}

// Obtener colecciones anuales
var collection2023 = getAnnualCollection(startYear);
var collection2024 = getAnnualCollection(endYear);

print('Imágenes 2023:', collection2023.size());
print('Imágenes 2024:', collection2024.size());

// ============================================
// 3. CALCULAR NDVI
// ============================================

function calculateNDVI(image) {
  var ndvi = image.normalizedDifference(['B8', 'B4']).rename('NDVI');
  return image.addBands(ndvi);
}

// Aplicar NDVI a cada colección
var ndvi2023 = collection2023.map(calculateNDVI);
var ndvi2024 = collection2024.map(calculateNDVI);

// ============================================
// 4. GENERAR COMPOSITOS ANUALES
// ============================================

// NDVI promedio anual
var ndviMean2023 = ndvi2023.select('NDVI').mean().rename('NDVI_mean_2023');
var ndviMean2024 = ndvi2024.select('NDVI').mean().rename('NDVI_mean_2024');

// NDVI máximo anual
var ndviMax2023 = ndvi2023.select('NDVI').max().rename('NDVI_max_2023');
var ndviMax2024 = ndvi2024.select('NDVI').max().rename('NDVI_max_2024');

// ============================================
// 5. CALCULAR VARIABLES FORESTALES
// ============================================

// 5.1 Biomasa inicial (B0) basada en NDVI promedio 2023
var B0 = ee.Image(120).multiply(ndviMean2023).add(20)
  .rename('B0')
  .clip(aoi);

// 5.2 Capacidad de carga (K) basada en NDVI máximo 2023
var K = ee.Image(150).multiply(ndviMax2023.divide(0.85))
  .rename('K')
  .clip(aoi);

// 5.3 Tasa de crecimiento (r) entre 2023 y 2024
var r = ndviMean2024.subtract(ndviMean2023)
  .divide(ndviMean2023)
  .rename('r')
  .clip(aoi);

// ============================================
// 6. APLICAR MÁSCARAS
// ============================================

// Máscara de bosque (NDVI > 0.3)
var forestMask = ndviMean2023.gt(0.3);

// Aplicar máscara a todas las variables
var B0_masked = B0.updateMask(forestMask);
var K_masked = K.updateMask(forestMask);
var r_masked = r.updateMask(forestMask);

// Opcional: Máscara de áreas protegidas
// Cargar WDPA (World Database on Protected Areas)
var wdpa = ee.FeatureCollection('WCMC/WDPA/current/polygons')
  .filterBounds(aoi);

// Convertir a imagen binaria
var protectedMask = ee.Image.constant(1)
  .paint(wdpa, 0)
  .clip(aoi)
  .rename('protected_mask');

// Aplicar máscara de áreas protegidas (opcional)
// B0_masked = B0_masked.updateMask(protectedMask);
// K_masked = K_masked.updateMask(protectedMask);
// r_masked = r_masked.updateMask(protectedMask);

// ============================================
// 7. VISUALIZACIÓN
// ============================================

// Paleta de colores para NDVI
var ndviPalette = [
  'FFFFFF', 'CE7E45', 'DF923D', 'F1B555', 'FCD163',
  '99B718', '74A901', '66A000', '529400', '3E8601',
  '207401', '056201', '004C00', '023B01', '012E01',
  '011D01', '011301'
];

// Visualizar NDVI promedio 2023
Map.addLayer(ndviMean2023.clip(aoi), 
  {min: -1, max: 1, palette: ndviPalette}, 
  'NDVI Promedio 2023');

// Visualizar Biomasa Inicial (B0)
Map.addLayer(B0_masked, 
  {min: 0, max: 150, palette: ['brown', 'yellow', 'green']},
  'Biomasa Inicial (B0) - m³/ha');

// Visualizar Capacidad de Carga (K)
Map.addLayer(K_masked,
  {min: 0, max: 300, palette: ['blue', 'cyan', 'yellow', 'red']},
  'Capacidad de Carga (K)');

// Visualizar Tasa de Crecimiento (r)
Map.addLayer(r_masked,
  {min: -0.5, max: 0.5, palette: ['red', 'white', 'green']},
  'Tasa de Crecimiento (r)');

// ============================================
// 8. EXPORTACIÓN
// ============================================

// Configuración de exportación
var exportConfig = {
  scale: 10,
  crs: 'EPSG:32720', // UTM zona 20S para Santa Cruz
  region: aoi,
  maxPixels: 1e9
};

// Exportar Biomasa Inicial
Export.image.toDrive({
  image: B0_masked,
  description: 'B0_SantaCruz_2023',
  folder: 'GEE_Exports',
  fileNamePrefix: 'B0',
  region: aoi,
  scale: exportConfig.scale,
  crs: exportConfig.crs,
  maxPixels: exportConfig.maxPixels
});

// Exportar Capacidad de Carga
Export.image.toDrive({
  image: K_masked,
  description: 'K_SantaCruz_2023',
  folder: 'GEE_Exports',
  fileNamePrefix: 'K',
  region: aoi,
  scale: exportConfig.scale,
  crs: exportConfig.crs,
  maxPixels: exportConfig.maxPixels
});

// Exportar Tasa de Crecimiento
Export.image.toDrive({
  image: r_masked,
  description: 'r_SantaCruz_2023_2024',
  folder: 'GEE_Exports',
  fileNamePrefix: 'r',
  region: aoi,
  scale: exportConfig.scale,
  crs: exportConfig.crs,
  maxPixels: exportConfig.maxPixels
});

// ============================================
// 9. ESTADÍSTICAS RESUMEN
// ============================================

// Calcular estadísticas para el área de estudio
function calculateStats(image, name) {
  var stats = image.reduceRegion({
    reducer: ee.Reducer.mean().combine({
      reducer2: ee.Reducer.stdDev(),
      sharedInputs: true
    }),
    geometry: aoi,
    scale: 100, // Usar escala más gruesa para estadísticas
    maxPixels: 1e9
  });
  
  print('Estadísticas ' + name + ':', stats);
  
  // Agregar al diccionario de propiedades
  return ee.Feature(null, stats);
}

// Calcular estadísticas para cada variable
var statsB0 = calculateStats(B0_masked, 'Biomasa Inicial (B0)');
var statsK = calculateStats(K_masked, 'Capacidad de Carga (K)');
var statsR = calculateStats(r_masked, 'Tasa de Crecimiento (r)');

// ============================================
// 10. INTERFAZ DE USUARIO (UI)
// ============================================

// Crear panel de leyenda
var legend = ui.Panel({
  style: {
    position: 'bottom-left',
    padding: '8px 15px'
  }
});

// Título de leyenda
var legendTitle = ui.Label({
  value: 'Leyenda',
  style: {
    fontWeight: 'bold',
    fontSize: '16px',
    margin: '0 0 4px 0',
    padding: '0'
  }
});

legend.add(legendTitle);

// Función para agregar ítems a la leyenda
function addLegendItem(color, label) {
  var colorBox = ui.Label({
    style: {
      backgroundColor: color,
      padding: '8px',
      margin: '0 0 4px 0'
    }
  });
  
  var description = ui.Label({
    value: label,
    style: {margin: '0 0 4px 6px'}
  });
  
  var legendItem = ui.Panel({
    widgets: [colorBox, description],
    layout: ui.Panel.Layout.Flow('horizontal')
  });
  
  legend.add(legendItem);
}

// Agregar ítems a la leyenda
addLegendItem('#004C00', 'NDVI Alto (>0.6) - Bosque denso');
addLegendItem('#99B718', 'NDVI Medio (0.3-0.6) - Vegetación');
addLegendItem('#CE7E45', 'NDVI Bajo (<0.3) - No bosque');

// Agregar leyenda al mapa
Map.add(legend);

// Panel de información
var infoPanel = ui.Panel({
  widgets: [
    ui.Label('MODELO FORESTAL - SANTA CRUZ', {fontWeight: 'bold'}),
    ui.Label('Período: 2023-2024'),
    ui.Label('Resolución: 10m'),
    ui.Label('Proyección: UTM 20S (EPSG:32720)'),
    ui.Label('Unidades: m³/ha para B0 y K'),
    ui.Label(' ')
  ],
  style: {
    position: 'top-right',
    padding: '10px'
  }
});

Map.add(infoPanel);

print('Script ejecutado exitosamente!');
print('Las exportaciones se han programado en la pestaña "Tasks"');