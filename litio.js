// ====================================================================
// ANÁLISIS COMPLETO DE INDUSTRIALIZACIÓN DEL LITIO - SALAR DE UYUNI
// Google Earth Engine - JavaScript
// ====================================================================

// 1. CONFIGURACIÓN INICIAL
// ====================================================================

// Definir área de estudio: Salar de Uyuni, Bolivia
var salarUyuni = ee.FeatureCollection('projects/eddycc66/assets/area111111');

// Centrar mapa en el área de estudio
Map.centerObject(salarUyuni, 9);
Map.addLayer(salarUyuni, {color: 'red'}, 'Área de estudio: Salar de Uyuni');

// 2. CARGA DE DATOS SATELITALES
// ====================================================================

// 2.1 Sentinel-2 para análisis de agua/salmueras
var sentinel2 = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
  .filterBounds(salarUyuni)
  .filterDate('2020-01-01', '2023-12-31')
  .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 20))
  .select(['B3', 'B8']);

// 2.2 MODIS para temperatura superficial
var modisLST = ee.ImageCollection('MODIS/061/MOD11A1')
  .filterBounds(salarUyuni)
  .filterDate('2020-01-01', '2023-12-31')
  .select('LST_Day_1km');

// 2.3 MODIS para evapotranspiración
var modisET = ee.ImageCollection('MODIS/006/MOD16A2')
  .filterBounds(salarUyuni)
  .filterDate('2020-01-01', '2023-12-31')
  .select('ET');

// 3. PROCESAMIENTO Y CÁLCULO DE VARIABLES
// ====================================================================

// 3.1 Calcular NDWI (Índice Diferencial de Agua Normalizado)
function calcularNDWI(image) {
  var ndwi = image.normalizedDifference(['B3', 'B8']).rename('NDWI');
  return image.addBands(ndwi);
}

var sentinel2ConNDWI = sentinel2.map(calcularNDWI);

// 3.2 Convertir temperatura de Kelvin a Celsius
function convertirLST(image) {
  var lstCelsius = image.multiply(0.02).subtract(273.15).rename('LST_Celsius');
  return image.addBands(lstCelsius);
}

var modisLSTcelsius = modisLST.map(convertirLST);

// 3.3 Calcular promedios anuales
var ndwiPromedio = sentinel2ConNDWI.select('NDWI').mean().clip(salarUyuni);
var lstPromedio = modisLSTcelsius.select('LST_Celsius').mean().clip(salarUyuni);
var etPromedio = modisET.select('ET').mean().clip(salarUyuni);

// 4. VISUALIZACIÓN EN EL MAPA
// ====================================================================

// Configurar paletas de colores
var paletaNDWI = ['red', 'yellow', 'green', 'blue'];
var paletaLST = ['blue', 'cyan', 'green', 'yellow', 'red'];
var paletaET = ['white', 'cyan', 'blue', 'purple'];

// Añadir capas al mapa
Map.addLayer(ndwiPromedio, {min: -0.5, max: 0.5, palette: paletaNDWI}, 'NDWI - Agua/Salmueras');
Map.addLayer(lstPromedio, {min: 0, max: 30, palette: paletaLST}, 'Temperatura (°C)');
Map.addLayer(etPromedio, {min: 0, max: 300, palette: paletaET}, 'Evapotranspiración');

// 5. EXTRACCIÓN DE VALORES PARA EL MODELO
// ====================================================================

// Función para extraer valores promedio de la región
function extraerValoresRegion(imagen, banda) {
  var estadisticas = imagen.reduceRegion({
    reducer: ee.Reducer.mean(),
    geometry: salarUyuni,
    scale: 1000,
    maxPixels: 1e9
  });
  return estadisticas.get(banda);
}

// Extraer valores ambientales
var ndwiValor = extraerValoresRegion(ndwiPromedio, 'NDWI');
var lstValor = extraerValoresRegion(lstPromedio, 'LST_Celsius');
var etValor = extraerValoresRegion(etPromedio, 'ET');

// Imprimir valores
print('Valores ambientales extraídos:');
print('NDWI (agua/salmueras):', ndwiValor);
print('Temperatura (°C):', lstValor);
print('Evapotranspiración:', etValor);

// 6. CONSTRUCCIÓN DE SERIES TEMPORALES
// ====================================================================

// Función para crear serie temporal mensual
function crearSerieMensual(coleccion, banda, nombre) {
  var listaMeses = ee.List.sequence(1, 12);
  var listaAños = ee.List.sequence(2020, 2023);
  
  var serie = ee.ImageCollection.fromImages(
    listaAños.map(function(año) {
      return listaMeses.map(function(mes) {
        var inicio = ee.Date.fromYMD(año, mes, 1);
        var fin = inicio.advance(1, 'month');
        
        var imagenMensual = coleccion
          .filterDate(inicio, fin)
          .mean()
          .set({
            'year': año,
            'month': mes,
            'system:time_start': inicio.millis()
          });
        
        return imagenMensual;
      });
    }).flatten()
  );
  
  return serie.select([banda], [nombre]);
}

// Crear series temporales
var serieNDWI = crearSerieMensual(sentinel2ConNDWI, 'NDWI', 'NDWI');
var serieLST = crearSerieMensual(modisLSTcelsius, 'LST_Celsius', 'LST');
var serieET = crearSerieMensual(modisET, 'ET', 'ET');

// 7. GRÁFICOS DE SERIES TEMPORALES
// ====================================================================

// Gráfico de NDWI
var chartNDWI = ui.Chart.image.series({
  imageCollection: serieNDWI,
  region: salarUyuni,
  reducer: ee.Reducer.mean(),
  scale: 1000
}).setOptions({
  title: 'Serie Temporal NDWI - Salar de Uyuni',
  vAxis: {title: 'NDWI'},
  hAxis: {title: 'Fecha'},
  lineWidth: 2,
  colors: ['blue']
});

// Gráfico de temperatura
var chartLST = ui.Chart.image.series({
  imageCollection: serieLST,
  region: salarUyuni,
  reducer: ee.Reducer.mean(),
  scale: 1000
}).setOptions({
  title: 'Serie Temporal Temperatura - Salar de Uyuni',
  vAxis: {title: 'Temperatura (°C)'},
  hAxis: {title: 'Fecha'},
  lineWidth: 2,
  colors: ['red']
});

// Mostrar gráficos
print(chartNDWI);
print(chartLST);

// 8. MODELO DINÁMICO DE PRODUCCIÓN DE LITIO
// ====================================================================

// Parámetros del modelo (valores de ejemplo)
var parametros = {
  // Capacidades productivas
  capacidadExtraccion: 100000,  // ton/año
  eficienciaExtraccion: 0.8,
  concentracionLi: 0.15,        // 0.15%
  
  // Factores económicos
  precioCarbonatoLi: 20000,     // USD/ton
  precioBateriasLi: 150000,     // USD/ton
  costoExtraccion: 5000,        // USD/ton
  
  // Inversión requerida
  inversionIndustrializacion: 500000000,  // USD
  
  // Factores ambientales (se actualizarán con datos satelitales)
  factorNDWI: 0,
  factorTemperatura: 0,
  factorEvaporacion: 0
};

// Obtener valores reales de los factores ambientales
parametros.factorNDWI = ee.Number(ndwiValor).add(0.5).getInfo();
parametros.factorTemperatura = ee.Number(lstValor).divide(30).getInfo();
parametros.factorEvaporacion = ee.Number(etValor).divide(300).getInfo();

// Asegurar que los factores estén en rango [0, 1]
parametros.factorNDWI = Math.max(0, Math.min(1, parametros.factorNDWI));
parametros.factorTemperatura = Math.max(0, Math.min(1, parametros.factorTemperatura));
parametros.factorEvaporacion = Math.max(0, Math.min(1, parametros.factorEvaporacion));

print('Factores ambientales normalizados:');
print('Factor NDWI:', parametros.factorNDWI);
print('Factor Temperatura:', parametros.factorTemperatura);
print('Factor Evaporación:', parametros.factorEvaporacion);

// 9. FUNCIÓN DEL MODELO DINÁMICO
// ====================================================================

function calcularProduccionAnual(año, escenario) {
  // Ecuación en diferencias para la producción
  var extraccionBase = parametros.capacidadExtraccion * 
    parametros.factorEvaporacion * 
    parametros.factorTemperatura;
  
  var litioExtraido = extraccionBase * 
    parametros.concentracionLi * 
    parametros.eficienciaExtraccion;
  
  // Resultados base
  var resultado = {
    año: año,
    litioExtraido: litioExtraido,
    extraccionBase: extraccionBase
  };
  
  // Escenarios de industrialización
  if (escenario === 'materiaPrima') {
    // Exportación de carbonato de litio
    resultado.ingresos = litioExtraido * parametros.precioCarbonatoLi;
    resultado.costos = litioExtraido * parametros.costoExtraccion;
    resultado.ganancia = resultado.ingresos - resultado.costos;
    resultado.empleos = litioExtraido * 0.01;  // 1 empleo por cada 100 ton
    resultado.rentaTecnologica = 1.0;  // Índice base
    resultado.valorAgregado = resultado.ganancia;
    
  } else if (escenario === 'industrializacion') {
    // Producción local de baterías
    var factorEscala = Math.min(1, año / 5);  // Curva de aprendizaje
    
    resultado.ingresos = litioExtraido * parametros.precioBateriasLi * factorEscala;
    resultado.costos = litioExtraido * parametros.costoExtraccion * 1.5 + 
                      (parametros.inversionIndustrializacion / 10);
    resultado.ganancia = resultado.ingresos - resultado.costos;
    resultado.empleos = litioExtraido * 0.05 * factorEscala;  // 5 empleos por cada 100 ton
    resultado.rentaTecnologica = 3.0 * factorEscala;  // Mayor valor tecnológico
    resultado.valorAgregado = resultado.ganancia * 1.5;
  }
  
  // Impactos ambientales
  resultado.consumoAgua = litioExtraido * 500;  // m³ por tonelada
  resultado.emisionesCO2 = litioExtraido * (escenario === 'materiaPrima' ? 5 : 8);
  resultado.impactoAmbiental = resultado.consumoAgua * 0.001 + resultado.emisionesCO2 * 0.1;
  
  return resultado;
}

// 10. SIMULACIÓN DE ESCENARIOS
// ====================================================================

// Simular 10 años de producción
var añosSimulacion = 10;
var resultadosMP = [];  // Materia prima
var resultadosIN = [];  // Industrialización

for (var año = 1; año <= añosSimulacion; año++) {
  resultadosMP.push(calcularProduccionAnual(año, 'materiaPrima'));
  resultadosIN.push(calcularProduccionAnual(año, 'industrializacion'));
}

// 11. CÁLCULO DE INDICADORES
// ====================================================================

function calcularIndicadores(resultados) {
  var indicadores = {
    gananciaTotal: 0,
    empleosTotales: 0,
    rentaTecnologicaPromedio: 0,
    litioTotal: 0,
    impactoAmbientalTotal: 0
  };
  
  resultados.forEach(function(r) {
    indicadores.gananciaTotal += r.ganancia;
    indicadores.empleosTotales += r.empleos;
    indicadores.rentaTecnologicaPromedio += r.rentaTecnologica;
    indicadores.litioTotal += r.litioExtraido;
    indicadores.impactoAmbientalTotal += r.impactoAmbiental;
  });
  
  indicadores.rentaTecnologicaPromedio /= resultados.length;
  indicadores.gananciaPorTonelada = indicadores.gananciaTotal / indicadores.litioTotal;
  
  return indicadores;
}

var indicadoresMP = calcularIndicadores(resultadosMP);
var indicadoresIN = calcularIndicadores(resultadosIN);

// 12. VISUALIZACIÓN DE RESULTADOS
// ====================================================================

print('\n=== RESULTADOS DE SIMULACIÓN (10 AÑOS) ===\n');

print('ESCENARIO: MATERIA PRIMA');
print('Ganancia Total: $' + (indicadoresMP.gananciaTotal / 1e6).toFixed(2) + ' M USD');
print('Empleos Generados: ' + Math.round(indicadoresMP.empleosTotales));
print('Renta Tecnológica: ' + indicadoresMP.rentaTecnologicaPromedio.toFixed(2));
print('Litio Extraído: ' + Math.round(indicadoresMP.litioTotal) + ' ton');
print('Impacto Ambiental: ' + indicadoresMP.impactoAmbientalTotal.toFixed(2));

print('\nESCENARIO: INDUSTRIALIZACIÓN');
print('Ganancia Total: $' + (indicadoresIN.gananciaTotal / 1e6).toFixed(2) + ' M USD');
print('Empleos Generados: ' + Math.round(indicadoresIN.empleosTotales));
print('Renta Tecnológica: ' + indicadoresIN.rentaTecnologicaPromedio.toFixed(2));
print('Litio Extraído: ' + Math.round(indicadoresIN.litioTotal) + ' ton');
print('Impacto Ambiental: ' + indicadoresIN.impactoAmbientalTotal.toFixed(2));

// 13. GRÁFICOS COMPARATIVOS
// ====================================================================

// Crear tabla de datos para gráfico de ganancias
var datosGananciasArray = [['Año', 'Materia Prima', 'Industrialización']];
for (var i = 0; i < añosSimulacion; i++) {
  datosGananciasArray.push([
    'Año ' + (i + 1),
    resultadosMP[i].ganancia / 1e6,
    resultadosIN[i].ganancia / 1e6
  ]);
}

var chartGanancias = ui.Chart(datosGananciasArray)
  .setChartType('LineChart')
  .setOptions({
    title: 'Evolución de Ganancias por Escenario',
    hAxis: {title: 'Año'},
    vAxis: {title: 'Ganancia (Millones USD)'},
    lineWidth: 3,
    colors: ['orange', 'green']
  });

// Crear tabla de datos para gráfico de empleos
var datosEmpleosArray = [['Año', 'Materia Prima', 'Industrialización']];
for (var i = 0; i < añosSimulacion; i++) {
  datosEmpleosArray.push([
    'Año ' + (i + 1),
    resultadosMP[i].empleos,
    resultadosIN[i].empleos
  ]);
}

var chartEmpleos = ui.Chart(datosEmpleosArray)
  .setChartType('ColumnChart')
  .setOptions({
    title: 'Empleos Generados por Escenario',
    hAxis: {title: 'Año'},
    vAxis: {title: 'Número de Empleos'},
    isStacked: false,
    colors: ['orange', 'green']
  });

print('\nGráficos Comparativos:');
print(chartGanancias);
print(chartEmpleos);

// 14. ANÁLISIS DE SOSTENIBILIDAD
// ====================================================================

print('\n=== ANÁLISIS DE SOSTENIBILIDAD ===\n');

// Calcular índices de sostenibilidad
function calcularSostenibilidad(indicadores) {
  var sostenibilidad = {
    economica: indicadores.gananciaPorTonelada / 10000,
    social: indicadores.empleosTotales / 1000,
    ambiental: 1 / (indicadores.impactoAmbientalTotal / 100),
    tecnologica: indicadores.rentaTecnologicaPromedio / 3
  };
  
  // Normalizar a escala 0-1
  Object.keys(sostenibilidad).forEach(function(key) {
    sostenibilidad[key] = Math.min(1, Math.max(0, sostenibilidad[key]));
  });
  
  sostenibilidad.total = (sostenibilidad.economica + 
                         sostenibilidad.social + 
                         sostenibilidad.ambiental + 
                         sostenibilidad.tecnologica) / 4;
  
  return sostenibilidad;
}

var sostenibilidadMP = calcularSostenibilidad(indicadoresMP);
var sostenibilidadIN = calcularSostenibilidad(indicadoresIN);

print('Índice de Sostenibilidad - Materia Prima:');
print('  Económica: ' + sostenibilidadMP.economica.toFixed(3));
print('  Social: ' + sostenibilidadMP.social.toFixed(3));
print('  Ambiental: ' + sostenibilidadMP.ambiental.toFixed(3));
print('  Tecnológica: ' + sostenibilidadMP.tecnologica.toFixed(3));
print('  TOTAL: ' + sostenibilidadMP.total.toFixed(3));

print('\nÍndice de Sostenibilidad - Industrialización:');
print('  Económica: ' + sostenibilidadIN.economica.toFixed(3));
print('  Social: ' + sostenibilidadIN.social.toFixed(3));
print('  Ambiental: ' + sostenibilidadIN.ambiental.toFixed(3));
print('  Tecnológica: ' + sostenibilidadIN.tecnologica.toFixed(3));
print('  TOTAL: ' + sostenibilidadIN.total.toFixed(3));

// 15. RECOMENDACIONES DE POLÍTICA PÚBLICA
// ====================================================================

print('\n=== RECOMENDACIONES ESTRATÉGICAS ===\n');

// Análisis comparativo
var ventajaIndustrializacion = sostenibilidadIN.total - sostenibilidadMP.total;

if (ventajaIndustrializacion > 0.1) {
  print('RECOMENDACIÓN PRINCIPAL: Avanzar con estrategia de industrialización');
  print('• Justificación: Mayor valor agregado y renta tecnológica');
  print('• Beneficios esperados:');
  if (sostenibilidadMP.economica > 0) {
    print('  - Incremento del ' + ((sostenibilidadIN.economica/sostenibilidadMP.economica - 1)*100).toFixed(0) + '% en sostenibilidad económica');
  }
  if (sostenibilidadMP.social > 0) {
    print('  - Incremento del ' + ((sostenibilidadIN.social/sostenibilidadMP.social - 1)*100).toFixed(0) + '% en sostenibilidad social');
  }
  if (sostenibilidadMP.tecnologica > 0) {
    print('  - Incremento del ' + ((sostenibilidadIN.tecnologica/sostenibilidadMP.tecnologica - 1)*100).toFixed(0) + '% en renta tecnológica');
  }
} else if (ventajaIndustrializacion > 0) {
  print('RECOMENDACIÓN: Transición gradual hacia industrialización');
  print('• Implementar en fases para mitigar riesgos');
  print('• Desarrollar capacidades técnicas locales primero');
} else {
  print('RECOMENDACIÓN: Optimizar extracción antes de industrializar');
  print('• Mejorar eficiencia en procesos de extracción');
  print('• Reducir impacto ambiental actual');
}

// 16. RELACIÓN CON OBJETIVOS DE DESARROLLO SOSTENIBLE (ODS)
// ====================================================================

print('\n=== CONTRIBUCION A LOS ODS ===\n');

print('ODS 7 - Energía asequible y no contaminante:');
print('• Producción de baterías para energías renovables');

print('\nODS 8 - Trabajo decente y crecimiento económico:');
print('• Generación de empleo: ' + Math.round(indicadoresIN.empleosTotales) + ' empleos estimados');
print('• Desarrollo económico local');

print('\nODS 9 - Industria, innovación e infraestructura:');
print('• Índice de renta tecnológica: ' + indicadoresIN.rentaTecnologicaPromedio.toFixed(2));
print('• Transferencia tecnológica');

print('\nODS 12 - Producción y consumo responsables:');
print('• Consumo de agua: ' + (indicadoresIN.litioTotal * 500 / 1000).toFixed(0) + ' millones de m³');
print('• Emisiones CO2: ' + (indicadoresIN.litioTotal * 8 / 1000).toFixed(0) + ' mil toneladas');

print('\nODS 13 - Acción por el clima:');
print('• Contribución a movilidad eléctrica');
print('• Reducción de huella de carbono en cadena de valor');

// 17. EXPORTACIÓN DE RESULTADOS (OPCIONAL)
// ====================================================================

print('\n=== EXPORTACIÓN DE RESULTADOS ===\n');

// Exportar imagen de NDWI
Export.image.toDrive({
  image: ndwiPromedio,
  description: 'NDWI_SalarUyuni',
  scale: 100,
  region: salarUyuni,
  maxPixels: 1e9,
  fileFormat: 'GeoTIFF'
});

print('Proceso de exportación configurado.');
print('Para ejecutar las exportaciones, ve a la pestaña "Tasks" y haz clic en "Run".');

// 18. MENSAJE FINAL
// ====================================================================

print('\n=== ANÁLISIS COMPLETADO ===\n');
print('Este análisis integra:');
print('1. Datos satelitales reales (Sentinel-2, MODIS)');
print('2. Variables ambientales clave para producción de litio');
print('3. Modelo dinámico de ecuaciones en diferencias');
print('4. Simulación de escenarios de industrialización');
print('5. Evaluación de sostenibilidad y ODS');
print('\nLos resultados proporcionan base científica para decisiones estratégicas.');

// ====================================================================
// FIN DEL CÓDIGO
// ====================================================================
